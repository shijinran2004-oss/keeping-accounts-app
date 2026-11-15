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
 * 通知上两个按钮的落点：
 * 「直接记一笔」把这一张截图移出待确认队列、金额和识别文字存进待入账队列；
 * 「取消」把这一张丢掉。
 * 两者都只处理自己那条通知对应的截图，连拍多张时互不影响。
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
            record(context, intent);
        } else {
            cancel(context, intent);
        }
    }

    /** 只认通知当前指向的那一张，连点两下也只会记一笔。 */
    private void record(Context context, Intent intent) {
        try {
            long key = intent.getLongExtra(ScreenshotWatchService.EXTRA_KEY, 0L);
            int notifyId = intent.getIntExtra(ScreenshotWatchService.EXTRA_NOTIFY_ID, 0);
            long amount = intent.getLongExtra(ScreenshotWatchService.EXTRA_AMOUNT, 0L);
            String text = intent.getStringExtra(ScreenshotWatchService.EXTRA_TEXT);

            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (key != 0) {
                // 新通知都带 key：金额和文字只认待确认队列里那一条。
                // 如果队列里已经没有它（已经记过、或者刚点了取消），说明这是重复点击，
                // 直接收掉通知返回——绝不能回退去用 intent 里的金额再记第二笔。
                JSONObject shot = CaptureStore.removeShot(context, key);
                if (shot == null) {
                    if (nm != null && notifyId > 0) nm.cancel(notifyId);
                    Log.d(TAG, "record ignored, shot gone key=" + key);
                    return;
                }
                amount = shot.optLong("amountCents", amount);
                text = shot.optString("text", text);
                deleteFile(shot);
            }
            if (amount > 0) CaptureStore.pushAutoRecord(context, amount, text);

            if (nm != null && notifyId > 0) nm.cancel(notifyId);
            if (amount > 0) notifyDone(context, amount);
            // App 在前台时让 JS 立刻把队列写进账本，不用等切到后台再回来
            if (amount > 0) CapturePlugin.pingAutoRecord();
            Log.d(TAG, "record ¥" + amount + " queued=" + (amount > 0));
        } catch (Throwable t) {
            Log.w(TAG, "record failed", t);
        }
    }

    private void cancel(Context context, Intent intent) {
        try {
            long key = intent.getLongExtra(ScreenshotWatchService.EXTRA_KEY, 0L);
            int notifyId = intent.getIntExtra(ScreenshotWatchService.EXTRA_NOTIFY_ID, 0);
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

    private void deleteFile(JSONObject shot) {
        try {
            String path = shot.optString("path", "");
            if (!path.isEmpty()) new File(path).delete();
        } catch (Throwable ignored) {
        }
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
            Log.w(TAG, "done notice failed", t);
        }
    }
}
