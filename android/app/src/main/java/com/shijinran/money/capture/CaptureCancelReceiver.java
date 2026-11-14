package com.shijinran.money.capture;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * 通知上「取消」按钮的落点：丢掉待确认的截图，顺手把通知收起来。
 * 只做这一件事，所以单独一个小接收器，不依赖服务是否还活着。
 */
public class CaptureCancelReceiver extends BroadcastReceiver {

    static final String ACTION_CANCEL = "com.shijinran.money.capture.CANCEL";

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            CaptureStore.clearPendingPath(context);
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(ScreenshotWatchService.NOTIFY_FOUND_ID);
        } catch (Throwable t) {
            Log.w("SnoopyCapture", "cancel pending failed", t);
        }
    }
}
