package com.shijinran.money.capture;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * 截图记账的本地状态：
 * 1) 开关与扫描游标；
 * 2) 待确认的截图队列（每张一条通知，各自能「直接记一笔」）；
 * 3) 已确认、等前端写进账本的记录。
 * 用 SharedPreferences 而不是账本设置：它只描述「这台手机上的监听状态」。
 */
final class CaptureStore {

    private static final String PREFS = "shijinran.capture";
    private static final String KEY_ENABLED = "enabled";

    private static final String KEY_PENDING = "pendingPath";
    private static final String KEY_SOURCE = "pendingSource";
    private static final String KEY_LAST_NOTICE = "lastNoticeAt";
    private static final String KEY_LAST_SEEN = "lastSeenAt";
    private static final String KEY_SEEN_IDS = "seenIds";
    private static final String KEY_AUTO = "autoRecords";
    /** 已经交给前端、还没确认写进账本的那一批：进程中途死了也不会丢 */
    private static final String KEY_AUTO_BACKUP = "autoRecordsInflight";
    private static final String KEY_AUTO_SEQ = "autoRecordSeq";
    private static final String KEY_SHOTS = "pendingShots";
    private static final String KEY_NOTIFY_SEQ = "notifySeq";
    private static final String KEY_LAST_CHECK = "lastCheckAt";
    /** 已经记过账的截图 key：防止重复点「直接记一笔」记两笔 */
    private static final String KEY_RECORDED = "recordedKeys";
    private static final int SEEN_IDS_KEEP = 40;
    private static final int RECORDED_KEEP = 40;
    private static final int AUTO_KEEP = 100;
    static final int SHOTS_KEEP = 5;
    private static final int NOTIFY_SEQ_MIN = 4301;
    private static final int NOTIFY_SEQ_MAX = 4499;

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

    /** 分享进来的图（截图走 pendingShots 队列）。 */
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

    /** 后台最近一次成功扫过媒体库的时间；用来判断监听是不是被系统冻住了。 */
    static long lastCheckAt(Context context) {
        return prefs(context).getLong(KEY_LAST_CHECK, 0L);
    }

    static void setLastCheckAt(Context context, long at) {
        prefs(context).edit().putLong(KEY_LAST_CHECK, at).apply();
    }

    /** 已经扫到过的最大 DATE_ADDED（秒）。MediaStore 的 _ID 会被回收重用，不能当游标。 */
    static long lastSeenAt(Context context) {
        return prefs(context).getLong(KEY_LAST_SEEN, 0L);
    }

    static void setLastSeenAt(Context context, long seconds) {
        prefs(context).edit().putLong(KEY_LAST_SEEN, seconds).apply();
    }

    /** 同一秒内的行会被重复查出来，用这组 key（_ID:DATE_ADDED）去重。 */
    static Set<String> seenIds(Context context) {
        Set<String> ids = new HashSet<>();
        String raw = prefs(context).getString(KEY_SEEN_IDS, "");
        if (raw == null || raw.isEmpty()) return ids;
        for (String part : raw.split(",")) {
            if (part.isEmpty()) continue;
            ids.add(part);
        }
        return ids;
    }

    static void addSeenId(Context context, String key) {
        String raw = prefs(context).getString(KEY_SEEN_IDS, "");
        if (raw == null) raw = "";
        raw = raw.isEmpty() ? key : raw + "," + key;
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

    static final int RECENT_KEEP = 20;
    private static final String KEY_RECENT = "recentShots";

    /** 最近处理过的账单去重 hash：同一张账单在 ttl 内只弹一次。 */
    static synchronized boolean seenRecently(Context context, String hash, long now, long ttlMs) {
        JSONArray arr = recentShots(context);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject item = arr.optJSONObject(i);
            if (item != null && hash.equals(item.optString("h")) && now - item.optLong("t", 0L) <= ttlMs) return true;
        }
        return false;
    }

    static synchronized void markRecent(Context context, String hash, long now) {
        try {
            JSONArray arr = recentShots(context);
            JSONObject item = new JSONObject();
            item.put("h", hash);
            item.put("t", now);
            arr.put(item);
            JSONArray kept = new JSONArray();
            for (int i = Math.max(0, arr.length() - RECENT_KEEP); i < arr.length(); i++) kept.put(arr.opt(i));
            prefs(context).edit().putString(KEY_RECENT, kept.toString()).apply();
        } catch (Throwable ignored) {
        }
    }

