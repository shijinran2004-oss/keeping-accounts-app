package com.shijinran.money.capture;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.database.ContentObserver;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.benjaminwan.ocrlibrary.OcrResult;
import com.benjaminwan.ocrlibrary.TextBlock;
import com.shijinran.money.MainActivity;
import com.shijinran.money.R;
import com.shijinran.money.ocr.OcrEngineHolder;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 截图监听：前台服务里挂一个 MediaStore 观察者，发现新截图就本地识别一次。
 * 只有认出金额才发通知；通知点开才进记账页，绝不自动写库。
 */
public class ScreenshotWatchService extends Service {

    static final String CHANNEL_WATCH = "screenshot_watch";
    // 渠道创建后重要性不能再改；换 id 才能让 1.4.4 的高优先级（顶部横幅）真正生效
    static final String CHANNEL_FOUND = "screenshot_found_v2";
    private static final String CHANNEL_FOUND_LEGACY = "screenshot_found";
    static final int FOREGROUND_ID = 4101;
    static final int NOTIFY_FOUND_ID = 4301;
    /** 通知按钮带出来的东西：金额（分）与整段识别文字，前端拿去做正式解析 */
    static final String EXTRA_AMOUNT = "capture_amount";
    static final String EXTRA_TEXT = "capture_text";
    static final String EXTRA_PATH = "capture_path";
    static volatile boolean running = false;

