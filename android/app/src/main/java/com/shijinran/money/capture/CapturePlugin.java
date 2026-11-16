package com.shijinran.money.capture;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.File;
import java.io.FileInputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 两个入口共用一套出口：
 * 1) 别的 App 分享图片过来（ACTION_SEND）；
 * 2) 截图监听服务认出金额后，用户点通知进来。
 * 两边都只吐出 dataUrl，之后的识别/解析/回填全在前端做。
 */
@CapacitorPlugin(
        name = "Capture",
        permissions = {
                @Permission(alias = "images", strings = { Manifest.permission.READ_MEDIA_IMAGES }),
                @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
                @Permission(alias = "notify", strings = { Manifest.permission.POST_NOTIFICATIONS })
        })
public class CapturePlugin extends Plugin {

    static final String EXTRA_PENDING = "capture_pending";
    private static final int MAX_SHARE_BYTES = 24 * 1024 * 1024;
    private static final int MAX_SIDE = 1600;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private static volatile CapturePlugin instance;

    /** 接收器在后台点「直接记一笔」时喊一声，App 在前台就能立刻写进账本。 */
    static void pingAutoRecord() {
        CapturePlugin plugin = instance;
        if (plugin == null) return;
        plugin.getBridge().getActivity().runOnUiThread(() ->
                plugin.notifyListeners("captureRecord", new JSObject(), true));
    }

    @Override
    public void load() {
        instance = this;
        // 冷启动被分享拉起时，立刻记下这张图，避免 onNewIntent 之前被清掉
        Uri shared = pickShareUri(getActivity() == null ? null : getActivity().getIntent());
        if (shared != null) {
            CaptureStore.setPendingPath(getContext(), shared.toString());
            CaptureStore.setPendingSource(getContext(), "share");
        }
        if (CaptureStore.isEnabled(getContext()) && !ScreenshotWatchService.running) {
            startService();
            // 后台限制下服务可能拉不起来，把自检闹钟排上，30 秒后再试
            ScreenshotWatchService.scheduleHeartbeat(getContext());
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null) return;
        Uri shared = pickShareUri(intent);
        if (shared != null) {
            worker.execute(() -> {
                String dataUrl = readDataUrl(shared);
                if (dataUrl != null) {
                    CaptureStore.setPendingPath(getContext(), dataUrl);
                    CaptureStore.setPendingSource(getContext(), "share");
                    notifyListeners("capture", new JSObject().put("source", "share"), true);
                }
            });
            intent.removeExtra(Intent.EXTRA_STREAM);
            return;
        }
        String pending = intent.getStringExtra(EXTRA_PENDING);
        if (pending != null) {
            CaptureStore.setPendingPath(getContext(), pending);
            CaptureStore.setPendingSource(getContext(), "screenshot");
            notifyListeners("capture", new JSObject().put("source", "screenshot"), true);
            intent.removeExtra(EXTRA_PENDING);
        }
    }

