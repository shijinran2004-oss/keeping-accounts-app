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

import com.benjaminwan.ocrlibrary.OcrEngine;
import com.benjaminwan.ocrlibrary.OcrResult;
import com.benjaminwan.ocrlibrary.TextBlock;
import com.shijinran.money.MainActivity;
import com.shijinran.money.R;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 截图监听：前台服务里挂一个 MediaStore 观察者，发现新截图就本地识别一次。
 * 只有认出金额才发通知；通知点开才进记账页，绝不自动写库。
 */
public class ScreenshotWatchService extends Service {

    static final String CHANNEL_WATCH = "screenshot_watch";
    static final String CHANNEL_FOUND = "screenshot_found";
    static final int FOREGROUND_ID = 4101;
    static volatile boolean running = false;

    private static final String TAG = "SnoopyCapture";
    private static final int MAX_SIDE = 1600;
    private static final long HISTORY_GUARD_MS = 10_000L;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private ContentObserver observer;
    private OcrEngine engine;
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
        io.execute(this::scanNewShots);
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
        engine = null;
        super.onDestroy();
    }

    private void startForegroundCompat() {
        Notification notice = new NotificationCompat.Builder(this, CHANNEL_WATCH)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("截图记账已开启")
                .setContentText("截屏后会自动认出金额，点通知确认")
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setContentIntent(openApp(null))
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
        NotificationChannel found = new NotificationChannel(
                CHANNEL_FOUND, "识别到截图", NotificationManager.IMPORTANCE_DEFAULT);
        found.setDescription("截图里认出金额时提醒你确认记账");
        nm.createNotificationChannel(found);
    }

    private void registerObserver() {
        observer = new ContentObserver(new Handler(Looper.getMainLooper())) {
            @Override
            public void onChange(boolean selfChange, Uri uri) {
                io.execute(ScreenshotWatchService.this::scanNewShots);
            }
        };
        getContentResolver().registerContentObserver(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, observer);
    }

    private void scanNewShots() {
        long last = CaptureStore.lastId(this);
        ContentResolver resolver = getContentResolver();
        String[] projection = new String[] {
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.DISPLAY_NAME,
        };
        String selection = MediaStore.Images.Media._ID + " > ?";
        String[] args = new String[] { String.valueOf(last) };
        Cursor cursor = null;
        try {
            cursor = resolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    projection, selection, args, MediaStore.Images.Media._ID + " ASC");
            if (cursor == null) return;
            int idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
            int dateCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED);
            int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
            while (cursor.moveToNext() && !io.isShutdown()) {
                long id = cursor.getLong(idCol);
                long addedMs = cursor.getLong(dateCol) * 1000L;
                String name = cursor.getString(nameCol);
                CaptureStore.setLastId(this, id);
                if (addedMs < startedAt - HISTORY_GUARD_MS) continue;
                if (!looksLikeScreenshot(name)) continue;
                handleShot(id);
            }
        } catch (Throwable ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    /** 第一次开启时先记下当前最大的 _ID，避免把以前的截图全部过一遍。 */
    private void primeCursor() {
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
        Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
        File saved = null;
        try {
            Bitmap bitmap = decode(uri, MAX_SIDE);
            if (bitmap == null) {
                Log.w(TAG, "decode failed " + uri);
                return;
            }
            saved = saveCache(bitmap, id);
            String amount = ocrAmount(bitmap);
            if (amount == null || saved == null) {
                // 聊天、网页之类没有金额的截图，静默跳过；缓存写不出来也不提醒（点开没图）
                if (saved != null) saved.delete();
                return;
            }
            CaptureStore.setPendingPath(this, saved.getAbsolutePath());
            notifyFound(amount, saved.getAbsolutePath());
            CaptureStore.setLastNoticeAt(this, System.currentTimeMillis());
        } catch (Throwable t) {
            Log.w(TAG, "handleShot failed: " + id, t);
            if (saved != null) saved.delete();
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

    private String ocrAmount(Bitmap bitmap) {
        try {
            OcrEngine e = ensureEngine();
            Bitmap box = Bitmap.createBitmap(bitmap.getWidth(), bitmap.getHeight(), Bitmap.Config.ARGB_8888);
            OcrResult result = e.detect(bitmap, box, MAX_SIDE);
            StringBuilder text = new StringBuilder();
            if (result != null && result.getTextBlocks() != null) {
                for (TextBlock block : result.getTextBlocks()) {
                    if (block != null && block.getText() != null) text.append(block.getText()).append('\n');
                }
            }
            return guessAmount(text.toString());
        } catch (Throwable t) {
            return null;
        }
    }

    private OcrEngine ensureEngine() {
        if (engine != null) return engine;
        OcrEngine created = new OcrEngine(getApplicationContext());
        created.setPadding(50);
        created.setBoxScoreThresh(0.5f);
        created.setBoxThresh(0.3f);
        created.setUnClipRatio(1.6f);
        created.setDoAngle(true);
        created.setMostAngle(true);
        engine = created;
        return created;
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

    private void notifyFound(String amount, String path) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_FOUND)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("识别到 ¥" + amount)
                .setContentText("点开确认金额和分类，保存后才会记账")
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(openApp(path));
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify((int) (System.currentTimeMillis() % 100000), builder.build());
        } catch (Throwable ignored) {
        }
    }

    private PendingIntent openApp(String path) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (path != null) intent.putExtra(CapturePlugin.EXTRA_PENDING, path);
        return PendingIntent.getActivity(this, path == null ? 11 : (int) (System.currentTimeMillis() % 100000),
                intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
