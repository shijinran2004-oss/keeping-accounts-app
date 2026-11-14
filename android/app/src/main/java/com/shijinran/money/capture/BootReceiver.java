package com.shijinran.money.capture;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

/**
 * 开机后把截图监听接回来。
 * 前台服务本身不会跨重启存活，如果没人拉它，开关还显示「已开启」但截屏不再提醒。
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "SnoopyCapture";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.LOCKED_BOOT_COMPLETED".equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }
        if (!CaptureStore.isEnabled(context)) return;
        String permission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? Manifest.permission.READ_MEDIA_IMAGES
                : Manifest.permission.READ_EXTERNAL_STORAGE;
        if (context.checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "watch enabled but image permission missing, skip boot start");
            return;
        }
        try {
            Intent service = new Intent(context, ScreenshotWatchService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(service);
            } else {
                context.startService(service);
            }
            Log.d(TAG, "watch restored after " + action);
        } catch (Throwable t) {
            Log.w(TAG, "boot restart failed", t);
        }
    }
}
