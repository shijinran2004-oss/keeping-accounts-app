package com.shijinran.money.capture;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 通知栏账单的纯函数：微信/支付宝/银行 App 的付款通知，按文案认金额和方向。
 * 不依赖 Android，可以直接用 JVM 单测覆盖。
 *
 * 通知比截图干净得多：App 自己发的通知只有一句话，金额一定带 ¥ 或「元」，
 * 所以这里只做三件事：白名单（不是这些 App 的通知不看）、金额（¥/元，多值就放弃）、
 * 方向（退款/收款算收入，付款/消费算支出）。
 * 规则表在 capture-rules.json 的 notification 段，由 RulesLoader 和 ShotRules 一起装载。
 */
final class NotifyRules {
    private NotifyRules() {}

    static final String TYPE_EXPENSE = "expense";
    static final String TYPE_INCOME = "income";

    private static volatile boolean ready;
    private static final Map<String, String> packages = new LinkedHashMap<>();
    private static final Map<String, String> platformNames = new LinkedHashMap<>();
    private static String[] ignoreKeywords = new String[0];
    private static String[] expenseKeywords = new String[0];
    private static String[] incomeKeywords = new String[0];
    private static String[] refundKeywords = new String[0];
    private static String[] penaltyKeywords = new String[0];
    private static final List<Pattern> merchantPatterns = new ArrayList<>();

    /** ¥12.30 / ￥12.3，也接受 1,234.56 这种千分位 */
    private static final Pattern YEN = Pattern.compile("[¥￥]\\s*([0-9]{1,6}(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?)");
    /** 12.30 元（必须有小数，避免把「12 元」和「12.30 元」的 30 当成两个数） */
    private static final Pattern YUAN = Pattern.compile("([0-9]{1,6}(?:,[0-9]{3})*(?:\\.[0-9]{1,2}))\\s*元");
    /** 12 元（整数金额） */
    private static final Pattern YUAN_WHOLE = Pattern.compile("([0-9]{1,6})\\s*元");

    /** 解析结果：amount 是给人看的两位小数字符串，cents 是分。 */
    static final class Parsed {
        final String amount;
        final long cents;
        final String type;
        final String merchant;
        final String platform;
        final String text;
        final String key;

        Parsed(String amount, long cents, String type, String merchant, String platform,
               String text, String key) {
            this.amount = amount;
            this.cents = cents;
            this.type = type;
            this.merchant = merchant;
            this.platform = platform;
            this.text = text;
            this.key = key;
        }
    }

    static boolean isReady() {
        return ready;
    }

    static synchronized void init(JSONObject root) {
        JSONObject n = root == null ? null : root.optJSONObject("notification");
        if (n == null) {
            ready = false;
            return;
        }
        packages.clear();
        JSONObject pkgs = n.optJSONObject("packages");
        if (pkgs != null) {
            for (java.util.Iterator<String> it = pkgs.keys(); it.hasNext(); ) {
                String pkg = it.next();
                String platform = pkgs.optString(pkg, "");
                if (!pkg.isEmpty() && !platform.isEmpty()) packages.put(pkg, platform);
            }
        }
        platformNames.clear();
        JSONObject names = n.optJSONObject("platformNames");
        if (names != null) {
            for (java.util.Iterator<String> it = names.keys(); it.hasNext(); ) {
                String id = it.next();
                platformNames.put(id, names.optString(id, ""));
            }
        }
        ignoreKeywords = strings(n, "ignoreKeywords");
        expenseKeywords = strings(n, "expenseKeywords");
        incomeKeywords = strings(n, "incomeKeywords");
        refundKeywords = strings(n, "refundKeywords");
        penaltyKeywords = strings(n, "penaltyKeywords");
        merchantPatterns.clear();
        JSONArray patterns = n.optJSONArray("merchantPatterns");
        if (patterns != null) {
            for (int i = 0; i < patterns.length(); i++) {
                String p = patterns.optString(i, "");
                if (!p.isEmpty()) merchantPatterns.add(Pattern.compile(p));
            }
        }
        // 白名单和金额词缺了就别静默记账：宁可什么都不做，也不能乱记
        ready = !packages.isEmpty() && expenseKeywords.length > 0 && incomeKeywords.length > 0;
    }

    /**
     * 解析一条通知。不是这几家 App 的、看着不像付款结果的、金额拿不准的，都返回 null。
     * 传进来的字段是通知栏里能拿到的全部文案（标题、正文、大字、副标题）。
     */
    static Parsed parse(String pkg, String title, String text, String bigText, String subText) {
        if (!ready || pkg == null) return null;
        String platform = packages.get(pkg);
        if (platform == null) return null;
        String raw = join(title, text, bigText, subText);
        if (raw.isEmpty()) return null;
        String all = normalize(raw);
        for (String word : ignoreKeywords) {
            if (!word.isEmpty() && all.contains(word)) return null;
        }
        Long cents = singleAmount(all);
        if (cents == null || cents <= 0 || cents > 9_999_900L) return null;
        String type;
        if (containsAny(all, refundKeywords)) {
            type = TYPE_INCOME;
        } else if (containsAny(all, expenseKeywords)) {
            type = TYPE_EXPENSE;
        } else if (containsAny(all, incomeKeywords)) {
            type = TYPE_INCOME;
        } else {
            return null;
        }
        String merchant = merchant(all);
        String amount = String.format(Locale.US, "%d.%02d", cents / 100, cents % 100);
        String name = platformNames.containsKey(platform) ? platformNames.get(platform) : platform;
        return new Parsed(amount, cents, type, merchant, name, all, hash(pkg + "|" + all));
    }

