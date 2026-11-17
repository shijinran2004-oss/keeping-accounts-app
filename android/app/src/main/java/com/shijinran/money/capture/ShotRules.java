package com.shijinran.money.capture;

import com.shijinran.money.ocr.OcrLine;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 截图判定的纯函数：把 OCR 结果认成一笔钱、判断像不像账单、是不是我们自己的卡片、去重 hash。
 * 不依赖 Android，可以直接用 JVM 单测覆盖。
 *
 * 规则表不写死在代码里：src/lib/ocr/capture-rules.json 是唯一来源，
 * 打包时放一份到 android/app/src/main/assets/rules/capture-rules.json，
 * 启动时由 RulesLoader 读进来 init()。这样改规则不用动 Java，
 * 也能用 JS 单测校验两份文件一致（capture-rules.test.ts）。
 *
 * 认金额的流程（误报几乎都来自「页面上随便一个数字」）：
 * 1. normalizeText：全角/变体符号归一化、去掉千分位逗号、整段剔除日期时间；
 * 2. 按行收集候选：实付类关键词、合计类关键词、¥ 金额、账单页独行大数字；
 * 3. 版面加分（有坐标时）：字号明显大于正文、位置靠上、水平居中/靠右的金额更像
 *    「标题下面那个大数字」，页脚上的大金额（按钮、悬浮球）扣分；
 * 4. 打分：平台模板 +60、实付类 +50、合计类 +40、¥ 同行有支付语境 +30 / 隔一行 +20 / 隔两行 +15；
 *    优惠/原价/红包这类行 −50，余额/额度这类行整行跳过；
 * 5. 平台模板（支付宝/微信/银行）按 JSON 里的 keywords 先认页面，命中就先用它的锚点；
 * 6. 取分数最高的候选，和次高分的差不够就判「拿不准」，宁可不弹；
 * 7. 收入/退款方向不当支出，整页没有任何付款信号也不弹。
 */
final class ShotRules {
    private ShotRules() {}

    // ---- 规则表（init 时从 JSON 装载；没装载成功就一律不弹，宁可不记）----

    private static volatile boolean ready;
    private static String[] amountKeys = new String[0];
    private static String[] totalKeys = new String[0];
    private static String[] payContext = new String[0];
    private static String[] paymentSignals = new String[0];
    private static String[] merchantKeys = new String[0];
    private static String[] strongSignals = new String[0];
    private static String[] ownCard = new String[0];
    private static String[] penaltyKeys = new String[0];
    private static String[] balanceKeys = new String[0];
    private static String[] incomeWords = new String[0];
    private static String[] notExpenseWords = new String[0];
    private static volatile List<Template> templates = new ArrayList<>();

    /** 版面打分的权重，也放在 JSON 的 geometry 段里，方便真机调参 */
    private static double bigRatio = 1.6;
    private static double topRatio = 0.45;
    private static double centerRatio = 0.22;
    private static double rightRatio = 0.15;
    private static double footerRatio = 0.88;
    private static int bigTopCenter = 25;
    private static int bigTopRight = 18;
    private static int bigTop = 15;
    private static int bigOnly = 8;
    private static int topAligned = 5;
    private static int footerPenalty = -20;
    private static int layoutBase = 15;

    /**
     * 一个平台模板（invoice2data 的思路）：keywords 命中就说明是这家支付的页面，
     * anchors 是这家的金额字段名，detailKeys 用来认「账单详情」这种没有字段名的版面。
     */
    private static final class Template {
        final String id;
        final String[] anyKeywords;
        final String[] anchors;
        final String[] detailKeys;
        final boolean headerAmount;

        Template(String id, String[] anyKeywords, String[] anchors, String[] detailKeys, boolean headerAmount) {
            this.id = id;
            this.anyKeywords = anyKeywords;
            this.anchors = anchors;
            this.detailKeys = detailKeys;
            this.headerAmount = headerAmount;
        }
    }

