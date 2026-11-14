package com.shijinran.money.capture;

import android.Manifest;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

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

    @Override
    public void load() {
        // 冷启动被分享拉起时，立刻记下这张图，避免 onNewIntent 之前被清掉
        Uri shared = pickShareUri(getActivity() == null ? null : getActivity().getIntent());
        if (shared != null) {
            CaptureStore.setPendingPath(getContext(), shared.toString());
            CaptureStore.setPendingSource(getContext(), "share");
        }
        if (CaptureStore.isEnabled(getContext()) && !ScreenshotWatchService.running) {
            startService();
        }
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
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void watchStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M);
        ret.put("enabled", CaptureStore.isEnabled(getContext()));
        ret.put("running", ScreenshotWatchService.running);
        ret.put("permission", imagePermission());
        ret.put("overlay", CaptureOverlay.permitted(getContext()) ? "granted" : "denied");
        call.resolve(ret);
    }

    /** 去系统里给「显示在其他应用上层」权限，有它截屏后才能直接弹卡片。 */
    @PluginMethod
    public void requestOverlay(PluginCall call) {
        if (CaptureOverlay.permitted(getContext())) {
            call.resolve(new JSObject().put("overlay", "granted"));
            return;
        }
        try {
            getActivity().startActivity(CaptureOverlay.permissionIntent(getContext()));
        } catch (Throwable t) {
            call.reject("打不开系统设置，请手动到设置里允许「显示在其他应用上层」", "capture_overlay_failed");
            return;
        }
        call.resolve(new JSObject().put("overlay", "prompt"));
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