    private static JSONArray recentShots(Context context) {
        String raw = prefs(context).getString(KEY_RECENT, "");
        if (raw == null || raw.isEmpty()) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (Throwable t) {
            return new JSONArray();
        }
    }

    /** 本地计数（shown / confirmed / cancelled 等），用来算「弹卡 → 确认 / 取消」的比例。 */
    static synchronized void bumpStat(Context context, String name) {
        String key = "stat_" + name;
        prefs(context).edit().putInt(key, prefs(context).getInt(key, 0) + 1).apply();
    }

    static int stat(Context context, String name) {
        return prefs(context).getInt("stat_" + name, 0);
    }

    /** 这条截图是不是已经记过账了（同一个 key 再点也不会记第二笔）。 */
    static boolean isRecorded(Context context, long key) {
        if (key == 0) return false;
        String raw = prefs(context).getString(KEY_RECORDED, "");
        if (raw == null || raw.isEmpty()) return false;
        for (String part : raw.split(",")) {
            if (part.isEmpty()) continue;
            try {
                if (Long.parseLong(part) == key) return true;
            } catch (NumberFormatException ignored) {
            }
        }
        return false;
    }

    static void markRecorded(Context context, long key) {
        if (key == 0) return;
        String raw = prefs(context).getString(KEY_RECORDED, "");
        if (raw == null) raw = "";
        raw = raw.isEmpty() ? String.valueOf(key) : raw + "," + key;
        String[] parts = raw.split(",");
        StringBuilder sb = new StringBuilder();
        int start = Math.max(0, parts.length - RECORDED_KEEP);
        for (int i = start; i < parts.length; i++) {
            if (parts[i].isEmpty()) continue;
            if (sb.length() > 0) sb.append(',');
            sb.append(parts[i]);
        }
        prefs(context).edit().putString(KEY_RECORDED, sb.toString()).apply();
    }

    /** 每条提醒一个固定但可重复利用的 id，两张截图同时待确认时不会互相盖掉。 */
    static synchronized int nextNotifyId(Context context) {
        int next = prefs(context).getInt(KEY_NOTIFY_SEQ, NOTIFY_SEQ_MIN);
        if (next < NOTIFY_SEQ_MIN || next > NOTIFY_SEQ_MAX) next = NOTIFY_SEQ_MIN;
        prefs(context).edit().putInt(KEY_NOTIFY_SEQ, next >= NOTIFY_SEQ_MAX ? NOTIFY_SEQ_MIN : next + 1).apply();
        return next;
    }

    /**
     * 把一张认出金额的截图放进待确认队列。
     * 队列满了就挤掉最旧的一条，返回它，调用方负责收起对应通知并删缓存图。
     */
    static synchronized JSONObject addShot(Context context, long key, int notifyId, String path,
                                          long amountCents, String text) {
        JSONObject evicted = null;
        try {
            JSONArray arr = shots(context);
            JSONObject item = new JSONObject();
            item.put("key", key);
            item.put("notifyId", notifyId);
            item.put("path", path);
            item.put("amountCents", amountCents);
            item.put("text", text == null ? "" : text);
            item.put("createdAt", System.currentTimeMillis());
            arr.put(item);
            while (arr.length() > SHOTS_KEEP) {
                evicted = arr.optJSONObject(0);
                arr.remove(0);
            }
            prefs(context).edit().putString(KEY_SHOTS, arr.toString()).apply();
        } catch (Throwable ignored) {
        }
        return evicted;
    }

    static synchronized JSONArray shots(Context context) {
        String raw = prefs(context).getString(KEY_SHOTS, "");
        if (raw == null || raw.isEmpty()) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (Throwable t) {
            return new JSONArray();
        }
    }