    private static final String NUM = "([0-9]{1,7}(?:\\.[0-9]{1,2})?)";
    private static final Pattern YEN = Pattern.compile("[¥￥]\\s*" + NUM);
    private static final Pattern MONEY_AFTER = Pattern.compile("[¥￥]?\\s*" + NUM);
    /** 单独一行、只有一个金额（可带正负号 / ¥ / 元）：账单页标题下面那个大数字；
     * 微信转账页的支出写 -84.00、收入写 +100.00，符号要留着判方向。 */
    private static final Pattern BARE_LINE = Pattern.compile("^[+\\-¥￥\\s]*([0-9]{1,7}\\.[0-9]{2})\\s*元?$");
    private static final Pattern DATE = Pattern.compile("20[0-9]{2}[-/.年][0-9]{1,2}[-/.月][0-9]{1,2}");
    private static final Pattern DATE_TIME = Pattern.compile(
            "20[0-9]{2}[-/.年][0-9]{1,2}[-/.月][0-9]{1,2}(?:[ T][0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)?"
                    + "|[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?");

    /** 低于这个分数：不算金额（聊天里的价格、网页商品价、股票数字都在 0 分） */
    private static final int SCORE_ACCEPT = 15;
    /** 最高分和次高分的差，不够就是「两个都像」，宁可不弹 */
    private static final int SCORE_GAP = 10;
    /** 99999.00 以上不当成一笔消费 */
    private static final long MAX_CENTS = 9_999_900L;

    /** 判定结果：amount 是认出来的数字（可能因为方向/信号被拦），reason 为 null 才该弹卡。 */
    static final class Judgement {
        final String amount;
        /** null = 可以弹；own_card / no_amount / uncertain / income / not_expense / no_signal / not_ready */
        final String reason;
        /** 这次判定有没有用上行坐标（日志里能看出纯文本降级是不是在生效） */
        final boolean layout;

        Judgement(String amount, String reason) {
            this(amount, reason, false);
        }

        Judgement(String amount, String reason, boolean layout) {
            this.amount = amount;
            this.reason = reason;
            this.layout = layout;
        }
    }

    /** 一个金额候选：值、分数、来源优先级（3 平台模板 / 2 实付关键词 / 1 合计关键词 / 0 仅语境或版面）。 */
    private static final class Candidate {
        final String value;
        final long cents;
        int score;
        final int priority;
        /** 金额前面带 + 号（微信转账收入页），这种一定是收入，不能弹记账卡 */
        boolean plus;
        /** 这个候选来自第几行（和 normalizeText 之后的行号对齐），版面打分用；-1 表示没对上 */
        int lineIndex = -1;

        Candidate(String value, int score, int priority) {
            this.value = value;
            this.cents = centsOf(value);
            this.score = score;
            this.priority = priority;
        }
    }

    /** 一张页面的版面摘要：行、正文中位行高、左右边界、底边。 */
    private static final class Layout {
        final OcrLine[] lines;
        final double medianHeight;
        final int pageLeft;
        final int pageRight;
        final int pageBottom;

        Layout(OcrLine[] lines, double medianHeight, int pageLeft, int pageRight, int pageBottom) {
            this.lines = lines;
            this.medianHeight = medianHeight;
            this.pageLeft = pageLeft;
            this.pageRight = pageRight;
            this.pageBottom = pageBottom;
        }
    }

    // ---- 规则装载 ----

    static boolean isReady() {
        return ready;
    }

