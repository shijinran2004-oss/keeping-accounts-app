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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.Locale;

/**
 * 截图提醒的两个动作：记账和丢弃。
 * 通知上的按钮走广播进到这里；顶部弹窗（{@link CaptureOverlay}）直接调下面两个静态方法，
 * 两条路共用同一份逻辑，不会一边记一边不记。
 */
public class CaptureCancelReceiver extends BroadcastReceiver {

    static final String ACTION_CANCEL = "com.shijinran.money.capture.CANCEL";
    static final String ACTION_RECORD = "com.shijinran.money.capture.RECORD";

    private static final String TAG = "SnoopyCapture";
    private static final String CHANNEL_DONE = "screenshot_done";
    private static final int NOTIFY_DONE_ID = 4302;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_RECORD.equals(action)) {
            recordShot(context,
                    intent.getLongExtra(ScreenshotWatchService.EXTRA_KEY, 0L),
                    intent.getIntExtra(ScreenshotWatchService.EXTRA_NOTIFY_ID, 0),
                    intent.getLongExtra(ScreenshotWatchService.EXTRA_AMOUNT, 0L),
                    intent.getStringExtra(ScreenshotWatchService.EXTRA_TEXT));
        } else {
            cancelShot(context,
                    intent == null ? 0L : intent.getLongExtra(ScreenshotWatchService.EXTRA_KEY, 0L),
                    intent == null ? 0 : intent.getIntExtra(ScreenshotWatchService.EXTRA_NOTIFY_ID, 0));
        }
    }

    /**
     * 只认通知当前指向的那一张，连点两下也只会记一笔。
     * 队列里找不到它时不能默默收掉通知：用户看到「有反应」却什么都没记，
     * 那是最糟的一种失败。所以按「记过没有」分两种情况处理：
     * 已记过 → 收通知（防重复两笔）；没记过 → 用通知/弹窗自带的金额补记。
     */
    static void recordShot(Context context, long key, int notifyId, long amount, String text) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            JSONObject shot = key != 0 ? CaptureStore.removeShot(context, key) : null;
            if (shot != null) {
                amount = shot.optLong("amountCents", amount);
                text = shot.optString("text", text);
                deleteFile(shot);
            } else if (key != 0) {
                // 队列里没有这张：多半是点通知正文进来时已经被 consume 取走，
                // 或者进程被回收后队列刚好被挤掉。只要还没记过，就用带来的金额补上。
                if (CaptureStore.isRecorded(context, key)) {
                    if (nm != null && notifyId > 0) nm.cancel(notifyId);
                    Log.d(TAG, "record ignored, already recorded key=" + key);
                    return;
                }
                Log.w(TAG, "shot gone, fallback to extra key=" + key);
            }

            if (amount <= 0) {
                // 兜底也拿不到金额：明确告诉用户没记上，而不是把通知收掉装作成功
                if (nm != null && notifyId > 0) nm.cancel(notifyId);
                notifyFailed(context);
                Log.w(TAG, "record failed, no amount key=" + key);
                return;
            }

            CaptureStore.pushAutoRecord(context, amount, text);
            if (key != 0) CaptureStore.markRecorded(context, key);
            if (nm != null && notifyId > 0) nm.cancel(notifyId);
            notifyDone(context, amount);
            // App 在前台时让 JS 立刻把队列写进账本，不用等切到后台再回来
            CapturePlugin.pingAutoRecord();
            Log.d(TAG, "record ¥" + amount + " queued=true");
        } catch (Throwable t) {
            Log.w(TAG, "record failed", t);
        }
    }

    static void cancelShot(Context context, long key, int notifyId) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (key != 0) {
                JSONObject shot = CaptureStore.removeShot(context, key);
                if (shot != null) deleteFile(shot);
                if (nm != null && notifyId > 0) nm.cancel(notifyId);
            } else {
                // 老版本的通知没有 key：整队清掉
                JSONArray all = CaptureStore.clearShots(context);
                for (int i = 0; i < all.length(); i++) {
                    JSONObject item = all.optJSONObject(i);
                    if (item == null) continue;
                    int id = item.optInt("notifyId", 0);
                    if (nm != null && id > 0) nm.cancel(id);
                    deleteFile(item);
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "cancel pending failed", t);
        }
    }

    private static void deleteFile(JSONObject shot) {
        try {
            String path = shot.optString("path", "");
            if (!path.isEmpty()) new File(path).delete();
        } catch (Throwable ignored) {
        }
    }

    /** 实在记不上时给个明确交代，别让用户以为记好了。 */
    private static void notifyFailed(Context context) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Intent open = new Intent(context, com.shijinran.money.MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            android.app.PendingIntent tap = android.app.PendingIntent.getActivity(context, 4303, open,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ScreenshotWatchService.CHANNEL_WATCH)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle("这张截图没记上")
                    .setContentText("金额没读出来，打开 App 手动记一笔吧")
                    .setPriority(NotificationCompat.PRIORITY_MIN)
                    .setContentIntent(tap)
                    .setAutoCancel(true)
                    .setTimeoutAfter(10_000L);
            nm.notify(NOTIFY_DONE_ID + 1, builder.build());
        } catch (Throwable t) {
            Log.w(TAG, "failed notice error", t);
        }
    }

    /** 静静地回一条「已记账」，几秒后自己消失，不弹横幅也不再振动。 */
    private static void notifyDone(Context context, long amountCents) {
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
            Log.w(TAG, "done notice failed", t);
        }
    }
}
