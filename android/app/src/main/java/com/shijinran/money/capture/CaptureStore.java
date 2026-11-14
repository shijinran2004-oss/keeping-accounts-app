package com.shijinran.money.capture;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 截图记账的本地开关与游标。用 SharedPreferences 而不是账本设置：
 * 它只描述「这台手机上的监听状态」，不属于账本数据，也不需要参与备份。
 */
final class CaptureStore {

    private static final String PREFS = "shijinran.capture";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_LAST_ID = "lastImageId";
    private static final String KEY_PENDING = "pendingPath";
    private static final String KEY_SOURCE = "pendingSource";
    private static final String KEY_LAST_NOTICE = "lastNoticeAt";

    private CaptureStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, false);
    }

    static void setEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    static long lastId(Context context) {
        return prefs(context).getLong(KEY_LAST_ID, 0L);
    }

    static void setLastId(Context context, long id) {
        prefs(context).edit().putLong(KEY_LAST_ID, id).apply();
    }

    static String pendingPath(Context context) {
        return prefs(context).getString(KEY_PENDING, null);
    }

    static void setPendingPath(Context context, String path) {
        prefs(context).edit().putString(KEY_PENDING, path).apply();
    }

    static void clearPendingPath(Context context) {
        prefs(context).edit().remove(KEY_PENDING).remove(KEY_SOURCE).apply();
    }

    /** 这张图是分享进来的（share）还是截图监听来的（screenshot）。 */
    static String pendingSource(Context context) {
        return prefs(context).getString(KEY_SOURCE, null);
    }

    static void setPendingSource(Context context, String source) {
        prefs(context).edit().putString(KEY_SOURCE, source).apply();
    }

    static long lastNoticeAt(Context context) {
        return prefs(context).getLong(KEY_LAST_NOTICE, 0L);
    }

    static void setLastNoticeAt(Context context, long at) {
        prefs(context).edit().putLong(KEY_LAST_NOTICE, at).apply();
    }
}
