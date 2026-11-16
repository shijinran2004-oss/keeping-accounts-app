package com.shijinran.money.capture;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ContentResolver;
import android.content.Context;
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
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.benjaminwan.ocrlibrary.OcrResult;
import com.shijinran.money.MainActivity;
import com.shijinran.money.R;
import com.shijinran.money.ocr.OcrEngineHolder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 截图监听：前台服务里挂一个 MediaStore 观察者。
 *
 * 扫描和识别分成两个线程：扫描线程只管查「有没有新图」，查到就丢给识别线程排隊；
 * 识别线程串行跑 OCR（模型只允许一个实例），一张接一张接上，不会互相抢开关。
 * 每张认出金额的截图各自入队、各自一条通知，都能单独「直接记一笔」。
 */
public class ScreenshotWatchService extends Service {

    static final String CHANNEL_WATCH = "screenshot_watch";
    // 渠道创建后重要性不能再改；换 id 才能让 1.4.4 的高优先级（顶部横幅）真正生效
    static final String CHANNEL_FOUND = "screenshot_found_v2";
    private static final String CHANNEL_FOUND_LEGACY = "screenshot_found";
    static final int FOREGROUND_ID = 4101;

    /** 通知按钮带出来的东西 */
    static final String EXTRA_KEY = "capture_shot_key";
    static final String EXTRA_NOTIFY_ID = "capture_notify_id";
    static final String EXTRA_AMOUNT = "capture_amount";
    static final String EXTRA_TEXT = "capture_text";
    static final String EXTRA_PATH = "capture_path";

    static volatile boolean running = false;
    /** 服务实例：闹钟自检醒来时直接戳它，不用重新拉起服务 */
    static volatile ScreenshotWatchService instance;

    /** 闹钟自检的 action */
    static final String ACTION_SCAN = "com.shijinran.money.capture.SCAN";
    private static final long HEARTBEAT_MS = 30_000L;

    private static final String TAG = "SnoopyCapture";
    private static final int MAX_SIDE = 1280;
    /** 连拍多张时，8 秒内不再重复振动/响铃 */
    private static final long QUIET_VIBRATE_MS = 8_000L;
    /** 媒体库写入比广播慢，首次没扫到最多再补 2 次（原来要重试 10 次） */
    private static final int MAX_SCAN_RETRIES = 2;
    private static final String GROUP_WATCH = "watch";
    private static final String GROUP_FOUND = "found";