    /** 所有金额候选；同一笔钱重复出现（比如正文和大字都有）只算一个，两个不同数值就放弃。 */
    private static Long singleAmount(String all) {
        Map<Long, String> found = new LinkedHashMap<>();
        collect(all, YEN, found);
        collect(all, YUAN, found);
        collectWhole(all, found);
        if (found.size() != 1) return null;
        return found.keySet().iterator().next();
    }

    private static void collect(String all, Pattern pattern, Map<Long, String> found) {
        Matcher m = pattern.matcher(all);
        while (m.find()) {
            if (isPenalised(all, m.start(), m.end())) continue;
            Long cents = centsOf(m.group(1));
            if (cents != null && cents > 0) found.put(cents, m.group(1));
        }
    }

    private static void collectWhole(String all, Map<Long, String> found) {
        Matcher m = YUAN_WHOLE.matcher(all);
        while (m.find()) {
            // "12.30 元" 里的 "30 元" 不是独立金额：前面紧挨着数字或小数点就跳过
            int start = m.start(1);
            if (start > 0) {
                char before = all.charAt(start - 1);
                if (Character.isDigit(before) || before == '.' || before == ',') continue;
            }
            if (isPenalised(all, m.start(), m.end())) continue;
            Long cents = centsOf(m.group(1));
            if (cents != null && cents > 0) found.put(cents, m.group(1));
        }
    }

    /** 金额附近的优惠/余额字样：红包到账、优惠券这些不是这单的实际金额 */
    private static boolean isPenalised(String all, int start, int end) {
        int from = Math.max(0, start - 10);
        int to = Math.min(all.length(), end + 10);
        String window = all.substring(from, to);
        for (String word : penaltyKeywords) {
            if (!word.isEmpty() && window.contains(word)) return true;
        }
        return false;
    }

    private static String merchant(String all) {
        for (Pattern pattern : merchantPatterns) {
            Matcher m = pattern.matcher(all);
            if (m.find()) {
                String name = m.group(1).trim();
                if (!name.isEmpty()) return name;
            }
        }
        return null;
    }

    private static Long centsOf(String value) {
        if (value == null) return null;
        String clean = value.replace(",", "").trim();
        int dot = clean.indexOf('.');
        try {
            if (dot < 0) return Long.parseLong(clean) * 100L;
            String whole = clean.substring(0, dot);
            String frac = clean.substring(dot + 1);
            while (frac.length() < 2) frac += "0";
            if (frac.length() > 2) frac = frac.substring(0, 2);
            return Long.parseLong(whole) * 100L + Long.parseLong(frac);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 全角符号/数字归一化：通知里经常混着 ￥、－、全角数字 */
    static String normalize(String raw) {
        StringBuilder sb = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c >= '０' && c <= '９') sb.append((char) ('0' + (c - '０')));
            else if (c == '￥') sb.append('¥');
            else if (c == '－' || c == '—' || c == '–' || c == '−') sb.append('-');
            else if (c == '，') sb.append(',');
            else if (c == '：') sb.append(':');
            else if (c == '．') sb.append('.');
            else if (c == '　' || c == '\u00A0' || c == '\u200B' || c == '\u200C' || c == '\u200D' || c == '\uFEFF') sb.append(' ');
            else sb.append(c);
        }
        return sb.toString();
    }

    private static boolean containsAny(String text, String[] words) {
        for (String word : words) {
            if (!word.isEmpty() && text.contains(word)) return true;
        }
        return false;
    }

    private static String join(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            if (part == null) continue;
            String value = part.trim();
            if (value.isEmpty()) continue;
            if (sb.indexOf(value) >= 0) continue;
            if (sb.length() > 0) sb.append('\n');
            sb.append(value);
        }
        return sb.toString();
    }

    private static String[] strings(JSONObject obj, String key) {
        JSONArray arr = obj.optJSONArray(key);
        if (arr == null) return new String[0];
        List<String> list = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            String value = arr.optString(i, "").trim();
            if (!value.isEmpty()) list.add(value);
        }
        return list.toArray(new String[0]);
    }

    /** 同一条通知重复投递时用它去重（哈希只留在 prefs 里，不落原文） */
    private static String hash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) sb.append(String.format(Locale.US, "%02x", bytes[i]));
            return sb.toString();
        } catch (Throwable t) {
            return String.valueOf(value.hashCode());
        }
    }
}
