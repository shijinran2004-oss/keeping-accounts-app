package com.shijinran.money.capture;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 截图卡片的分类提示。
 *
 * 分类表在前端（用户可以改名、加分类），所以由 JS 通过 CapturePlugin.setCategoryHints()
 * 把「分类 id / 名字 / 关键词」和「商户 → 分类」的记忆推到原生存起来；
 * 截图识别在后台也能直接给出「星巴克 → 餐饮」这种建议，不用等 WebView 起来。
 *
 * 打分逻辑是纯函数（可以 JVM 单测）：
 * 1. 商户名命中某个关键词 +3，整页文字命中 +1；
 * 2. 用户以前给这个商户选过的分类 +20（商户记忆优先）；
 * 3. 取分最高的一类；卡片上再按分数给前 3 个备选。
 */
final class CategoryHints {

    private CategoryHints() {}

    private static final String PREFS = "shijinran.capture";
    private static final String KEY_HINTS = "categoryHints";
    private static final String KEY_MEMORY = "categoryMemory";
    /** 卡片上最多放几个分类备选 */
    static final int DEFAULT_LIMIT = 3;

    /** 一个分类：id、显示名、用来猜的关键词 */
    static final class Hint {
        final String id;
        final String name;
        final String[] keywords;

        Hint(String id, String name, String[] keywords) {
            this.id = id;
            this.name = name;
            this.keywords = keywords == null ? new String[0] : keywords;
        }
    }

    /** 猜出来的一个分类：分数越高越像，keyword 是命中的词（日志用） */
    static final class Guess {
        final String id;
        final String name;
        final int score;
        final String keyword;

        Guess(String id, String name, int score, String keyword) {
            this.id = id;
            this.name = name;
            this.score = score;
            this.keyword = keyword;
        }
    }

    private static volatile List<Hint> hints = new ArrayList<>();
    private static volatile Map<String, String> memory = new HashMap<>();

    // ---- 原生存储 ----

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized void load(Context context) {
        SharedPreferences p = prefs(context);
        hints = parseHints(p.getString(KEY_HINTS, ""));
        memory = parseMemory(p.getString(KEY_MEMORY, ""));
    }

    /** 前端推过来的分类表与记忆：存一份给后台服务，马上生效 */
    static synchronized void apply(Context context, JSONArray categories, JSONObject memoryObj) {
        String hintsRaw = categories == null ? "[]" : categories.toString();
        String memoryRaw = memoryObj == null ? "{}" : memoryObj.toString();
        prefs(context).edit().putString(KEY_HINTS, hintsRaw).putString(KEY_MEMORY, memoryRaw).apply();
        hints = parseHints(hintsRaw);
        memory = parseMemory(memoryRaw);
    }

    static String nameOf(String id) {
        return nameOf(hints, id);
    }

    /** 最像的那一个分类；一点线索都没有返回 null */
    static String guessId(String text, String merchant) {
        Guess guess = best(hints, memory, merchant, text);
        return guess == null ? null : guess.id;
    }

    /** 卡片上的备选分类：用户选中的排最前，然后按分数补足 */
    static List<Guess> suggest(String text, String merchant, String selectedId, int limit) {
        return suggest(hints, memory, merchant, text, selectedId, limit);
    }

    // ---- 纯函数（JVM 单测覆盖） ----

    static List<Hint> parseHints(String raw) {
        List<Hint> out = new ArrayList<>();
        if (raw == null || raw.isEmpty()) return out;
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                String id = o.optString("id", "");
                String name = o.optString("name", "");
                if (id.isEmpty() || name.isEmpty()) continue;
                JSONArray kw = o.optJSONArray("keywords");
                List<String> words = new ArrayList<>();
                if (kw != null) {
                    for (int j = 0; j < kw.length(); j++) {
                        String word = kw.optString(j, "");
                        if (!word.isEmpty()) words.add(word);
                    }
                }
                out.add(new Hint(id, name, words.toArray(new String[0])));
            }
        } catch (Throwable ignored) {
        }
        return out;
    }

    static Map<String, String> parseMemory(String raw) {
        Map<String, String> out = new HashMap<>();
        if (raw == null || raw.isEmpty()) return out;
        try {
            JSONObject obj = new JSONObject(raw);
            java.util.Iterator<String> keys = obj.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                String value = obj.optString(key, "");
                if (!key.isEmpty() && !value.isEmpty()) out.put(key, value);
            }
        } catch (Throwable ignored) {
        }
        return out;
    }

    static String nameOf(List<Hint> catalog, String id) {
        if (id == null || id.isEmpty()) return null;
        for (Hint hint : catalog) {
            if (hint.id.equals(id)) return hint.name;
        }
        return null;
    }

    static Guess best(List<Hint> catalog, Map<String, String> mem, String merchant, String text) {
        List<Guess> list = scored(catalog, mem, merchant, text);
        return list.isEmpty() ? null : list.get(0);
    }

    static List<Guess> suggest(List<Hint> catalog, Map<String, String> mem, String merchant,
                               String text, String selectedId, int limit) {
        List<Guess> ranked = scored(catalog, mem, merchant, text);
        List<Guess> out = new ArrayList<>();
        int max = Math.max(1, limit);
        if (selectedId != null && !selectedId.isEmpty()) {
            Guess selected = null;
            for (Guess guess : ranked) {
                if (guess.id.equals(selectedId)) {
                    selected = guess;
                    break;
                }
            }
            if (selected == null) {
                String name = nameOf(catalog, selectedId);
                if (name != null) selected = new Guess(selectedId, name, 0, null);
            }
            if (selected != null) out.add(selected);
        }
        for (Guess guess : ranked) {
            if (out.size() >= max) break;
            boolean exists = false;
            for (Guess pick : out) {
                if (pick.id.equals(guess.id)) {
                    exists = true;
                    break;
                }
            }
            if (!exists) out.add(guess);
        }
        return out;
    }

    private static List<Guess> scored(List<Hint> catalog, Map<String, String> mem,
                                      String merchant, String text) {
        List<Guess> out = new ArrayList<>();
        if (catalog == null || catalog.isEmpty()) return out;
        String shop = merchant == null ? "" : merchant.trim();
        String remembered = shop.isEmpty() ? null : (mem == null ? null : mem.get(shop));
        for (Hint hint : catalog) {
            int score = 0;
            String hit = null;
            if (remembered != null && remembered.equals(hint.id)) score += 20;
            for (String keyword : hint.keywords) {
                if (keyword == null || keyword.length() < 2) continue;
                if (!shop.isEmpty() && shop.contains(keyword)) {
                    score += 3;
                    if (hit == null) hit = keyword;
                } else if (text != null && text.contains(keyword)) {
                    score += 1;
                    if (hit == null) hit = keyword;
                }
            }
            if (score > 0) out.add(new Guess(hint.id, hint.name, score, hit));
        }
        Collections.sort(out, new Comparator<Guess>() {
            @Override
            public int compare(Guess a, Guess b) {
                return b.score - a.score;
            }
        });
        return out;
    }
}