    private static final String TAG = "SnoopyCapture";
    private static final int MAX_SIDE = 1280;
    private static final long HISTORY_GUARD_MS = 10_000L;
    /** 连拍多张时，8 秒内不再重复振动/响铃，只更新同一条通知 */
    private static final long QUIET_VIBRATE_MS = 8_000L;
    private static final String GROUP_WATCH = "watch";
    private static final String GROUP_FOUND = "found";

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    /** 一次截图会触发好几次 onChange，扫一遍就够，别把队列塞满。 */
    private final AtomicBoolean scanScheduled = new AtomicBoolean(false);
    private ContentObserver observer;
    private long startedAt;

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        startedAt = System.currentTimeMillis();
        createChannels();
        startForegroundCompat();
        primeCursor();
        registerObserver();
        io.execute(() -> {
            // 先把 OCR 模型加载好，第一张截图就不用等初始化
            OcrEngineHolder.warmUp(this);
            requestScan();
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (observer == null) registerObserver();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (observer != null) {
            try {
                getContentResolver().unregisterContentObserver(observer);
            } catch (Throwable ignored) {
            }
            observer = null;
        }
        io.shutdownNow();
        super.onDestroy();
    }

    private void startForegroundCompat() {
        Notification notice = new NotificationCompat.Builder(this, CHANNEL_WATCH)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("截图记账已开启")
                .setContentText("截屏后弹出通知，点「直接记一笔」马上入账")
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                // 单独一个 group：系统就不会把它和「识别到 ¥X」折叠成一个分组
                .setGroup(GROUP_WATCH)
                .setContentIntent(openApp(null, 10))
                .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(FOREGROUND_ID, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(FOREGROUND_ID, notice);
        }
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel watch = new NotificationChannel(
                CHANNEL_WATCH, "截图记账", NotificationManager.IMPORTANCE_MIN);
        watch.setDescription("保持截图监听时显示的常驻通知");
        watch.setShowBadge(false);
        nm.createNotificationChannel(watch);
        // IMPORTANCE_HIGH 才会像 QQ 消息那样从顶部弹出来
        // 老渠道是默认重要性，留着也不会再弹横幅，直接删掉
        nm.deleteNotificationChannel(CHANNEL_FOUND_LEGACY);
        NotificationChannel found = new NotificationChannel(
                CHANNEL_FOUND, "截图记账提醒", NotificationManager.IMPORTANCE_HIGH);
        found.setDescription("截图里认出金额时提醒你确认记账");
        found.enableVibration(true);
        found.setShowBadge(true);
        nm.createNotificationChannel(found);
    }

    private void registerObserver() {
        observer = new ContentObserver(new Handler(Looper.getMainLooper())) {
            @Override
            public void onChange(boolean selfChange, Uri uri) {
                Log.d(TAG, "observer change " + uri);
                requestScan();
            }
        };
        getContentResolver().registerContentObserver(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, observer);
    }

    /**
     * 用 DATE_ADDED 当游标，而不是 _ID：
     * 实测媒体库会回收被删掉的 _ID（新截图拿到比最大 ID 更小的号），
     * 只要按「_ID > 上次的 ID」去查，就会永远漏掉那张截图。
     */
    private boolean scanNewShots() {
        long nowSec = System.currentTimeMillis() / 1000L;
        long lastSeen = CaptureStore.lastSeenAt(this);
        // 第一次跑、或者系统时间被往回调过，就从现在开始，别去翻旧账
        if (lastSeen <= 0 || lastSeen > nowSec + 60) {
            lastSeen = nowSec;
            CaptureStore.setLastSeenAt(this, lastSeen);
        }
        Set<Long> seen = CaptureStore.seenIds(this);
        int handled = 0;
        ContentResolver resolver = getContentResolver();
        String[] projection = new String[] {
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.DISPLAY_NAME,
        };
        String selection = MediaStore.Images.Media.DATE_ADDED + " >= ?";
        String[] args = new String[] { String.valueOf(lastSeen) };
        String order = MediaStore.Images.Media.DATE_ADDED + " ASC, "
                + MediaStore.Images.Media._ID + " ASC";
        Cursor cursor = null;
        try {
            cursor = resolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    projection, selection, args, order);
            if (cursor == null) return false;
            int idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
            int dateCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED);
            int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
            while (cursor.moveToNext() && !io.isShutdown()) {
                long id = cursor.getLong(idCol);
                long addedSec = cursor.getLong(dateCol);
                String name = cursor.getString(nameCol);
                if (seen.contains(id)) continue;
                // 同一秒内可能有第二张截图，先记下来再判断，下次不会再重复处理
                CaptureStore.addSeenId(this, id);
                if (addedSec > lastSeen) {
                    lastSeen = addedSec;
                    CaptureStore.setLastSeenAt(this, lastSeen);
                }
                long addedMs = addedSec * 1000L;
                if (addedMs < startedAt - HISTORY_GUARD_MS) continue;
                if (!looksLikeScreenshot(name)) continue;
                handleShot(id);
                handled++;
            }
        } catch (Throwable t) {
            Log.w(TAG, "scan failed", t);
        } finally {
            if (cursor != null) cursor.close();
        }
        if (handled > 0) Log.d(TAG, "scanned " + handled + " new shot(s)");
        return handled > 0;
    }

    private void requestScan() {
        if (!scanScheduled.compareAndSet(false, true)) return;
        scheduleScan(0);
    }

    /** MediaStore 的插入偶尔比系统广播晚一点，第一次没扫到就再试几次。 */
    private void scheduleScan(int attempt) {
        io.execute(() -> {
            if (io.isShutdown()) {
                scanScheduled.set(false);
                return;
            }
            if (scanNewShots()) {
                scanScheduled.set(false);
                // 扫的过程中可能又来了新截图，顺手再看一眼（纯查询，很便宜）
                requestScan();
                return;
            }
            if (attempt >= 10) {
                scanScheduled.set(false);
                return;
            }
            // 头一次先等 200ms（媒体库写入通常不到一秒），之后每 400ms 再试，最多等 4 秒
            long delay = attempt == 0 ? 200L : 400L;
            new Handler(Looper.getMainLooper()).postDelayed(() -> scheduleScan(attempt + 1), delay);
        });
    }

    private void cancelFoundNotice() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIFY_FOUND_ID);
        } catch (Throwable ignored) {
        }
    }

    /** 第一次开启时先记下当前时间与最大的 _ID，避免把以前的截图全部过一遍。 */
    private void primeCursor() {
        if (CaptureStore.lastSeenAt(this) <= 0) {
            CaptureStore.setLastSeenAt(this, System.currentTimeMillis() / 1000L);
        }
        if (CaptureStore.lastId(this) > 0) return;
        io.execute(() -> {
            Cursor cursor = null;
            try {
                cursor = getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                        new String[] { MediaStore.Images.Media._ID }, null, null,
                        MediaStore.Images.Media._ID + " DESC");
                if (cursor != null && cursor.moveToFirst()) {
                    CaptureStore.setLastId(this, cursor.getLong(0));
                }
            } catch (Throwable t) {
                Log.w(TAG, "primeCursor failed: " + t);
            } finally {
                if (cursor != null) cursor.close();
            }
        });
    }

    private boolean looksLikeScreenshot(String name) {
        if (name == null) return false;
        String lower = name.toLowerCase();
        return lower.contains("screenshot") || lower.contains("screen_shot") || lower.contains("截屏")
                || lower.contains("截图");
    }

    private void handleShot(long id) {
        long begin = System.currentTimeMillis();
        Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
        File saved = null;
        try {
            Bitmap bitmap = decode(uri, MAX_SIDE);
            if (bitmap == null) {
                Log.w(TAG, "decode failed " + uri);
                return;
            }
            saved = saveCache(bitmap, id);
            if (saved == null) {
                Log.w(TAG, "cache write failed " + id);
                return;
            }
            CaptureStore.setPendingPath(this, saved.getAbsolutePath());
            CaptureStore.setPendingSource(this, "screenshot");
            OcrShot shot = ocrShot(bitmap);
            String amount = shot == null ? null : shot.amount;
            if (amount == null) {
                // 聊天、网页之类没有金额的截图，静默跳过
                saved.delete();
                CaptureStore.clearPendingPath(this);
                // 上一条提醒指向的截图已经被这次覆盖掉了，留着点开只会是空弹层，直接收走
                cancelFoundNotice();
                Log.d(TAG, "skip id=" + id + " no amount in " + (System.currentTimeMillis() - begin) + "ms");
                return;
            }
            notifyFound(amount, saved.getAbsolutePath(), shot.text);
            Log.d(TAG, "handled id=" + id + " ¥" + amount + " in " + (System.currentTimeMillis() - begin) + "ms");
            CaptureStore.setLastNoticeAt(this, System.currentTimeMillis());
        } catch (Throwable t) {
            Log.w(TAG, "handleShot failed: " + id, t);
            if (saved != null) saved.delete();
            CaptureStore.clearPendingPath(this);
        }
    }

    private Bitmap decode(Uri uri, int maxSide) {
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            if (input == null) return null;
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeStream(input, null, bounds);
            int longest = Math.max(bounds.outWidth, bounds.outHeight);
            int sample = 1;
            while (longest / sample > maxSide * 2) sample *= 2;
            try (InputStream second = getContentResolver().openInputStream(uri)) {
                if (second == null) return null;
                BitmapFactory.Options opts = new BitmapFactory.Options();
                opts.inSampleSize = sample;
                // 必须是软件位图：HARDWARE 位图取像素为空，OCR 会一个字都认不出来
                opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
                Bitmap raw = BitmapFactory.decodeStream(second, null, opts);
                if (raw == null) return null;
                int side = Math.max(raw.getWidth(), raw.getHeight());
                if (side <= maxSide) return raw;
                float ratio = maxSide / (float) side;
                Bitmap scaled = Bitmap.createScaledBitmap(raw,
                        Math.max(1, Math.round(raw.getWidth() * ratio)),
                        Math.max(1, Math.round(raw.getHeight() * ratio)), true);
                if (scaled != raw) raw.recycle();
                return scaled;
            }
        } catch (Throwable t) {
            return null;
        }
    }

    private File saveCache(Bitmap bitmap, long id) {
        try {
            File dir = new File(getCacheDir(), "captures");
            if (!dir.exists() && !dir.mkdirs()) return null;
            prune(dir);
            File out = new File(dir, "shot-" + id + "-" + System.currentTimeMillis() + ".jpg");
            try (OutputStream stream = new FileOutputStream(out)) {
                bitmap.compress(Bitmap.CompressFormat.JPEG, 92, stream);
            }
            return out;
        } catch (Throwable t) {
            return null;
        }
    }

    private void prune(File dir) {
        File[] files = dir.listFiles();
        if (files == null || files.length < 5) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (int i = 0; i < files.length - 4; i++) files[i].delete();
    }

    /** 一次识别拿两样东西：够不够格提醒（金额），以及交给前端正式解析的原文。 */
    private static final class OcrShot {
        final String amount;
        final String text;

        OcrShot(String amount, String text) {
            this.amount = amount;
            this.text = text == null ? "" : text;
        }
    }

    private OcrShot ocrShot(Bitmap bitmap) {
        try {
            Bitmap box = Bitmap.createBitmap(bitmap.getWidth(), bitmap.getHeight(), Bitmap.Config.ARGB_8888);
            OcrResult result = OcrEngineHolder.detect(getApplicationContext(), bitmap, box, MAX_SIDE);
            StringBuilder text = new StringBuilder();
            if (result != null && result.getTextBlocks() != null) {
                for (TextBlock block : result.getTextBlocks()) {
                    if (block != null && block.getText() != null) text.append(block.getText()).append('\n');
                }
            }
            String raw = text.toString();
            return new OcrShot(guessAmount(raw), raw);
        } catch (Throwable t) {
            return null;
        }
    }

    /** 只用来判断「值不值得提醒」，正式解析仍在 src/lib/ocr 里做。 */
    private String guessAmount(String text) {
        List<Pattern> patterns = new ArrayList<>();
        // 先找真正的「付了多少」，再退到合计/总额；收据里合计常常大于实付
        patterns.add(Pattern.compile("(?:实付|实收|支付金额|付款金额|消费金额|交易金额|实付款)[^0-9]{0,8}[¥￥]?\\s*([0-9]{1,7}(?:\\.[0-9]{1,2})?)"));
        patterns.add(Pattern.compile("(?:合计|总计|总金额|应收|本次消费)[^0-9]{0,8}[¥￥]?\\s*([0-9]{1,7}(?:\\.[0-9]{1,2})?)"));
        patterns.add(Pattern.compile("[¥￥]\\s*([0-9]{1,7}(?:\\.[0-9]{1,2})?)"));
        patterns.add(Pattern.compile("(?<![0-9])([0-9]{1,7}\\.[0-9]{2})(?![0-9])"));
        for (Pattern pattern : patterns) {
            Matcher matcher = pattern.matcher(text);
            if (matcher.find()) {
                String value = matcher.group(1);
                if (value != null) return value;
            }
        }
        return null;
    }

    /**
     * 认到金额就发一条能直接操作的通知：系统会把它当成高优先级消息从顶部弹出来，
     * 卡片上带「确认记录」「取消」两个按钮，不用先切回 App。
     */
    private void notifyFound(String amount, String path, String ocrText) {
        String text = "点「直接记一笔」马上入账，点「取消」忽略这张截图";
        // 连续截好几张时，只有第一条振动，避免口袋里的手机连震一串
        boolean vibrate = System.currentTimeMillis() - CaptureStore.lastNoticeAt(this) > QUIET_VIBRATE_MS;
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_FOUND)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("识别到 ¥" + amount)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setGroup(GROUP_FOUND)
                .setDefaults(vibrate ? NotificationCompat.DEFAULT_VIBRATE : 0)
                .setSilent(!vibrate)
                .setAutoCancel(true)
                // 点通知本身还是进 App 看/改；点按钮则完全留在后台
                .setContentIntent(openApp(path, 11))
                .addAction(0, "直接记一笔", recordIntent(amount, path, ocrText))
                .addAction(0, "取消", cancelIntent(13));
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            // 固定 id：新截图直接替换上一条，通知栏不会堆一串旧提醒
            if (nm != null) nm.notify(NOTIFY_FOUND_ID, builder.build());
        } catch (Throwable ignored) {
        }
    }

    /** 「直接记一笔」：把金额和原文交给接收器排队，不需要把 App 拉到前台。 */
    private PendingIntent recordIntent(String amount, String path, String text) {
        Intent intent = new Intent(this, CaptureCancelReceiver.class);
        intent.setAction(CaptureCancelReceiver.ACTION_RECORD);
        intent.putExtra(EXTRA_AMOUNT, centsOf(amount));
        intent.putExtra(EXTRA_TEXT, text);
        intent.putExtra(EXTRA_PATH, path);
        return PendingIntent.getBroadcast(this, 12, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** "28.20" → 2820，交给前端时统一按分算 */
    static long centsOf(String amount) {
        if (amount == null || amount.isEmpty()) return 0L;
        try {
            return new java.math.BigDecimal(amount)
                    .movePointRight(2)
                    .setScale(0, java.math.RoundingMode.HALF_UP)
                    .longValue();
        } catch (Throwable t) {
            return 0L;
        }
    }

    /** 「取消」按钮：把待确认的截图丢掉，再把通知收起来 */
    private PendingIntent cancelIntent(int requestCode) {
        Intent intent = new Intent(this, CaptureCancelReceiver.class);
        intent.setAction(CaptureCancelReceiver.ACTION_CANCEL);
        return PendingIntent.getBroadcast(this, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent openApp(String path, int requestCode) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (path != null) intent.putExtra(CapturePlugin.EXTRA_PENDING, path);
        return PendingIntent.getActivity(this, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