    static synchronized JSONObject findShot(Context context, long key) {
        JSONArray arr = shots(context);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject item = arr.optJSONObject(i);
            if (item != null && item.optLong("key", 0L) == key) return item;
        }
        return null;
    }

    /** 点通知正文进来时，用图片路径找回它对应的识别文字，不用再识别一遍。 */
    static synchronized JSONObject findShotByPath(Context context, String path) {
        if (path == null) return null;
        JSONArray arr = shots(context);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject item = arr.optJSONObject(i);
            if (item != null && path.equals(item.optString("path", ""))) return item;
        }
        return null;
    }

    /** 取走一张待确认截图；返回被移除的那条，没有就返回 null。 */
    static synchronized JSONObject removeShot(Context context, long key) {
        try {
            JSONArray arr = shots(context);
            JSONObject removed = null;
            JSONArray next = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item == null) continue;
                if (item.optLong("key", 0L) == key) {
                    removed = item;
                } else {
                    next.put(item);
                }
            }
            if (removed != null) prefs(context).edit().putString(KEY_SHOTS, next.toString()).apply();
            return removed;
        } catch (Throwable t) {
            return null;
        }
    }

    /** 识别完成后把金额和原文补进队列里的那条。 */
    static synchronized boolean updateShot(Context context, long key, long amountCents, String text) {
        try {
            JSONArray arr = shots(context);
            boolean hit = false;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item == null || item.optLong("key", 0L) != key) continue;
                item.put("amountCents", amountCents);
                item.put("text", text == null ? "" : text);
                hit = true;
            }
            if (hit) prefs(context).edit().putString(KEY_SHOTS, arr.toString()).apply();
            return hit;
        } catch (Throwable t) {
            return false;
        }
    }

    /** 关闭监听时清空所有待确认截图，返回清掉的列表方便调用方收通知。 */
    static synchronized JSONArray clearShots(Context context) {
        JSONArray arr = shots(context);
        prefs(context).edit().remove(KEY_SHOTS).apply();
        return arr;
    }

    /**
     * 通知里点了「直接记一笔」：先把金额和识别文字暂存在这里，
     * 等前端写进账本。App 没在跑也能先记下来。
     */
    static synchronized void pushAutoRecord(Context context, long amountCents, String text) {
        try {
            JSONArray arr = autoRecords(context);
            JSONObject item = new JSONObject();
            // seq 是给前端的幂等 id：同一笔重复写进账本也只会有一条
            item.put("seq", nextAutoSeq(context));
            item.put("amountCents", amountCents);
            item.put("text", text == null ? "" : text);
            item.put("createdAt", System.currentTimeMillis());
            arr.put(item);
            while (arr.length() > AUTO_KEEP) arr.remove(0);
            prefs(context).edit().putString(KEY_AUTO, arr.toString()).apply();
        } catch (Throwable ignored) {
        }
    }

    private static synchronized int nextAutoSeq(Context context) {
        int next = prefs(context).getInt(KEY_AUTO_SEQ, 1);
        prefs(context).edit().putInt(KEY_AUTO_SEQ, next + 1).apply();
        return next;
    }

    /**
     * 取走所有待入账的记录。取的同时把这一批存进「在途」存档：
     * 前端真的写进账本后才会 ack，中途进程被杀或写库失败，
     * 下次一取还是这一批（seq 不变，前端按幂等 id 重写不会多记一笔）。
     */
    static synchronized String takeAutoRecords(Context context) {
        JSONArray merged = new JSONArray();
        try {
            mergeRecords(merged, prefs(context).getString(KEY_AUTO_BACKUP, ""));
            mergeRecords(merged, prefs(context).getString(KEY_AUTO, ""));
        } catch (Throwable ignored) {
        }
        if (merged.length() == 0) {
            // 没东西可取就把在途存档也清掉，别留一个空的 "[]" 在 prefs 里
            prefs(context).edit().remove(KEY_AUTO_BACKUP).remove(KEY_AUTO).apply();
            return "";
        }
        String raw = merged.toString();
        prefs(context).edit().putString(KEY_AUTO_BACKUP, raw).remove(KEY_AUTO).apply();
        return raw;
    }

    /** 前端确认这一批已经写进账本，清掉在途存档。 */
    static synchronized void ackAutoRecords(Context context) {
        prefs(context).edit().remove(KEY_AUTO_BACKUP).apply();
    }

    private static void mergeRecords(JSONArray target, String raw) throws Exception {
        if (raw == null || raw.isEmpty()) return;
        JSONArray arr = new JSONArray(raw);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject item = arr.optJSONObject(i);
            if (item != null) target.put(item);
        }
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