    /** 取走当前等待的图（分享或截图），没有就返回空。 */
    @PluginMethod
    public void consume(PluginCall call) {
        String pending = CaptureStore.pendingPath(getContext());
        String source = CaptureStore.pendingSource(getContext());
        CaptureStore.clearPendingPath(getContext());
        if (pending == null || pending.isEmpty()) {
            call.resolve(new JSObject());
            return;
        }
        worker.execute(() -> {
            String dataUrl = pending.startsWith("content:") || pending.startsWith("file:")
                    ? readDataUrl(Uri.parse(pending))
                    : pending.startsWith("data:")
                        ? pending
                        : readFileDataUrl(new File(pending));
            JSObject ret = new JSObject();
            if (dataUrl == null) {
                call.resolve(ret);
                return;
            }
            ret.put("dataUrl", dataUrl);
            ret.put("source", source == null ? "share" : source);
            if ("screenshot".equals(source)) {
                // 这张截图已经在 App 里打开了：把它移出待确认队列，省得下次再弹一次
                JSONObject shot = CaptureStore.findShotByPath(getContext(), pending);
                if (shot != null) {
                    ret.put("text", shot.optString("text", ""));
                    int notifyId = shot.optInt("notifyId", 0);
                    CaptureStore.removeShot(getContext(), shot.optLong("key", 0L));
                    NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null && notifyId > 0) nm.cancel(notifyId);
                }
            }
            call.resolve(ret);
        });
    }

    /**
     * 取走通知里「直接记一笔」暂存的记录。
     * App 没在前台时也能先点确认，等下次启动/回到前台再真正写进账本。
     */
    @PluginMethod
    public void drainAutoRecords(PluginCall call) {
        JSArray records = new JSArray();
        String raw = CaptureStore.takeAutoRecords(getContext());
        if (!raw.isEmpty()) {
            try {
                JSONArray arr = new JSONArray(raw);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject item = arr.optJSONObject(i);
                    if (item == null) continue;
                    JSObject one = new JSObject();
                    one.put("seq", item.optInt("seq", 0));
                    one.put("amountCents", item.optLong("amountCents", 0L));
                    one.put("text", item.optString("text", ""));
                    one.put("createdAt", item.optLong("createdAt", 0L));
                    records.put(one);
                }
            } catch (Throwable t) {
                Log.w("SnoopyCapture", "drain records failed", t);
            }
        }
        JSObject ret = new JSObject();
        ret.put("records", records);
        call.resolve(ret);
    }

    /**
     * 前端写完账本后确认这一批已落库，原生才把「在途」存档清掉。
     * 不确认就一直保留，进程被杀/写库失败都不会丢记录。
     */
    @PluginMethod
    public void ackAutoRecords(PluginCall call) {
        CaptureStore.ackAutoRecords(getContext());
        call.resolve();
    }

    @PluginMethod
    public void watchStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M);
        ret.put("enabled", CaptureStore.isEnabled(getContext()));
        ret.put("running", ScreenshotWatchService.running);
        ret.put("permission", imagePermission());

        // 通知是否真的能弹横幅：权限在、渠道重要性是「高」、没开勿扰，三者缺一系统就不会从顶部弹出
        JSObject notice = new JSObject();
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        boolean notifications = nm == null || nm.areNotificationsEnabled();
        int importance = -1;
        if (nm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = nm.getNotificationChannel(ScreenshotWatchService.CHANNEL_FOUND);
            if (channel != null) importance = channel.getImportance();
        }
        boolean dnd = Settings.Global.getInt(getContext().getContentResolver(), "zen_mode", 0) != 0;
        notice.put("notifications", notifications);
        notice.put("importance", importance);
        notice.put("channel", ScreenshotWatchService.CHANNEL_FOUND);
        notice.put("dnd", dnd);
        ret.put("notice", notice);

        // 厂商省电策略会把后台冻住：截屏时没反应，等回到 App 积压的才一起弹。
        // 让用户一键把 App 加进「不受电池优化限制」，是这类问题唯一可靠的解法。
        boolean battery;
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            battery = pm == null || pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        } catch (Throwable t) {
            battery = true;
        }
        ret.put("battery", battery);
        ret.put("lastCheckAt", CaptureStore.lastCheckAt(getContext()));
        // 有「显示在其他应用上层」才能自己画顶部卡片；没有就只能靠系统通知，弹不弹看厂商
        ret.put("overlay", CaptureOverlay.permitted(getContext()) ? "granted" : "denied");

        call.resolve(ret);
    }

    /** 弹系统的「显示在其他应用上层」设置页，允许后截屏就能从顶部滑出卡片 */
    @PluginMethod
    public void requestOverlay(PluginCall call) {
        if (CaptureOverlay.permitted(getContext())) {
            JSObject ret = new JSObject();
            ret.put("overlay", "granted");
            call.resolve(ret);
            return;
        }
        try {
            getContext().startActivity(CaptureOverlay.permissionIntent(getContext()));
            JSObject ret = new JSObject();
            ret.put("overlay", "prompt");
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("打不开系统设置，请手动到设置里允许「显示在其他应用上层」", "capture_overlay_failed");
        }
    }

    /** 弹系统的「不受电池优化限制」确认框；用户允许后后台就不容易被冻住 */
    @PluginMethod
    public void requestIgnoreBattery(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Throwable t) {
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Throwable second) {
                call.reject("打不开电池设置，请手动到系统设置里把「使劲燃的钱」设为不受限制", "capture_battery_failed");
            }
        }
    }

    /** 跳到「截图记账提醒」这条通知渠道的系统设置页，让用户把横幅打开 */
    @PluginMethod
    public void openNoticeSettings(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
                intent.putExtra(Settings.EXTRA_CHANNEL_ID, ScreenshotWatchService.CHANNEL_FOUND);
            } else {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra("app_package", getContext().getPackageName());
                intent.putExtra("app_uid", getContext().getApplicationInfo().uid);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Throwable t) {
            call.reject("打不开通知设置，请手动到系统设置里允许「截图记账提醒」弹出横幅", "capture_settings_failed");
        }
    }

    @PluginMethod
    public void enableWatch(PluginCall call) {
        String[] needed = neededPermissions();
        boolean ok = true;
        for (String alias : needed) {
            if (getPermissionState(alias) != PermissionState.GRANTED) ok = false;
        }
        if (!ok) {
            requestPermissionForAliases(needed, call, "onEnablePermission");
            return;
        }
        startWatch(call);
    }

    @PermissionCallback
    private void onEnablePermission(PluginCall call) {
        for (String alias : neededPermissions()) {
            if (getPermissionState(alias) != PermissionState.GRANTED) {
                call.reject("需要相册权限才能监听截图；也可以先用分享方式记账", "capture_permission_denied");
                return;
            }
        }
        startWatch(call);
    }

    @PluginMethod
    public void disableWatch(PluginCall call) {
        CaptureStore.setEnabled(getContext(), false);
        // 只有用户主动关闭才取消自检闹钟；系统停服务时闹钟必须留着
        ScreenshotWatchService.cancelHeartbeat(getContext());
        // 关掉以后不该留着「识别到 ¥X」和它指向的截图，否则点开是个没用的弹层
        CaptureStore.clearPendingPath(getContext());
        try {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            JSONArray shots = CaptureStore.clearShots(getContext());
            for (int i = 0; i < shots.length(); i++) {
                JSONObject item = shots.optJSONObject(i);
                if (item == null) continue;
                int id = item.optInt("notifyId", 0);
                if (nm != null && id > 0) nm.cancel(id);
                String path = item.optString("path", "");
                if (!path.isEmpty()) new File(path).delete();
            }
            if (nm != null) nm.cancel(4301); // 1.4.7 及更早版本的固定通知 id
        } catch (Throwable ignored) {
        }
        try {
            getContext().stopService(new Intent(getContext(), ScreenshotWatchService.class));
        } catch (Throwable ignored) {
        }
        JSObject ret = new JSObject();
        ret.put("enabled", false);
        call.resolve(ret);
    }

    private void startWatch(PluginCall call) {
        CaptureStore.setEnabled(getContext(), true);
        boolean started = startService();
        JSObject ret = new JSObject();
        ret.put("enabled", true);
        ret.put("running", started || ScreenshotWatchService.running);
        call.resolve(ret);
    }

    private boolean startService() {
        try {
            Intent intent = new Intent(getContext(), ScreenshotWatchService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    private String[] neededPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return new String[] { "images", "notify" };
        }
        return new String[] { "storage" };
    }

    private String imagePermission() {
        String alias = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "images" : "storage";
        PermissionState state = getPermissionState(alias);
        if (state == null) return "prompt";
        switch (state) {
            case GRANTED:
                return "granted";
            case DENIED:
                return "denied";
            default:
                return "prompt";
        }
    }

    private Uri pickShareUri(Intent intent) {
        if (intent == null) return null;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return null;
        Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri != null) return uri;
        ClipData clip = intent.getClipData();
        if (clip != null && clip.getItemCount() > 0) return clip.getItemAt(0).getUri();
        return null;
    }

    private String readDataUrl(Uri uri) {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) return null;
            byte[] bytes = readAll(input);
            if (bytes == null) return null;
            return toDataUrl(bytes);
        } catch (Throwable t) {
            return null;
        }
    }

    private String readFileDataUrl(File file) {
        if (file == null || !file.exists()) return null;
        try (InputStream input = new FileInputStream(file)) {
            byte[] bytes = readAll(input);
            if (bytes == null) return null;
            return toDataUrl(bytes);
        } catch (Throwable t) {
            return null;
        }
    }

    private byte[] readAll(InputStream input) {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) > 0) {
                total += read;
                if (total > MAX_SHARE_BYTES) return null;
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        } catch (Throwable t) {
            return null;
        }
    }

    private String toDataUrl(byte[] bytes) {
        Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (bitmap == null) return null;
        Bitmap out = bitmap;
        int side = Math.max(bitmap.getWidth(), bitmap.getHeight());
        if (side > MAX_SIDE) {
            float ratio = MAX_SIDE / (float) side;
            out = Bitmap.createScaledBitmap(bitmap, Math.max(1, Math.round(bitmap.getWidth() * ratio)),
                    Math.max(1, Math.round(bitmap.getHeight() * ratio)), true);
        }
        ByteArrayOutputStream stream = new ByteArrayOutputStream();
        out.compress(Bitmap.CompressFormat.JPEG, 92, stream);
        if (out != bitmap) out.recycle();
        bitmap.recycle();
        byte[] jpeg = stream.toByteArray();
        return "data:image/jpeg;base64," + Base64.encodeToString(jpeg, Base64.NO_WRAP);
    }
}