    /**
     * 装载规则表。整份 JSON 解析成功才置 ready：任何一段坏掉都宁可整页不认，
     * 也不要拿半套规则去弹卡（弹错一笔比漏一笔更烦人）。
     */
    static synchronized void init(JSONObject root) {
        if (root == null) throw new IllegalArgumentException("rules is null");
        JSONObject g = root.optJSONObject("global");
        String[] amounts = strings(g, "amountKeys");
        String[] totals = strings(g, "totalKeys");
        if (amounts.length == 0 || totals.length == 0) {
            throw new IllegalArgumentException("rules missing amountKeys/totalKeys");
        }
        amountKeys = amounts;
        totalKeys = totals;
        payContext = strings(g, "payContext");
        paymentSignals = strings(g, "paymentSignals");
        merchantKeys = strings(g, "merchantKeys");
        strongSignals = strings(g, "strongSignals");
        ownCard = strings(g, "ownCard");
        penaltyKeys = strings(g, "penaltyKeys");
        balanceKeys = strings(g, "balanceKeys");
        incomeWords = strings(g, "incomeWords");
        notExpenseWords = strings(g, "notExpenseWords");

        List<Template> list = new ArrayList<>();
        JSONArray tpls = root.optJSONArray("templates");
        if (tpls != null) {
            for (int i = 0; i < tpls.length(); i++) {
                JSONObject o = tpls.optJSONObject(i);
                if (o == null) continue;
                String id = o.optString("id", "");
                if (id.isEmpty()) continue;
                list.add(new Template(id, strings(o, "anyKeywords"), strings(o, "anchors"),
                        strings(o, "detailKeys"), bool(o, "headerAmount", false)));
            }
        }
        if (list.isEmpty()) throw new IllegalArgumentException("rules missing templates");
        templates = list;

        JSONObject geo = root.optJSONObject("geometry");
        bigRatio = number(geo, "bigRatio", bigRatio);
        topRatio = number(geo, "topRatio", topRatio);
        centerRatio = number(geo, "centerRatio", centerRatio);
        rightRatio = number(geo, "rightRatio", rightRatio);
        footerRatio = number(geo, "footerRatio", footerRatio);
        bigTopCenter = intNumber(geo, "bigTopCenter", bigTopCenter);
        bigTopRight = intNumber(geo, "bigTopRight", bigTopRight);
        bigTop = intNumber(geo, "bigTop", bigTop);
        bigOnly = intNumber(geo, "bigOnly", bigOnly);
        topAligned = intNumber(geo, "topAligned", topAligned);
        footerPenalty = intNumber(geo, "footerPenalty", footerPenalty);
        layoutBase = intNumber(geo, "layoutBase", layoutBase);

        ready = true;
    }

