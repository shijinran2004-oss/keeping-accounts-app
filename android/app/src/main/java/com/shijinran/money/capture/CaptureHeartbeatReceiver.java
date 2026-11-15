package com.shijinran.money.capture;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.shijinran.money.MainActivity;
import com.shijinran.money.R;

/**
 * 每 30 秒一次的自检。
 * 广播本身就能把被系统冻住的后台进程叫醒；醒来后：
 * 1) 服务还活着 → 直接让它补扫积压的截图；
 * 2) 服务已经被回收 → 试着拉起来，拉不动就留一条提示，等用户打开 App。
 */
public class CaptureHeartbeatReceiver extends BroadcastReceiver {

    static final String ACTION_HEARTBEAT = "com.shijinran.money.capture.HEARTBEAT";
    private static final String TAG = "SnoopyCapture";
    private static final int NOTICE_ID = 4103;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        if (!CaptureStore.isEnabled(context)) {
            ScreenshotWatchService.cancelHeartbeat(context);
            return;
        }
        // 先把下一次排上，免得中途出错整条自检链断掉
        ScreenshotWatchService.scheduleHeartbeat(context);
        ScreenshotWatchService service = ScreenshotWatchService.instance;
        if (service != null) {
            service.requestScanNow();
            return;
        }
        try {
            Intent start = new Intent(context, ScreenshotWatchService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(start);
            } else {
                context.startService(start);
            }
            Log.d(TAG, "heartbeat restarted watch service");
        } catch (Throwable t) {
            // Android 12+ 后台不允许直接拉起前台服务；只能提醒用户点一下 App
            Log.w(TAG, "heartbeat cannot restart service: " + t);
            noticeStopped(context);
        }
    }

    private void noticeStopped(Context context) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Intent open = new Intent(context, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent tap = PendingIntent.getActivity(context, 4104, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ScreenshotWatchService.CHANNEL_WATCH)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle("截图记账需要打开一次 App")
                    .setContentText("系统把后台回收了；打开一下「使劲燃的钱」就能恢复截屏提醒")
                    .setPriority(NotificationCompat.PRIORITY_MIN)
                    .setContentIntent(tap)
                    .setAutoCancel(true);
            nm.notify(NOTICE_ID, builder.build());
        } catch (Throwable ignored) {
        }
    }
}
