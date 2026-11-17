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
import android.content.res.Configuration;
import android.database.ContentObserver;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.FileObserver;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;

import com.benjaminwan.ocrlibrary.OcrResult;
import com.shijinran.money.MainActivity;
import com.shijinran.money.R;
import com.shijinran.money.ocr.OcrEngineHolder;
import com.shijinran.money.ocr.OcrLine;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
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
 * 认出金额的截图入队：有悬浮窗权限时从顶部滑出一张卡片，同一时间只留最新一张；
 * 没有权限时退回通知，每张一条，都能单独「直接记一笔」。
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
    /**
     * 媒体库写入比广播慢：实测小米 HyperOS 拍完截图到媒体库有这一行要 3–4 秒，
     * 这期间 ContentObserver 只会先叫我们一次。首次没扫到就按下面的节奏补扫，
     * 盖住这段空白（每条都是一次很便宜的查询），最后一档 6 秒左右收手。
     */
    private static final long[] SCAN_RETRY_DELAYS =
            { 250L, 500L, 800L, 1_000L, 1_200L, 1_200L, 1_200L };
    private static final int MAX_SCAN_RETRIES = SCAN_RETRY_DELAYS.length;
    private static final String GROUP_WATCH = "watch";
    private static final String GROUP_FOUND = "found";
    /** 待确认的截图最多留 10 分钟：更早的肯定没人管了，服务重启时顺手清掉 */
    private static final long PENDING_TTL_MS = 10 * 60_000L;

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
        // 认金额的规则表放在 assets 里，先装载再开始监听；装载失败时 ShotRules 一律不弹卡
        RulesLoader.ensure(this);
        // 用户给了「所有文件访问」时，直接盯着截图目录，截完图 1 秒内就能弹卡，不用等系统媒体库
        syncFastWatcher();
        startForegroundCompat();
        cleanupStale();
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
        stopFastWatcher();
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
                Log.d(TAG, "media changed " + uri);
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
        Set<String> seen = CaptureStore.seenIds(this);
        int found = 0;
        ContentResolver resolver = getContentResolver();
        String[] projection = new String[] {
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.DATE_TAKEN,
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
            int takenCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_TAKEN);
            int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
            while (cursor.moveToNext() && !scanner.isShutdown()) {
                long id = cursor.getLong(idCol);
                long addedSec = cursor.getLong(dateCol);
                String name = cursor.getString(nameCol);
                // 去重 key 用 _ID + DATE_ADDED：_ID 会被回收重用，单用 _ID 会把复用了旧号的新截图静默跳过
                String seenKey = id + ":" + addedSec;
                if (seen.contains(seenKey)) continue;
                // 快速通道已经处理过这张图（同一文件名），别再弹一次
                if (name != null && seen.contains("file:" + name)) continue;
                // 同一秒内可能有第二张截图，先记下来再判断，下次不会再重复处理
                CaptureStore.addSeenId(this, seenKey);
                if (addedSec > lastSeen) {
                    lastSeen = addedSec;
                    CaptureStore.setLastSeenAt(this, lastSeen);
                }
                if (!looksLikeScreenshot(name)) continue;
                // 扫描只负责发现，识别丢给另一个线程排队
                final long shotId = id;
                // DATE_TAKEN 是毫秒（截图拍摄那一刻），比 DATE_ADDED（整秒）准得多，
                // 用它算「截屏→卡片」的端到端延迟
                long taken = cursor.getLong(takenCol);
                long age = System.currentTimeMillis() - (taken > 0 ? taken : addedSec * 1000L);
                Log.d(TAG, "found " + name + " added=" + addedSec + " taken=" + taken + " age=" + age);
                if (submit(recognizer, () -> handleShot(shotId, age))) found++;
            }
        } catch (Throwable t) {
            Log.w(TAG, "scan failed", t);
        } finally {
            if (cursor != null) cursor.close();
        }
        CaptureStore.setLastCheckAt(this, System.currentTimeMillis());
        if (found > 0) {
            Log.d(TAG, "queued " + found + " new shot(s) for OCR");
        } else {
            Log.d(TAG, "scan found 0 (lastSeen=" + lastSeen + ")");
        }
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
            long delay = SCAN_RETRY_DELAYS[Math.min(attempt, SCAN_RETRY_DELAYS.length - 1)];
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

    /** 第一次开启时先记下当前时间，避免把以前的截图全部过一遍。 */
    private void primeCursor() {
        if (CaptureStore.lastSeenAt(this) <= 0) {
            CaptureStore.setLastSeenAt(this, System.currentTimeMillis() / 1000L);
        }
    }

    private boolean looksLikeScreenshot(String name) {
        if (name == null) return false;
        String lower = name.toLowerCase();
        return lower.contains("screenshot") || lower.contains("screen_shot") || lower.contains("截屏")
                || lower.contains("截图");
    }

    /**
     * 快速通道：用户给了「所有文件访问」时，直接盯着截图目录。
     *
     * 正常情况下只能靠系统媒体库发现新截图，而 HyperOS 要过 3-4 秒才把这张图写进索引，
     * 卡片就跟着迟到。有了目录读取权限就能直接看见文件，截完图 1 秒内弹卡。
     * 没给权限时什么都不做，仍然走媒体库那条慢一些但零新权限的路。
     */
    private final List<FileObserver> fastWatchers = new ArrayList<>();
    /** .pending-… 还在写内容的文件，避免同一张图起多条重试链 */
    private final Set<String> fastPending = Collections.synchronizedSet(new HashSet<>());
    private static final int FAST_RETRIES = 12;

    /** 权限开/关或服务重新起来时对齐一次：有权限才盯目录 */
    void syncFastWatcher() {
        boolean allowed;
        try {
            allowed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager();
        } catch (Throwable t) {
            allowed = false;
        }
        if (allowed && fastWatchers.isEmpty()) startFastWatcher();
        else if (!allowed && !fastWatchers.isEmpty()) stopFastWatcher();
    }

    private void startFastWatcher() {
        try {
            watchShotDir(new File(Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_DCIM), "Screenshots"));
            watchShotDir(new File(Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_PICTURES), "Screenshots"));
        } catch (Throwable t) {
            Log.w(TAG, "fast watcher failed", t);
        }
        if (!fastWatchers.isEmpty()) Log.d(TAG, "fast watcher dirs=" + fastWatchers.size());
    }

    private void stopFastWatcher() {
        for (FileObserver watcher : fastWatchers) {
            try {
                watcher.stopWatching();
            } catch (Throwable ignored) {
            }
        }
        fastWatchers.clear();
    }

    private void watchShotDir(final File dir) {
        if (dir == null || !dir.isDirectory()) return;
        FileObserver watcher = new FileObserver(dir.getAbsolutePath(),
                FileObserver.CREATE | FileObserver.CLOSE_WRITE | FileObserver.MOVED_TO) {
            @Override
            public void onEvent(int event, final String name) {
                if (name == null) return;
                if ((event & (FileObserver.CLOSE_WRITE | FileObserver.MOVED_TO)) == 0) return;
                // MIUI 先写 .pending-<序号>-Screenshot_….jpg，写完才改成正式文件名，两种都接
                String clean = name;
                int at = clean.indexOf("-Screenshot");
                if (clean.startsWith(".pending-") && at > 0) clean = clean.substring(at + 1);
                if (!looksLikeScreenshot(clean)) return;
                // 真正能读的是磁盘上的这个文件：MIUI 先写 .pending-…（这时内容已经完整），
                // 3-4 秒后才改名成 final 名。等改名就白等，所以直接读 pending 文件，
                // 只用 clean（正式名）做去重和日志。
                final String shotName = clean;
                final File shotFile = new File(dir, name);
                Log.d(TAG, "fast event " + Integer.toHexString(event) + " " + shotName);
                submit(recognizer, () -> handleFastFile(shotFile, shotName));
            }
        };
        watcher.startWatching();
        fastWatchers.add(watcher);
    }

    /** 快速通道刚逮到的文件：只认最近两分钟内的，服务重启后翻到的旧图不动 */
    private void handleFastFile(File file, String name) {
        handleFastFile(file, name, 0);
    }

    private void handleFastFile(File file, String name, int attempt) {
        long now = System.currentTimeMillis();
        long mtime = file.lastModified();
        if (mtime <= 0) return;
        if (now - mtime > 120_000L) return;
        String seenKey = "file:" + name;
        if (CaptureStore.seenIds(this).contains(seenKey)) {
            fastPending.remove(name);
            return;
        }
        // MIUI 先建 .pending-… 空壳再往里写，CLOSE_WRITE 时可能还是 0 字节或半张图。
        // 隔 200ms 再看一眼，最多等 2.4 秒；再不行就交给改名后的 MOVED_TO 事件。
        if (!fastFileReady(file)) {
            if (attempt == 0 && !fastPending.add(name)) return;
            if (attempt >= FAST_RETRIES) {
                fastPending.remove(name);
                Log.d(TAG, "fast gave up " + name);
                return;
            }
            mainHandler.postDelayed(() -> submit(recognizer,
                    () -> handleFastFile(file, name, attempt + 1)), 200L);
            return;
        }
        fastPending.remove(name);
        if (attempt > 0) Log.d(TAG, "fast ready attempt=" + attempt + " " + name);
        // 先记上：CREATE / CLOSE_WRITE / MOVED_TO 可能连着来三次
        CaptureStore.addSeenId(this, seenKey);
        handleShotFile(file, now - mtime);
    }

    /** .pending-… 先建空壳再写内容：等长度稳住、图头也能解开，才算写完 */
    private boolean fastFileReady(File file) {
        long length = file.length();
        if (length <= 0 || !readable(file)) return false;
        try {
            Thread.sleep(80L);
        } catch (InterruptedException ignored) {
        }
        return file.length() == length && readable(file);
    }

    /** 文件现在能不能当图片解开（只看图头，不占内存） */
    private boolean readable(File file) {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        try {
            BitmapFactory.decodeFile(file.getAbsolutePath(), options);
        } catch (Throwable ignored) {
        }
        return options.outWidth > 0 && options.outHeight > 0;
    }

    /** 识别线程：解码 → 存缓存 → OCR（只做一次，文字随截图一起存起来）→ 入队 + 一条通知。 */
    private void handleShot(long id, long ageMs) {
        Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
        handleShotSource(id, uri, null, ageMs);
    }

    /** 快速通道：已经有文件了（FileObserver 逮到的），不用再绕媒体库 */
    private void handleShotFile(File file, long ageMs) {
        handleShotSource(file.getName().hashCode() & 0x7FFFFFFFL, null, file, ageMs);
    }

    private void handleShotSource(long id, Uri uri, File file, long ageMs) {
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
        File saved = null;
        Bitmap bitmap = null;
        boolean posted = false;
        try {
            bitmap = file != null ? decodeFile(file, MAX_SIDE) : decode(uri, MAX_SIDE);
            long tDecode = System.currentTimeMillis();
            if (bitmap == null) {
                Log.w(TAG, "decode failed " + (file != null ? file : uri));
                return;
            }
            saved = saveCache(bitmap, id);
            long tCache = System.currentTimeMillis();
            if (saved == null) {
                Log.w(TAG, "cache write failed " + id);
                return;
            }
            OcrShot shot = ocrShot(bitmap);
            long tOcr = System.currentTimeMillis();
            String amount = shot == null ? null : shot.amount;
            if (looksLikeMoneyButNotBill(shot)) {
                // 认出了金额，但没有支付语境（聊天里的价格、网页商品价、股票数字…）
                saved.delete();
                if (overlay) CaptureOverlay.dismissIfKey(key);
                Log.d(TAG, "skip id=" + id + " amount but not a bill ¥" + amount
                        + " reason=" + shot.reason + " layout=" + shot.layout + " in "
                        + (System.currentTimeMillis() - begin) + "ms");
                return;
            }
            if (amount == null) {
                // 聊天、网页之类没有金额的截图，静默跳过
                saved.delete();
                if (overlay) CaptureOverlay.dismissIfKey(key);
                // 不把 OCR 原文写进 logcat：截图里可能有用户的钱包、聊天内容
                Log.d(TAG, "skip id=" + id + " no amount in " + (System.currentTimeMillis() - begin) + "ms");
                return;
            }
            // 10 分钟内同一张账单又截了一次：合并到已有的那张，不再重复弹
            String dedupe = ShotRules.dedupeKey(amount, shot.text);
            if (CaptureStore.seenRecently(this, dedupe, System.currentTimeMillis(), PENDING_TTL_MS)) {
                saved.delete();
                if (overlay) CaptureOverlay.dismissIfKey(key);
                Log.d(TAG, "skip id=" + id + " duplicate of a recent shot");
                return;
            }
            CaptureStore.markRecent(this, dedupe, System.currentTimeMillis());
            JSONObject evicted = CaptureStore.addShot(this, key, notifyId, saved.getAbsolutePath(),
                    centsOf(amount), shot.text);
            if (evicted != null) dropShot(evicted);
            // 认出金额之后才把卡片滑下来：桌面、聊天这类没金额的截图全程一点动静都没有
            // （以前先弹「正在认金额…」再收走，屏幕顶上会闪一下），卡片一出现就是金额版。
            // 悬浮窗被 ROM 拦掉时（appops 拒绝、后台弹窗限制等）卡片根本不会出现，
            // 下面用 isShowing() 判断，拦掉了就退回系统横幅。
            long tBeforeShow = System.currentTimeMillis();
            if (overlay) CaptureOverlay.showFound(this, key, notifyId, saved.getAbsolutePath(),
                    thumb(bitmap), amount, centsOf(amount), shot.text);
            long tShown = System.currentTimeMillis();
            Log.d(TAG, "timing age=" + ageMs + " decode=" + (tDecode - begin)
                    + " cache=" + (tCache - tDecode) + " ocr=" + (tOcr - tCache)
                    + " thumbShow=" + (tShown - tBeforeShow));
            Log.d(TAG, "notice id=" + notifyId + " overlay=" + overlay
                    + " cardShowing=" + CaptureOverlay.isShowing());
            if (overlay && CaptureOverlay.isShowing()) {
                // 顶部卡片同一时间只留最新一张：连拍时把上一张没确认的清掉，
                // 否则卡片换成了新的，通知栏里还堆着一排没人点的旧提醒
                dropOtherShots(key);
                CaptureStore.bumpStat(this, "shown");
                // 卡片已经给人看过了，通知只留一条安静的备份，点开就能补记
                notifyFound(notifyId, key, amount, saved.getAbsolutePath(), shot.text, false);
            } else {
                // 没有悬浮窗权限，或者 ROM 把后台弹窗拦掉了（小米/HyperOS 常见）：
                // 退回系统横幅。按钮画在通知内容里，折叠着也能点，
                // 不能再发静音通知，否则它会掉进「更多通知」文件夹里没人看见。
                if (overlay) CaptureOverlay.dismissIfKey(key);
                notifyFound(notifyId, key, amount, saved.getAbsolutePath(), shot.text, true);
            }
            posted = true;
            CaptureStore.setLastNoticeAt(this, System.currentTimeMillis());
            Log.d(TAG, "handled id=" + id + " src=" + (file != null ? "file" : "media") + " ¥" + amount + " layout=" + shot.layout
                    + " in " + (System.currentTimeMillis() - begin) + "ms");
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

    /** 顶部卡片同一时间只留最新一张：把之前没确认的截图连同通知、缓存图一起清掉 */
    private void dropOtherShots(long keepKey) {
        try {
            JSONArray all = CaptureStore.shots(this);
            for (int i = 0; i < all.length(); i++) {
                JSONObject item = all.optJSONObject(i);
                if (item == null) continue;
                long key = item.optLong("key", 0L);
                if (key == keepKey) continue;
                JSONObject removed = CaptureStore.removeShot(this, key);
                if (removed != null) dropShot(removed);
            }
        } catch (Throwable t) {
            Log.w(TAG, "drop other shots failed", t);
        }
    }

    /**
     * 服务起来时先清上一轮留下的东西：超过 TTL 还没人确认的截图、通知栏里已经没有
     * 对应记录的旧提醒。进程被系统回收后这些都不会自己消失，不清就会越积越多。
     */
    private void cleanupStale() {
        int dropped = 0;
        int stale = 0;
        try {
            long now = System.currentTimeMillis();
            JSONArray all = CaptureStore.shots(this);
            for (int i = 0; i < all.length(); i++) {
                JSONObject item = all.optJSONObject(i);
                if (item == null) continue;
                long createdAt = item.optLong("createdAt", 0L);
                if (createdAt > 0 && now - createdAt <= PENDING_TTL_MS) continue;
                JSONObject removed = CaptureStore.removeShot(this, item.optLong("key", 0L));
                if (removed != null) {
                    dropShot(removed);
                    dropped++;
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "cleanup shots failed", t);
        }
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Set<Integer> live = new java.util.HashSet<>();
                JSONArray all = CaptureStore.shots(this);
                for (int i = 0; i < all.length(); i++) {
                    JSONObject item = all.optJSONObject(i);
                    if (item != null) live.add(item.optInt("notifyId", 0));
                }
                for (StatusBarNotification sbn : nm.getActiveNotifications()) {
                    if (!getPackageName().equals(sbn.getPackageName())) continue;
                    Notification n = sbn.getNotification();
                    if (n == null) continue;
                    String channel = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? n.getChannelId() : "";
                    if (!CHANNEL_FOUND.equals(channel) && !CHANNEL_FOUND_LEGACY.equals(channel)) continue;
                    if (live.contains(sbn.getId())) continue;
                    nm.cancel(sbn.getId());
                    stale++;
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "cleanup notices failed", t);
        }
        if (dropped > 0 || stale > 0) {
            Log.d(TAG, "cleanup dropped=" + dropped + " staleNotices=" + stale);
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

    /** 快速通道用：直接读文件（有「所有文件访问」时走这条，不必绕 ContentResolver） */
    private Bitmap decodeFile(File file, int maxSide) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
            int longest = Math.max(bounds.outWidth, bounds.outHeight);
            if (longest <= 0) return null;
            int sample = 1;
            while (longest / sample > maxSide * 2) sample *= 2;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            Bitmap raw = BitmapFactory.decodeFile(file.getAbsolutePath(), opts);
            if (raw == null) return null;
            int side = Math.max(raw.getWidth(), raw.getHeight());
            if (side <= maxSide) return raw;
            float ratio = maxSide / (float) side;
            Bitmap scaled = Bitmap.createScaledBitmap(raw,
                    Math.max(1, Math.round(raw.getWidth() * ratio)),
                    Math.max(1, Math.round(raw.getHeight() * ratio)), true);
            if (scaled != raw) raw.recycle();
            return scaled;
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

    /**
     * 一次识别拿三样东西：认出的金额、金额是否过硬（付款语境门槛）、交给前端正式解析的原文。
     * 金额认出来了但门槛没过时，用来区分「根本没有金额」和「有金额但不像账单」两种跳过。
     */
    private static final class OcrShot {
        final String amount;
        final boolean accepted;
        /** 拦截原因：no_amount / uncertain / no_signal / income / own_card，null 表示可以弹卡 */
        final String reason;
        final String text;
        /** 判定时有没有拿到行坐标（false = 退回纯文本规则） */
        final boolean layout;

        OcrShot(String amount, boolean accepted, String reason, String text, boolean layout) {
            this.amount = amount;
            this.accepted = accepted;
            this.reason = reason;
            this.text = text == null ? "" : text;
            this.layout = layout;
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
            // 卡片还挂在屏幕上时又截了张图：卡片上那行「￥23.45 已写进账本」
            // 会被 OCR 当成新金额再弹一次，确认后又写一张截图……自己喂自己。
            // 这种整张都不算，别让桌面截图变成账单
            if (looksLikeOurCard(raw)) {
                Log.d(TAG, "skip own card screenshot");
                return null;
            }
            // 行级版面：把 OCR 行和坐标一起交给规则引擎（字号、靠上、居中都参与打分）。
            // 我们自己的 UI 行先剔掉，文本和坐标用同一份过滤结果，行号才能和文本行对齐。
            List<OcrLine> lines = new ArrayList<>();
            StringBuilder kept = new StringBuilder();
            for (OcrLine line : OcrEngineHolder.lines(result)) {
                String value = line.text.trim();
                if (value.isEmpty() || isOwnUi(value)) continue;
                if (kept.length() > 0) kept.append('\n');
                kept.append(value);
                lines.add(line);
            }
            String text = kept.toString();
            // 判定交给 ShotRules：金额要有付款语境、候选要有明显领先，收入/退款方向不算支出
            ShotRules.Judgement judged = ShotRules.judge(text, lines);
            return new OcrShot(judged.amount, judged.reason == null, judged.reason, text, judged.layout);
        } catch (Throwable t) {
            return null;
        } finally {
            if (box != null && !box.isRecycled()) box.recycle();
        }
    }

    /** 认出了金额、但不像账单（没有支付信号）的截图：不弹卡，单独记一条日志。 */
    private static boolean looksLikeMoneyButNotBill(OcrShot shot) {
        return shot != null && shot.amount != null && !shot.accepted;
    }

    /**
     * 截图里是不是拍到了我们自己的顶部卡片：认出金额那张写着「识别到 ¥X」和
     * 「点「确认记录」…」，确认之后那张写着「已记一笔」「¥X 已写进账本」。
     * 卡片的金额是 OCR 自己认出来的，再认回去就会无限重复记账。
     */
    private static boolean looksLikeOurCard(String raw) {
        return ShotRules.looksLikeOurCard(raw);
    }

    /** 整张截图是不是我们自己的界面：四个 tab 名同时出现基本就能确定。 */
    private static boolean looksLikeOurApp(String raw) {
        return raw.contains("首页") && raw.contains("明细") && raw.contains("统计") && raw.contains("我的");
    }

    private static boolean isOwnUi(String line) {
        if (line.contains("直接记一笔") || line.contains("截图记账") || line.contains("马上入账")
                || line.contains("截屏后弹出通知") || line.contains("正在认金额") || line.contains("已记账")
                || line.contains("不用切回") || line.contains("截图只在这台手机上识别")
                || line.contains("已写进账本") || line.contains("回 App 就能看到")
                || line.contains("回App就能看到") || line.contains("点「确认记录」")) {
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
        // 按钮画进内容视图里：系统对普通通知只在展开后才显示 action 按钮，
        // 小米这类默认折叠的机型上用户只会看到一行字，一个按钮都点不到
        RemoteViews view = foundView(amount, key, notifyId, ocrText);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_FOUND)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("识别到 ¥" + amount)
                .setContentText(text)
                .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                .setCustomContentView(view)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setGroup(GROUP_FOUND)
                .setAutoCancel(true)
                // 点通知本身进 App 看/改这个金额；点按钮则完全留在后台
                .setContentIntent(openApp(path, 10000 + notifyId));
        // 不再加系统 action 按钮：按钮已经画在内容视图里了，
        // 再挂一套 action 在展开时会并排出现两排一模一样的按钮
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
            if (nm == null) return;
            // 先撤掉占位那条再发：占位带 15 秒超时，直接覆盖会让整条提醒 15 秒后自己消失
            nm.cancel(notifyId);
            nm.notify(notifyId, builder.build());
        } catch (Throwable ignored) {
        }
    }

    /**
     * 自绘的通知内容：标题 + 两个按钮。
     * 系统自带的 action 按钮只在「展开」后才出现，国产 ROM 默认折叠，
     * 用户看到的就是一条没有按钮的提醒；把按钮画进内容视图里，折叠状态也能点。
     * 折叠态只有约 64dp 高，所以这里不放说明文字，多了会被卡片下边缘裁掉。
     */
    private RemoteViews foundView(String amount, long key, int notifyId, String ocrText) {
        RemoteViews view = new RemoteViews(getPackageName(), R.layout.notification_found);
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        // 通知卡片的底色跟着系统深浅色走，文字颜色也得跟着换，否则白底白字
        int ink = night ? 0xFFF3EFE7 : 0xFF1A1713;
        int mute = night ? 0xFFB9B3A7 : 0xFF6F6A62;
        view.setTextViewText(R.id.nf_title, "识别到 ¥" + amount);
        view.setTextColor(R.id.nf_title, ink);
        view.setTextColor(R.id.nf_cancel, mute);
        view.setOnClickPendingIntent(R.id.nf_record, recordIntent(key, notifyId, amount, ocrText));
        view.setOnClickPendingIntent(R.id.nf_cancel, cancelIntent(key, notifyId));
        return view;
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