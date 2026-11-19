package com.shijinran.money.capture;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.shijinran.money.R;

import java.util.Locale;

/**
 * 静默记账：认出金额就自己记一笔，同时在通知栏留一条安静的「撤销」。
 * 通知监听（NotifyWatchService）和截图（ScreenshotWatchService）两条路都走这里，
 * 同金额同方向 90 秒内只记一次，避免通知和截图把同一笔记成两笔。
 */
final class SilentRecorder {

    private static final String TAG = "SnoopyCapture";
    static final String CHANNEL_AUTO = "silent_record";
    private static final int NOTIFY_AUTO_BASE = 4600;
    /** 同金额、同方向：90 秒内只记一次 */
    private static final long AUTO_DEDUPE_MS = 90_000L;

    private SilentRecorder() {}

    /** 记一笔静默账单，返回 seq；被去重掉时返回 -1。 */
    static long record(Context context, long cents, String text, String type, String merchant,
                       String platform, String source) {
        if (cents <= 0) return -1;
        long now = System.currentTimeMillis();
        if (CaptureStore.seenAutoAmount(context, cents, type, now, AUTO_DEDUPE_MS)) {
            Log.d(TAG, "silent duplicate ¥" + String.format(Locale.US, "%d.%02d", cents / 100, cents % 100)
                    + " " + type + " from=" + source);
            return -1;
        }
        CaptureStore.markAutoAmount(context, cents, type, now);
        long seq = CaptureStore.pushAutoRecord(context, cents, text, type, merchant, platform, source);
        if (seq <= 0) return -1;
        CaptureStore.bumpStat(context, "silent");
        notifyUndo(context, seq, cents, type, merchant, platform);
        // App 在前台时让 JS 立刻把队列写进账本
        CapturePlugin.pingAutoRecord();
        Log.d(TAG, "silent ¥" + String.format(Locale.US, "%.2f", cents / 100.0)
                + " type=" + type + " seq=" + seq + " from=" + source);
        return seq;
    }

    static int notifyId(long seq) {
        return NOTIFY_AUTO_BASE + (int) (seq % 400);
    }

    private static void notifyUndo(Context context, long seq, long cents, String type,
                                   String merchant, String platform) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm.createNotificationChannel(new NotificationChannel(
                        CHANNEL_AUTO, "自动记账", NotificationManager.IMPORTANCE_LOW));
            }
            String money = String.format(Locale.US, "%.2f", cents / 100.0);
            boolean income = NotifyRules.TYPE_INCOME.equals(type);
            String who = merchant != null && !merchant.isEmpty() ? merchant : platform;
            String title = (income ? "收到 ¥" : "已记一笔 ¥") + money;
            String body = who == null || who.isEmpty()
                    ? "静默记账已写进账本，点开 App 可以撤销"
                    : who + " · 已写进账本，点开 App 可以撤销";
            Intent undo = new Intent(context, CaptureCancelReceiver.class);
            undo.setAction(CaptureCancelReceiver.ACTION_UNDO);
            undo.putExtra(CaptureCancelReceiver.EXTRA_SEQ, seq);
            PendingIntent action = PendingIntent.getBroadcast(context, (int) (seq % 400), undo,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            // 有些 ROM（MIUI/HyperOS）把动作按钮藏起来，点通知直接回 App 首页也能撤销
            PendingIntent open = null;
            Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                open = PendingIntent.getActivity(context, (int) (seq % 400) + 10_000, launch,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            }
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_AUTO)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setContentIntent(open)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setSilent(true)
                    .setAutoCancel(true)
                    .setTimeoutAfter(10 * 60_000L)
                    .addAction(0, "撤销", action);
            nm.notify(notifyId(seq), builder.build());
        } catch (Throwable t) {
            Log.w(TAG, "undo notice failed", t);
        }
    }
}