    /** 只查媒体库，永远不阻塞在 OCR 上 */
    private final ExecutorService scanner = Executors.newSingleThreadExecutor();
    /** 识别串行：RapidOcr 的 native 层不是多实例/并发安全的 */
    private final ExecutorService recognizer = Executors.newSingleThreadExecutor();
    private final AtomicBoolean scanQueued = new AtomicBoolean(false);
    /** 补扫的延迟重试挂在主线程上，销毁时要能一次清干净 */
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private ContentObserver observer;
    private long startedAt;

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        instance = this;
        startedAt = System.currentTimeMillis();
        createChannels();
        startForegroundCompat();
        primeCursor();
        registerObserver();
        submit(recognizer, () -> OcrEngineHolder.warmUp(this));
        requestScan();
        scheduleHeartbeat(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (observer == null) registerObserver();
        // 闹钟自检：服务被冻结过时，这条命令会把它叫醒并补扫积压的截图
        if (intent != null && ACTION_SCAN.equals(intent.getAction())) requestScan();
        scheduleHeartbeat(this);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        running = false;
        instance = null;
        // 不要在这里取消自检闹钟：系统回收或冻结后台服务时同样会走 onDestroy，
        // 一旦取消就再没人把服务叫回来。用户主动关闭时由 CapturePlugin.disableWatch() 取消。
        // 占位通知也不用在这里收：它带 15 秒超时，服务没了会自己消失，
        // 已经认出金额的那条要留着让用户确认。
        // 先掐掉还在排队的补扫：否则它会在线程池 shutdown 之后再 execute，主线程直接崩
        mainHandler.removeCallbacksAndMessages(null);
        if (observer != null) {
            try {
                getContentResolver().unregisterContentObserver(observer);
            } catch (Throwable ignored) {
            }
            observer = null;
        }
        scanner.shutdownNow();
        recognizer.shutdownNow();
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
        int found = 0;
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
            while (cursor.moveToNext() && !scanner.isShutdown()) {
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
                if (!looksLikeScreenshot(name)) continue;
                // 扫描只负责发现，识别丢给另一个线程排队
                final long shotId = id;
                if (submit(recognizer, () -> handleShot(shotId))) found++;
            }
        } catch (Throwable t) {
            Log.w(TAG, "scan failed", t);
        } finally {
            if (cursor != null) cursor.close();
        }
        CaptureStore.setLastCheckAt(this, System.currentTimeMillis());
        if (found > 0) Log.d(TAG, "queued " + found + " new shot(s) for OCR");
        return found > 0;
    }

    /** 闹钟自检醒来时从外部戳一下：只补扫积压，不做别的 */
    void requestScanNow() {
        requestScan();
    }

    private void requestScan() {
        if (!scanQueued.compareAndSet(false, true)) return;
        scheduleScan(0);
    }

    /** MediaStore 的插入偶尔比系统广播晚一点，第一次没扫到就再补两次。 */
    private void scheduleScan(int attempt) {
        submit(scanner, () -> {
            if (scanner.isShutdown()) {
                scanQueued.set(false);
                return;
            }
            if (scanNewShots()) {
                scanQueued.set(false);
                // 扫的过程中可能又来了新截图，顺手再看一眼（纯查询，很便宜）
                requestScan();
                return;
            }
            if (attempt >= MAX_SCAN_RETRIES) {
                scanQueued.set(false);
                return;
            }
            long delay = attempt == 0 ? 200L : 400L;
            mainHandler.postDelayed(() -> scheduleScan(attempt + 1), delay);
        });
    }

    /**
     * 30 秒一次的自检闹钟。
     * 系统在某些机型上会把后台进程冻住，观察者回调就跟着停掉：
     * 截屏时没反应，等用户回到 App 进程解冻，积压的图才一起弹出来。
     * 用不唤醒 CPU 的 ELAPSED_REALTIME（截图必然发生在屏幕亮着的时候），
     * 到点唤醒广播 → 服务进程解冻 → 立刻补扫。
     */
    static void scheduleHeartbeat(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            am.set(AlarmManager.ELAPSED_REALTIME,
                    SystemClock.elapsedRealtime() + HEARTBEAT_MS, heartbeatIntent(context));
        } catch (Throwable t) {
            Log.w(TAG, "heartbeat schedule failed", t);
        }
    }

    static void cancelHeartbeat(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            am.cancel(heartbeatIntent(context));
        } catch (Throwable ignored) {
        }
    }

    private static PendingIntent heartbeatIntent(Context context) {
        Intent intent = new Intent(context, CaptureHeartbeatReceiver.class);
        intent.setAction(CaptureHeartbeatReceiver.ACTION_HEARTBEAT);
        return PendingIntent.getBroadcast(context, FOREGROUND_ID + 1, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * 往线程池里丢任务。
     * 关闭监听或系统回收服务时，可能还有一次补扫/识别在路上；
     * 那些任务醒来时线程池已经 shutdown，直接 execute 会抛
     * RejectedExecutionException，而延迟任务跑在主线程上没人接。
     * 所以统一从这里进：池子关了就把任务丢掉。
     */
    private static boolean submit(ExecutorService pool, Runnable task) {
        if (pool == null || pool.isShutdown()) return false;
        try {
            pool.execute(task);
            return true;
        } catch (RejectedExecutionException ignored) {
            return false;
        }
    }

    /** 第一次开启时先记下当前时间与最大的 _ID，避免把以前的截图全部过一遍。 */
    private void primeCursor() {
        if (CaptureStore.lastSeenAt(this) <= 0) {
            CaptureStore.setLastSeenAt(this, System.currentTimeMillis() / 1000L);
        }
        if (CaptureStore.lastId(this) > 0) return;
        submit(scanner, () -> {
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

    /** 识别线程：解码 → 存缓存 → OCR（只做一次，文字随截图一起存起来）→ 入队 + 一条通知。 */
    private void handleShot(long id) {
        long begin = System.currentTimeMillis();
        // 有「显示在其他应用上层」权限就自己画一张从顶部滑下来的卡片（QQ 那种），
        // 不靠系统横幅；没有权限才退回通知，能不能弹由厂商决定
        boolean overlay = CaptureOverlay.permitted(this);
        long key = (id << 20) ^ (System.currentTimeMillis() & 0xFFFFFL);
        int notifyId = CaptureStore.nextNotifyId(this);
        // 没有悬浮窗权限时，占位和结果共用同一个通知位：先挂「正在认金额…」，
        // 认出金额后原地更新成「识别到 ¥X」。状态栏图标只出现一次，不会
        // 因为「新建一条 + 再删掉占位」连着跳三下，也不会留下冗余通知。
        if (!overlay) notifyProgress(notifyId);
        Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
        File saved = null;
        Bitmap bitmap = null;
        boolean posted = false;
        try {
            bitmap = decode(uri, MAX_SIDE);
            if (bitmap == null) {
                Log.w(TAG, "decode failed " + uri);
                return;
            }
            saved = saveCache(bitmap, id);
            if (saved == null) {
                Log.w(TAG, "cache write failed " + id);
                return;
            }
            // 图一存好就把卡片滑下来，先看到「正在认金额…」，认完原地变成金额
            if (overlay) CaptureOverlay.showProgress(this, key, notifyId, saved.getAbsolutePath(), thumb(bitmap));
            OcrShot shot = ocrShot(bitmap);
            String amount = shot == null ? null : shot.amount;
            if (amount == null) {
                // 聊天、网页之类没有金额的截图，静默跳过
                saved.delete();
                if (overlay) CaptureOverlay.dismissIfKey(key);
                Log.d(TAG, "skip id=" + id + " no amount in " + (System.currentTimeMillis() - begin) + "ms");
                return;
            }
            JSONObject evicted = CaptureStore.addShot(this, key, notifyId, saved.getAbsolutePath(),
                    centsOf(amount), shot.text);
            if (evicted != null) dropShot(evicted);
            if (overlay) {
                CaptureOverlay.showAmount(amount, centsOf(amount), shot.text);
                // 卡片已经给人看过了，通知只留一条安静的备份在通知栏里
                notifyFound(notifyId, key, amount, saved.getAbsolutePath(), shot.text, false);
            } else {
                notifyFound(notifyId, key, amount, saved.getAbsolutePath(), shot.text, true);
            }
            posted = true;
            CaptureStore.setLastNoticeAt(this, System.currentTimeMillis());
            Log.d(TAG, "handled id=" + id + " ¥" + amount + " in " + (System.currentTimeMillis() - begin) + "ms");
        } catch (Throwable t) {
            Log.w(TAG, "handleShot failed: " + id, t);
            if (saved != null) saved.delete();
        } finally {
            // 位图用完立刻回收，连拍时不至于堆一堆大图把内存撑爆
            if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            // 认不出金额、解码失败这种没结果的情况，把占位通知收掉；
            // 已经更新成「识别到 ¥X」的那条要留着，别连正主一起删
            if (!posted && !overlay) cancelProgress(notifyId);
        }
    }

    /** 一检测到新截图就弹的占位提醒，纯提示进度，没有按钮；和结果共用同一个通知位 */
    private void notifyProgress(int notifyId) {
        try {
            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_FOUND)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle("正在认金额…")
                    .setContentText("截图记账正在读这张截图，马上就好")
                    .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setGroup(GROUP_FOUND)
                    .setDefaults(0)
                    .setVibrate(new long[] { 0 })
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    // 万一进程在识别中途被杀，这条占位通知自己消失，不会一直挂着
                    .setTimeoutAfter(15_000L);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(notifyId, builder.build());
        } catch (Throwable ignored) {
        }
    }

    private void cancelProgress(int notifyId) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(notifyId);
        } catch (Throwable ignored) {
        }
    }

    /** 队列挤掉旧截图或用户取消时：收起它的通知、删掉缓存图 */
    private void dropShot(JSONObject shot) {
        try {
            int notifyId = shot.optInt("notifyId", 0);
            if (notifyId > 0) {
                NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm != null) nm.cancel(notifyId);
            }
            CaptureOverlay.dismissIfKey(shot.optLong("key", 0));
            String path = shot.optString("path", "");
            if (!path.isEmpty()) new File(path).delete();
        } catch (Throwable ignored) {
        }
    }

    /** 顶部卡片左侧的小方图：截中间一块再缩到卡片尺寸，别把整张大图塞进 View。 */
    private Bitmap thumb(Bitmap source) {
        try {
            int w = source.getWidth();
            int h = source.getHeight();
            int side = Math.min(w, h);
            if (side <= 0) return null;
            Bitmap square = Bitmap.createBitmap(source, (w - side) / 2, (h - side) / 2, side, side);
            Bitmap scaled = Bitmap.createScaledBitmap(square, 132, 132, true);
            if (scaled != square) square.recycle();
            return scaled;
        } catch (Throwable t) {
            return null;
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

    /** 缓存只留最近几张；还在待确认队列里的图一律不删。 */
    private void prune(File dir) {
        File[] files = dir.listFiles();
        if (files == null || files.length < CaptureStore.SHOTS_KEEP + 3) return;
        List<String> keep = new ArrayList<>();
        JSONArray shots = CaptureStore.shots(this);
        for (int i = 0; i < shots.length(); i++) {
            JSONObject item = shots.optJSONObject(i);
            if (item != null) keep.add(item.optString("path", ""));
        }
        Comparator<File> byTime = Comparator.comparingLong(File::lastModified);
        java.util.Arrays.sort(files, byTime);
        int allowed = CaptureStore.SHOTS_KEEP + 3;
        for (int i = 0; i < files.length - allowed; i++) {
            if (!keep.contains(files[i].getAbsolutePath())) files[i].delete();
        }
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
        Bitmap box = null;
        try {
            box = Bitmap.createBitmap(bitmap.getWidth(), bitmap.getHeight(), Bitmap.Config.ARGB_8888);
            OcrResult result = OcrEngineHolder.detect(getApplicationContext(), bitmap, box, MAX_SIDE);
            // 顺序由 OcrEngineHolder 统一排（RapidOCR 原始块顺序不可靠），和插件走同一套
            String raw = OcrEngineHolder.toText(result);
            // 截的是我们自己的页面就不用记账（截图同时也会把自己的通知横幅拍进去，
            // 不挡掉会形成闭环：截图 → 我们弹「识别到 ¥12.34」→ 再截图把这行认成金额）
            if (looksLikeOurApp(raw)) {
                Log.d(TAG, "skip own app screenshot");
                return null;
            }
            String text = cleanOcrText(raw);
            return new OcrShot(guessAmount(text), text);
        } catch (Throwable t) {
            return null;
        } finally {
            if (box != null && !box.isRecycled()) box.recycle();
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

    /** 整张截图是不是我们自己的界面：四个 tab 名同时出现基本就能确定。 */
    private static boolean looksLikeOurApp(String raw) {
        return raw.contains("首页") && raw.contains("明细") && raw.contains("统计") && raw.contains("我的");
    }

    /**
     * 去掉属于本 App 自己的那几行（通知横幅标题、按钮、常驻通知、我的页说明）。
     * 我们自己的通知盖在支付页上时，只去掉横幅那几行，剩下的金额照常认。
     */
    private static String cleanOcrText(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        StringBuilder kept = new StringBuilder();
        for (String line : raw.split("\n")) {
            String t = line.trim();
            if (t.isEmpty() || isOwnUi(t)) continue;
            if (kept.length() > 0) kept.append('\n');
            kept.append(t);
        }
        return kept.toString();
    }

    private static boolean isOwnUi(String line) {
        if (line.contains("直接记一笔") || line.contains("截图记账") || line.contains("马上入账")
                || line.contains("截屏后弹出通知") || line.contains("正在认金额") || line.contains("已记账")
                || line.contains("不用切回") || line.contains("截图只在这台手机上识别")) {
            return true;
        }
        // 我们自己的通知标题「识别到 ¥12.34」
        return line.matches(".*识别到\\s*[\u00a5\uffe5]\\s*[0-9].*");
    }

    /**
     * 一张截图一条通知：两张同时待确认时各自有 id，都能单独点「直接记一笔」。
     */
    private void notifyFound(int notifyId, long key, String amount, String path, String ocrText, boolean pop) {
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
                .setAutoCancel(true)
                // 点通知本身进 App 看/改这个金额；点按钮则完全留在后台
                .setContentIntent(openApp(path, 10000 + notifyId))
                .addAction(0, "直接记一笔", recordIntent(key, notifyId, amount, ocrText))
                .addAction(0, "取消", cancelIntent(key, notifyId));
        if (pop) {
            // 不要用 setSilent：部分机型把静音通知直接挡在横幅之外；
            // 这里只把振动压掉，横幅照旧弹
            builder.setDefaults(0)
                    .setVibrate(vibrate ? new long[] { 0, 200, 120, 200 } : new long[] { 0 });
        } else {
            // 顶部卡片已经把金额摆到眼前了，通知只在通知栏里留个备份，不再弹第二次
            builder.setSilent(true);
        }
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(notifyId, builder.build());
        } catch (Throwable ignored) {
        }
    }

    /** 「直接记一笔」：把这张截图交给接收器入队，不需要把 App 拉到前台。 */
    private PendingIntent recordIntent(long key, int notifyId, String amount, String ocrText) {
        Intent intent = new Intent(this, CaptureCancelReceiver.class);
        intent.setAction(CaptureCancelReceiver.ACTION_RECORD);
        intent.putExtra(EXTRA_KEY, key);
        intent.putExtra(EXTRA_NOTIFY_ID, notifyId);
        intent.putExtra(EXTRA_AMOUNT, centsOf(amount));
        // 连同识别文字一起带上：即使队列里那张已经被点开过，按钮也还能拿到原文
        intent.putExtra(EXTRA_TEXT, ocrText == null ? "" : ocrText);
        return PendingIntent.getBroadcast(this, 20000 + notifyId, intent,
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

    /** 「取消」按钮：丢掉这一张，收起它的通知。 */
    private PendingIntent cancelIntent(long key, int notifyId) {
        Intent intent = new Intent(this, CaptureCancelReceiver.class);
        intent.setAction(CaptureCancelReceiver.ACTION_CANCEL);
        intent.putExtra(EXTRA_KEY, key);
        intent.putExtra(EXTRA_NOTIFY_ID, notifyId);
        return PendingIntent.getBroadcast(this, 30000 + notifyId, intent,
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