    private static String[] strings(JSONObject obj, String key) {
        if (obj == null) return new String[0];
        JSONArray arr = obj.optJSONArray(key);
        if (arr == null) return new String[0];
        List<String> out = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            String s = arr.optString(i, "");
            if (!s.isEmpty()) out.add(s);
        }
        return out.toArray(new String[0]);
    }

    private static boolean bool(JSONObject obj, String key, boolean fallback) {
        return obj == null ? fallback : obj.optBoolean(key, fallback);
    }

    private static double number(JSONObject obj, String key, double fallback) {
        return obj == null ? fallback : obj.optDouble(key, fallback);
    }

    private static int intNumber(JSONObject obj, String key, int fallback) {
        return obj == null ? fallback : obj.optInt(key, fallback);
    }

    // ---- 判定入口 ----

    private static boolean containsAny(String text, String[] keys) {
        if (text == null || keys == null) return false;
        for (String key : keys) {
            if (text.contains(key)) return true;
        }
        return false;
    }

    /** 只抽取金额（不带 ¥）：按分数挑，分差不够或没有候选都返回 null。 */
    static String amount(String text) {
        return judge(text).amount;
    }

    /** 真正决定要不要弹卡：金额 + 有付款信号 + 不是收入/退款，否则返回 null（静默）。 */
    static String acceptedAmount(String text) {
        Judgement j = judge(text);
        return j.reason == null ? j.amount : null;
    }

    /** 完整判定，多给一个拦截原因，方便日志里区分「没认出金额」和「认出了但不像账单」。 */
    static Judgement judge(String raw) {
        return judge(raw, null);
    }

    /**
     * 带版面的判定。lines 为 null / 行号对不上时退回纯文本打分，
     * 所以老的单测和没有坐标的调用方行为完全不变。
     */
    static Judgement judge(String raw, List<OcrLine> lines) {
        if (!ready) return new Judgement(null, "not_ready");
        if (raw == null || raw.isEmpty()) return new Judgement(null, "no_amount");
        if (looksLikeOurCard(raw)) return new Judgement(null, "own_card");
        String text = normalizeText(raw);
        String[] parts = text.split("\n", -1);
        Layout layout = layoutOf(align(lines, parts));
        Template tpl = templateFor(text);
        List<Candidate> found = new ArrayList<>();
        collectKeyed(parts, found);
        collectYen(parts, found);
        collectBare(text, parts, found);
        if (tpl != null) {
            Candidate anchored = templateAmount(tpl, parts);
            if (anchored != null) found.add(anchored);
            // 支付宝「账单详情」没有「实付」这类字段名，只能认标题下面那行大金额
            if (tpl.headerAmount && containsAny(text, tpl.detailKeys)) {
                Candidate header = headerAmount(parts);
                if (header != null) found.add(header);
            }
        }
        if (layout != null) {
            collectLayout(parts, layout, found);
            applyGeometry(found, layout);
        }
        Candidate best = pick(found);
        boolean usedLayout = layout != null;
        if (best == null) return new Judgement(null, found.isEmpty() ? "no_amount" : "uncertain", usedLayout);
        if (best.plus || "income".equals(direction(text))) return new Judgement(best.value, "income", usedLayout);
        if (containsAny(text, notExpenseWords)) return new Judgement(best.value, "not_expense", usedLayout);
        if (!hasPaymentSignal(raw)) return new Judgement(best.value, "no_signal", usedLayout);
        return new Judgement(best.value, null, usedLayout);
    }

    /**
     * 归一化 OCR 原文：全角数字/标点、各种变体减号、零宽字符统一掉，
     * 去千分位逗号（否则「¥1,234.56」会被认成 ¥1），再把日期时间整段剔除
     * （它们自己带数字，是最常见的假金额）。
     */
    static String normalizeText(String raw) {
        if (raw == null) return "";
        StringBuilder sb = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c >= '０' && c <= '９') c = (char) ('0' + (c - '０'));
            else if (c == '．') c = '.';
            else if (c == '￥') c = '¥';
            else if (c == '－' || c == '—' || c == '–' || c == '−' || c == '‐') c = '-';
            else if (c == '＋') c = '+';
            else if (c == '，' || c == '、') c = ',';
            else if (c == '：') c = ':';
            else if (c == '\u00A0' || c == '\u200B' || c == '\u200C' || c == '\u200D' || c == '\uFEFF') c = ' ';
            sb.append(c);
        }
        String s = sb.toString();
        s = s.replaceAll("(?<=\\d)[,](?=\\d{3}(?:\\D|$))", "");
        s = DATE_TIME.matcher(s).replaceAll(" ");
        return s;
    }

    // ---- 版面 ----

    /** 把 OCR 行和归一化之后的行对齐：行数、每行文字都要对得上，否则退回纯文本。 */
    private static OcrLine[] align(List<OcrLine> lines, String[] parts) {
        if (lines == null || lines.isEmpty() || lines.size() != parts.length) return null;
        OcrLine[] geo = new OcrLine[parts.length];
        for (int i = 0; i < parts.length; i++) {
            OcrLine line = lines.get(i);
            if (line == null || line.height() <= 0) return null;
            if (!normalizeText(line.text).trim().equals(parts[i].trim())) return null;
            geo[i] = line;
        }
        return geo;
    }

    private static Layout layoutOf(OcrLine[] geo) {
        if (geo == null || geo.length < 3) return null;
        List<Integer> heights = new ArrayList<>();
        int left = Integer.MAX_VALUE;
        int right = Integer.MIN_VALUE;
        int bottom = Integer.MIN_VALUE;
        for (OcrLine line : geo) {
            if (line == null || line.height() <= 0) continue;
            heights.add(line.height());
            left = Math.min(left, line.left);
            right = Math.max(right, line.right);
            bottom = Math.max(bottom, line.bottom);
        }
        if (heights.size() < 3 || bottom <= 0 || right <= left) return null;
        Collections.sort(heights);
        int mid = heights.size() / 2;
        double median = heights.size() % 2 == 0
                ? (heights.get(mid - 1) + heights.get(mid)) / 2.0
                : heights.get(mid);
        return new Layout(geo, median, left, right, bottom);
    }

    /**
     * 版面加分：字号明显比正文大、位置靠上、水平居中或靠右的金额，更像标题下面那个数；
     * 页脚（底部 12%）上的大金额往往是按钮/悬浮球上的字，扣分。
     */
    private static int geometryBonus(Layout layout, OcrLine line) {
        double median = layout.medianHeight;
        if (median <= 0) return 0;
        int pageWidth = layout.pageRight - layout.pageLeft;
        boolean big = line.height() >= median * bigRatio;
        boolean top = line.centerY() <= layout.pageBottom * topRatio;
        boolean centered = pageWidth > 0
                && Math.abs(line.centerX() - (layout.pageLeft + layout.pageRight) / 2) <= pageWidth * centerRatio;
        boolean rightAligned = pageWidth > 0
                && line.right >= layout.pageRight - pageWidth * rightRatio;
        boolean footer = line.centerY() >= layout.pageBottom * footerRatio;
        int score = 0;
        if (big && top && centered) score += bigTopCenter;
        else if (big && top && rightAligned) score += bigTopRight;
        else if (big && top) score += bigTop;
        else if (big) score += bigOnly;
        else if (top && (centered || rightAligned)) score += topAligned;
        if (footer) score += footerPenalty;
        return score;
    }

    /** 版面候选：又大又靠上的独行金额（标题下面那个数），不要求页面有强信号。 */
    private static void collectLayout(String[] parts, Layout layout, List<Candidate> out) {
        for (int i = 0; i < parts.length; i++) {
            String line = parts[i].trim();
            if (line.isEmpty()) continue;
            if (containsAny(line, balanceKeys) || containsAny(line, penaltyKeys)) continue;
            Matcher m = BARE_LINE.matcher(line);
            if (!m.matches()) continue;
            OcrLine geo = layout.lines[i];
            if (geo == null) continue;
            if (geometryBonus(layout, geo) < bigTop) continue;
            Candidate c = new Candidate(m.group(1), layoutBase, 0);
            c.lineIndex = i;
            c.plus = line.startsWith("+");
            out.add(c);
        }
    }

    private static void applyGeometry(List<Candidate> found, Layout layout) {
        for (Candidate c : found) {
            if (c.lineIndex < 0 || c.lineIndex >= layout.lines.length) continue;
            OcrLine line = layout.lines[c.lineIndex];
            if (line == null) continue;
            c.score += geometryBonus(layout, line);
        }
    }

    // ---- 候选收集 ----

    /** 关键词锚点：同一行取关键词后面的金额，没有就看下一行是不是只有一个金额。 */
    private static void collectKeyed(String[] lines, List<Candidate> out) {
        for (int i = 0; i < lines.length; i++) {
            if (containsAny(lines[i], balanceKeys)) continue;
            addKeyed(lines, i, amountKeys, 2, 50, out);
            addKeyed(lines, i, totalKeys, 1, 40, out);
        }
    }

    private static void addKeyed(String[] lines, int index, String[] keys, int priority, int base,
                                 List<Candidate> out) {
        for (String key : keys) {
            Candidate c = keyedCandidate(lines, index, key, priority, base);
            if (c != null) {
                out.add(c);
                return;
            }
        }
    }

    private static Candidate keyedCandidate(String[] lines, int index, String key, int priority, int base) {
        String line = lines[index];
        int at = line.indexOf(key);
        if (at < 0) return null;
        String tail = line.substring(at + key.length());
        Matcher m = MONEY_AFTER.matcher(tail);
        while (m.find()) {
            String raw = m.group(0);
            String value = m.group(1);
            if (!moneyTokenOk(raw, value)) continue;
            Candidate c = new Candidate(value, base + lineBias(line), priority);
            c.lineIndex = index;
            return c;
        }
        // 版式换行：关键词一行、金额在下一行（微信「转账金额」常见写法）
        if (index + 1 < lines.length) {
            Matcher n = BARE_LINE.matcher(lines[index + 1].trim());
            if (n.matches()) {
                Candidate c = new Candidate(n.group(1), base + lineBias(line), priority);
                c.lineIndex = index + 1;
                c.plus = lines[index + 1].trim().startsWith("+");
                return c;
            }
        }
        return null;
    }

    /** 没有货币符号的数字必须两位小数才算钱（否则「共 2 件」「3 期」都会被认成金额）。 */
    private static boolean moneyTokenOk(String raw, String value) {
        if (raw.indexOf('¥') >= 0) return true;
        int dot = value.indexOf('.');
        return dot > 0 && value.length() - dot - 1 == 2;
    }

    /** ¥ 金额：附近有支付语境才给分，越远分越低。 */
    private static void collectYen(String[] lines, List<Candidate> out) {
        for (int i = 0; i < lines.length; i++) {
            if (containsAny(lines[i], balanceKeys)) continue;
            Matcher m = YEN.matcher(lines[i]);
            while (m.find()) {
                int score = contextScore(lines, i) + lineBias(lines[i]);
                Candidate c = new Candidate(m.group(1), score, 0);
                c.lineIndex = i;
                out.add(c);
            }
        }
    }

    private static int contextScore(String[] lines, int index) {
        String line = lines[index];
        if (containsAny(line, payContext)) return 30;
        for (int d = 1; d <= 2; d++) {
            boolean hit = (index - d >= 0 && containsAny(lines[index - d], payContext))
                    || (index + d < lines.length && containsAny(lines[index + d], payContext));
            if (hit) return d == 1 ? 20 : 15;
        }
        return 0;
    }

    /** 账单页独行大数字：只有强信号满两条才收，避免把聊天里孤零零的一行价格当账单。 */
    private static void collectBare(String text, String[] lines, List<Candidate> out) {
        int strong = 0;
        for (String key : strongSignals) {
            if (text.contains(key)) strong++;
        }
        if (strong < 2) return;
        int base = 20 + Math.min(strong - 2, 2) * 5;
        for (int i = 0; i < lines.length; i++) {
            if (containsAny(lines[i], balanceKeys)) continue;
            String line = lines[i].trim();
            Matcher m = BARE_LINE.matcher(line);
            if (m.matches()) {
                Candidate c = new Candidate(m.group(1), base + lineBias(lines[i]), 0);
                c.lineIndex = i;
                c.plus = line.startsWith("+");
                out.add(c);
            }
        }
    }

    /** 平台模板：按 JSON 里模板的顺序认页面，命中就先用这家的金额字段名。 */
    private static Candidate templateAmount(Template template, String[] lines) {
        for (int i = 0; i < lines.length; i++) {
            if (containsAny(lines[i], balanceKeys)) continue;
            for (String anchor : template.anchors) {
                Candidate c = keyedCandidate(lines, i, anchor, 3, 60);
                if (c != null) return c;
            }
        }
        return null;
    }

    /**
     * 「账单详情」页：标题下面一行只有金额（-20.00 / 83.85），
     * 没有 ¥ 也没有「实付」字段名。取第一个独占一行的数字，
     * 跳过余额/优惠/积分那类行；带 + 的是收入。
     */
    private static Candidate headerAmount(String[] lines) {
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty()) continue;
            if (containsAny(line, balanceKeys) || containsAny(line, penaltyKeys)) continue;
            Matcher m = BARE_LINE.matcher(line);
            if (!m.matches()) continue;
            Candidate c = new Candidate(m.group(1), 60, 3);
            c.lineIndex = i;
            c.plus = line.startsWith("+");
            return c;
        }
        return null;
    }

    // ---- 页面识别 ----

    /** 这张截图更像哪个平台的账单页：按 JSON 里模板的顺序，命中第一个就返回。 */
    static String platform(String text) {
        Template t = templateFor(text);
        return t == null ? "" : t.id;
    }

    private static Template templateFor(String text) {
        if (text == null || text.isEmpty()) return null;
        for (Template t : templates) {
            if (containsAny(text, t.anyKeywords)) return t;
        }
        return null;
    }

    // ---- 打分与拦截 ----

    /** 分数最高的候选，同值的只留最高分；分差不够、分数太低都返回 null。 */
    private static Candidate pick(List<Candidate> found) {
        Map<String, Candidate> best = new LinkedHashMap<>();
        for (Candidate c : found) {
            if (c.cents < 1 || c.cents > MAX_CENTS) continue;
            Candidate cur = best.get(c.value);
            if (cur == null || c.score > cur.score
                    || (c.score == cur.score && c.priority > cur.priority)) {
                best.put(c.value, c);
            }
        }
        if (best.isEmpty()) return null;
        List<Candidate> list = new ArrayList<>(best.values());
        Collections.sort(list, new Comparator<Candidate>() {
            @Override public int compare(Candidate a, Candidate b) {
                if (a.score != b.score) return b.score - a.score;
                return a.value.compareTo(b.value);
            }
        });
        Candidate top = list.get(0);
        if (top.score < SCORE_ACCEPT) return null;
        if (list.size() > 1) {
            Candidate second = list.get(1);
            if (second.score >= SCORE_ACCEPT && top.priority <= second.priority
                    && top.score - second.score < SCORE_GAP) {
                return null;
            }
        }
        return top;
    }

    /** 这笔钱是支出还是收入（退款/到账/转入不该弹「记一笔」）。 */
    static String direction(String text) {
        if (text == null) return "";
        return containsAny(text, incomeWords) ? "income" : "expense";
    }

    static boolean hasPayContext(String[] lines, int index) {
        for (int i = Math.max(0, index - 1); i <= Math.min(lines.length - 1, index + 1); i++) {
            if (containsAny(lines[i], payContext)) return true;
        }
        return false;
    }

    /** 付款语境门槛：支付应用名 / 付款结果词、商户或日期，至少命中一个。 */
    static boolean hasPaymentSignal(String text) {
        if (text == null || text.isEmpty()) return false;
        if (containsAny(text, paymentSignals) || containsAny(text, merchantKeys)) return true;
        return DATE.matcher(text).find();
    }

    /** 「优惠/原价」这类行里的金额压到门槛以下；正常行返回 0。 */
    private static int lineBias(String line) {
        return containsAny(line, penaltyKeys) ? -50 : 0;
    }

    /** 金额字符串转分，不再经过浮点，免得 12.34 变成 1233 分。 */
    static long centsOf(String value) {
        int dot = value.indexOf('.');
        if (dot < 0) return Long.parseLong(value) * 100;
        String ip = value.substring(0, dot);
        String fp = value.substring(dot + 1);
        if (fp.length() == 1) fp = fp + "0";
        if (fp.length() > 2) fp = fp.substring(0, 2);
        return Long.parseLong(ip) * 100 + Long.parseLong(fp);
    }

    /** 截图里是不是拍到了我们自己的卡片。 */
    static boolean looksLikeOurCard(String raw) {
        if (raw == null) return false;
        if (containsAny(raw, ownCard)) return true;
        return raw.contains("识别到") && raw.contains("确认记录");
    }

    /** 去重 hash：金额 + 去掉空白后的前 200 个字符，同一张账单重截会得到同一个值。 */
    static String dedupeKey(String amount, String text) {
        String norm = (text == null ? "" : text).replaceAll("\\s+", "");
        if (norm.length() > 200) norm = norm.substring(0, 200);
        String source = amount + "|" + norm;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(source.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) sb.append(String.format("%02x", digest[i]));
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            return amount + "|" + norm.hashCode();
        }
    }
}
