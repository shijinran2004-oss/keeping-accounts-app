package com.shijinran.money.capture;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.shijinran.money.R;

import java.util.Locale;

/**
 * 通知上两个按钮的落点：
 * 「直接记一笔」把金额先存进本地队列，前端下次启动/回到前台时写进账本；
 * 「取消」直接丢掉这张截图。两条路径都顺手把通知收起来。
 */
public class CaptureCancelReceiver extends BroadcastReceiver {

    static final String ACTION_CANCEL = "com.shijinran.money.capture.CANCEL";
    static final String ACTION_RECORD = "com.shijinran.money.capture.RECORD";

    private static final String CHANNEL_DONE = "screenshot_done";
    private static final int NOTIFY_DONE_ID = 4302;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_RECORD.equals(action)) {
            record(context, intent);
            return;
        }
        try {
            CaptureStore.clearPendingPath(context);
            cancelFound(context);
        } catch (Throwable t) {
            Log.w("SnoopyCapture", "cancel pending failed", t);
        }
    }

    /** 只认通知当前指向的那张截图，连点两下也只会记一笔。 */
    private void record(Context context, Intent intent) {
        try {
            long amount = intent.getLongExtra(ScreenshotWatchService.EXTRA_AMOUNT, 0L);
            String text = intent.getStringExtra(ScreenshotWatchService.EXTRA_TEXT);
            String path = intent.getStringExtra(ScreenshotWatchService.EXTRA_PATH);
            String pending = CaptureStore.pendingPath(context);
            boolean current = path == null || path.equals(pending);
            if (current && amount > 0) {
                CaptureStore.pushAutoRecord(context, amount, text);
            }
            if (current) CaptureStore.clearPendingPath(context);
            cancelFound(context);
            if (current && amount > 0) notifyDone(context, amount);
            Log.d("SnoopyCapture", "record ¥" + amount + " queued=" + (current && amount > 0));
        } catch (Throwable t) {
            Log.w("SnoopyCapture", "record failed", t);
        }
    }

    private void cancelFound(Context context) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ScreenshotWatchService.NOTIFY_FOUND_ID);
    }

    /** 静静地回一条「已记账」，几秒后自己消失，不弹横幅也不再振动。 */
    private void notifyDone(Context context, long amountCents) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm.createNotificationChannel(new NotificationChannel(
                        CHANNEL_DONE, "截图记账结果", NotificationManager.IMPORTANCE_MIN));
            }
            String money = String.format(Locale.US, "%.2f", amountCents / 100.0);
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_DONE)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle("已记账 ¥" + money)
                    .setContentText("不用打开 App，下次打开就能看到这笔")
                    .setPriority(NotificationCompat.PRIORITY_MIN)
                    .setSilent(true)
                    .setAutoCancel(true)
                    .setTimeoutAfter(6_000L);
            nm.notify(NOTIFY_DONE_ID, builder.build());
        } catch (Throwable t) {
            Log.w("SnoopyCapture", "done notice failed", t);
        }
    }
}
