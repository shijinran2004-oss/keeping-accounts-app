package com.shijinran.money.capture;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

/**
 * 通知栏监听：只在「静默记账」模式下工作。
 * 微信/支付宝/银行 App 的付款通知一到，就按 NotifyRules 认金额、方向、商户，
 * 直接入账并留一条可撤销的通知；不是这几家 App、不是付款结果的，一律不看。
 *
 * 系统里授权「通知使用权」后这个服务才会被绑定，代码里拿不到；
 * 用户没开或关掉静默模式时，这里什么都不做。
 */
public class NotifyWatchService extends NotificationListenerService {

    private static final String TAG = "SnoopyCapture";

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        RulesLoader.ensure(this);
        Log.d(TAG, "notify listener connected mode=" + CaptureStore.mode(this));
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        try {
            if (!CaptureStore.MODE_SILENT.equals(CaptureStore.mode(this))) return;
            Notification n = sbn.getNotification();
            if (n == null) return;
            // 常驻通知（正在播放、正在导航…）不是账单
            if ((n.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;
            String pkg = sbn.getPackageName();
            Log.d(TAG, "notify hit pkg=" + pkg + " ongoing=" + ((n.flags & Notification.FLAG_ONGOING_EVENT) != 0));
            if (pkg == null || pkg.equals(getPackageName())) return;
            RulesLoader.ensure(this);
            if (!NotifyRules.isReady()) return;
            Bundle extras = n.extras;
            if (extras == null) return;
            String title = text(extras.getCharSequence(Notification.EXTRA_TITLE));
            String body = text(extras.getCharSequence(Notification.EXTRA_TEXT));
            String big = text(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
            String sub = text(extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
            NotifyRules.Parsed parsed = NotifyRules.parse(pkg, title, body, big, sub);
            if (parsed == null) {
                Log.d(TAG, "notify skip pkg=" + pkg + " ready=" + NotifyRules.isReady() + " title=" + title + " body=" + body);
                return;
            }
            long now = System.currentTimeMillis();
            // 同一条通知经常重复投递（更新/重发），10 分钟内同一段文案只算一次
            String seen = "n:" + parsed.key;
            if (CaptureStore.seenRecently(this, seen, now, 10 * 60_000L)) return;
            CaptureStore.markRecent(this, seen, now);
            long seq = SilentRecorder.record(this, parsed.cents, parsed.text, parsed.type,
                    parsed.merchant, parsed.platform, "notify");
            Log.d(TAG, "notify pkg=" + pkg + " type=" + parsed.type + " ¥" + parsed.amount
                    + " seq=" + seq + (seq < 0 ? " (duplicate)" : ""));
        } catch (Throwable t) {
            Log.w(TAG, "notify parse failed", t);
        }
    }

    private static String text(CharSequence value) {
        return value == null ? "" : value.toString().trim();
    }
}
