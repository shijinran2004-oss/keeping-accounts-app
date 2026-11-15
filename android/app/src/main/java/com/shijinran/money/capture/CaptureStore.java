package com.shijinran.money.capture;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

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
    private static final String KEY_LAST_SEEN = "lastSeenAt";
    private static final String KEY_SEEN_IDS = "seenIds";
    private static final String KEY_AUTO = "autoRecords";
    private static final int SEEN_IDS_KEEP = 40;
    private static final int AUTO_KEEP = 30;

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

    /** 已经扫到过的最大 DATE_ADDED（秒）。MediaStore 的 _ID 会被回收重用，不能当游标。 */
    static long lastSeenAt(Context context) {
        return prefs(context).getLong(KEY_LAST_SEEN, 0L);
    }

    static void setLastSeenAt(Context context, long seconds) {
        prefs(context).edit().putLong(KEY_LAST_SEEN, seconds).apply();
    }

    /** 同一秒内的行会被重复查出来，用这组 id 去重。 */
    static Set<Long> seenIds(Context context) {
        Set<Long> ids = new HashSet<>();
        String raw = prefs(context).getString(KEY_SEEN_IDS, "");
        if (raw == null || raw.isEmpty()) return ids;
        for (String part : raw.split(",")) {
            if (part.isEmpty()) continue;
            try {
                ids.add(Long.parseLong(part));
            } catch (NumberFormatException ignored) {
            }
        }
        return ids;
    }

    static void addSeenId(Context context, long id) {
        String raw = prefs(context).getString(KEY_SEEN_IDS, "");
        if (raw == null) raw = "";
        raw = raw.isEmpty() ? String.valueOf(id) : raw + "," + id;
        String[] parts = raw.split(",");
        StringBuilder sb = new StringBuilder();
        int start = Math.max(0, parts.length - SEEN_IDS_KEEP);
        for (int i = start; i < parts.length; i++) {
            if (parts[i].isEmpty()) continue;
            if (sb.length() > 0) sb.append(',');
            sb.append(parts[i]);
        }
        prefs(context).edit().putString(KEY_SEEN_IDS, sb.toString()).apply();
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

    /**
     * 通知里点了「直接记一笔」：先把金额和识别文字暂存在这里，
     * 等前端下次启动/回到前台时取走写进账本。App 没在跑也能先记下来。
     */
    static synchronized void pushAutoRecord(Context context, long amountCents, String text) {
        try {
            JSONArray arr = autoRecords(context);
            JSONObject item = new JSONObject();
            item.put("amountCents", amountCents);
            item.put("text", text == null ? "" : text);
            item.put("createdAt", System.currentTimeMillis());
            arr.put(item);
            while (arr.length() > AUTO_KEEP) arr.remove(0);
            prefs(context).edit().putString(KEY_AUTO, arr.toString()).apply();
        } catch (Throwable ignored) {
        }
    }

    /** 取走所有待入账的记录并清空；前端拿到的就是原生识别的那一刻的结果。 */
    static synchronized String takeAutoRecords(Context context) {
        String raw = prefs(context).getString(KEY_AUTO, "");
        prefs(context).edit().remove(KEY_AUTO).apply();
        return raw == null ? "" : raw;
    }

    private static JSONArray autoRecords(Context context) {
        String raw = prefs(context).getString(KEY_AUTO, "");
        if (raw == null || raw.isEmpty()) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (Throwable t) {
            return new JSONArray();
        }
    }
}
