package com.shijinran.money.capture;

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
 * 截图判定的纯函数：把 OCR 原文认成一笔钱、判断像不像账单、是不是我们自己的卡片、去重 hash。
 * 不依赖 Android，可以直接用 JVM 单测覆盖。
 *
 * 认金额的流程（误报几乎都来自「页面上随便一个数字」）：
 * 1. normalizeText：全角/变体符号归一化、去掉千分位逗号、整段剔除日期时间；
 * 2. 按行收集候选：实付类关键词、合计类关键词、¥ 金额、账单页独行大数字；
 * 3. 打分：平台模板 +60、实付类 +50、合计类 +40、¥ 同行有支付语境 +30 / 隔一行 +20 / 隔两行 +15；
 *    优惠/原价/红包这类行 −50，余额/额度这类行整行跳过；
 * 4. 平台模板（微信/支付宝/银行）先试，命中就优先；
 * 5. 取分数最高的候选，和次高分的差不够就判「拿不准」，宁可不弹；
 * 6. 收入/退款方向不当支出，整页没有任何付款信号也不弹。
 * 关键词数组与 src/lib/ocr/capture-rules.json 保持一致，由 capture-rules.test.ts 检查。
 */
final class ShotRules {
    private ShotRules() {}

    /** 「付了多少」类关键词，命中就直接取后面的数字 */
    static final String[] AMOUNT_KEYS = {"实付", "实收", "支付金额", "付款金额", "消费金额", "交易金额", "实付款"};
    /** 合计类关键词，实付没有时才退到这里 */
    static final String[] TOTAL_KEYS = {"合计", "总计", "总金额", "应收", "本次消费"};
    /** ¥ 后面的数字只有附近出现这些词才算金额 */
    static final String[] PAY_CONTEXT = {"实付", "合计", "支付", "付款", "交易金额", "收款"};
    /** 付款语境信号：支付应用名或付款结果词 */
    static final String[] PAY_SIGNALS = {"微信支付", "支付宝", "云闪付", "付款成功", "支付成功", "收款方", "交易单号", "账单详情"};
    /** 商户之类的字样也算一个信号 */
    static final String[] MERCHANT_KEYS = {"商户", "商家"};
    /**
     * 强支付信号：一页里出现两条以上，就允许「单独一行只有 -3.49 这种裸金额」也算金额。
     * 支付宝/微信账单页的金额常常既没有 ¥ 也没有「实付」，就是标题下面一个大数字。
     */
    static final String[] STRONG_SIGNALS = {"支付成功", "付款成功", "交易单号", "商户全称", "收单机构", "账单详情", "账单服务",
            "转账单号", "转账说明", "转账时间", "收款时间", "对方已收钱", "已存入零钱"};
    /** 我们自己的卡片会写的词，这些截图不能再认成账单 */
    static final String[] OWN_CARD = {"已写进账本", "已记一笔", "正在认金额"};
    /** 优惠/原价之类的行：里头的数字不是实付，分数直接压到门槛以下 */
    static final String[] PENALTY_KEYS = {"优惠", "原价", "券", "红包", "积分", "抵扣", "立减", "满减", "返现"};
    /** 余额/额度之类的行：里头的数字不是这笔钱，整行跳过 */
    static final String[] BALANCE_KEYS = {"余额", "剩余", "额度", "卡余", "原额", "零钱", "可用"};
    /** 收入/退款方向：这些页面不该弹「记一笔」支出卡 */
    static final String[] INCOME_WORDS = {"退款成功", "已到账", "转入", "收款成功", "收入", "入账", "退还"};

    /** 平台特征词：判断这张截图是微信、支付宝还是银行，决定先试哪套模板 */
    private static final String[] WECHAT_KEYS = {"微信支付", "转账金额", "收款方", "微信红包", "微信转账", "转账单号", "对方已收钱"};
    private static final String[] ALIPAY_KEYS = {"支付宝", "账单详情", "商家订单号", "花呗", "余额宝", "先享后付", "先购后付", "收钱码"};
    private static final String[] BANK_KEYS = {"交易成功", "账户余额", "尾号", "转账汇款", "短信通知"};
    /** 各平台的金额锚点：命中就取，不再看通用规则 */
    private static final String[] WECHAT_ANCHORS = {"转账金额", "付款金额", "支付金额", "实付金额", "付款给"};
    private static final String[] ALIPAY_ANCHORS = {"支付金额", "付款金额", "订单金额", "账单金额", "实付金额", "实付"};
    private static final String[] BANK_ANCHORS = {"交易金额", "支出金额", "转账金额", "消费金额"};

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
        /** null = 可以弹；own_card / no_amount / uncertain / income / no_signal */
        final String reason;

        Judgement(String amount, String reason) {
            this.amount = amount;
            this.reason = reason;
        }
    }

    /** 一个金额候选：值、分数、来源优先级（3 平台模板 / 2 实付关键词 / 1 合计关键词 / 0 仅语境）。 */
    private static final class Candidate {
        final String value;
        final long cents;
        final int score;
        final int priority;
        /** 金额前面带 + 号（微信转账收入页），这种一定是收入，不能弹记账卡 */
        boolean plus;

        Candidate(String value, int score, int priority) {
            this.value = value;
            this.cents = centsOf(value);
            this.score = score;
            this.priority = priority;
        }
    }

    private static String alt(String[] keys) {
        return String.join("|", keys);
    }

    private static boolean containsAny(String text, String[] keys) {
        for (String key : keys) {
            if (text.contains(key)) return true;
        }
        return false;
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
        if (raw == null || raw.isEmpty()) return new Judgement(null, "no_amount");
        if (looksLikeOurCard(raw)) return new Judgement(null, "own_card");
        String text = normalizeText(raw);
        String[] lines = text.split("\n");
        List<Candidate> found = new ArrayList<>();
        collectKeyed(lines, found);
        collectYen(lines, found);
        collectBare(text, lines, found);
        Candidate tpl = templateAmount(text, lines);
        if (tpl != null) found.add(tpl);
        Candidate best = pick(found);
        if (best == null) return new Judgement(null, found.isEmpty() ? "no_amount" : "uncertain");
        if (best.plus || "income".equals(direction(text))) return new Judgement(best.value, "income");
        if (!hasPaymentSignal(raw)) return new Judgement(best.value, "no_signal");
        return new Judgement(best.value, null);
    }

    /** 关键词锚点：同一行取关键词后面的金额，没有就看下一行是不是只有一个金额。 */
    private static void collectKeyed(String[] lines, List<Candidate> out) {
        for (int i = 0; i < lines.length; i++) {
            if (containsAny(lines[i], BALANCE_KEYS)) continue;
            addKeyed(lines, i, AMOUNT_KEYS, 2, 50, out);
            addKeyed(lines, i, TOTAL_KEYS, 1, 40, out);
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
            return new Candidate(value, base + lineBias(line), priority);
        }
        // 版式换行：关键词一行、金额在下一行（微信「转账金额」常见写法）
        if (index + 1 < lines.length) {
            Matcher n = BARE_LINE.matcher(lines[index + 1].trim());
            if (n.matches()) return new Candidate(n.group(1), base + lineBias(line), priority);
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
            if (containsAny(lines[i], BALANCE_KEYS)) continue;
            Matcher m = YEN.matcher(lines[i]);
            while (m.find()) {
                int score = contextScore(lines, i, lines[i]) + lineBias(lines[i]);
                out.add(new Candidate(m.group(1), score, 0));
            }
        }
    }

    private static int contextScore(String[] lines, int index, String line) {
        if (containsAny(line, PAY_CONTEXT)) return 30;
        for (int d = 1; d <= 2; d++) {
            boolean hit = (index - d >= 0 && containsAny(lines[index - d], PAY_CONTEXT))
                    || (index + d < lines.length && containsAny(lines[index + d], PAY_CONTEXT));
            if (hit) return d == 1 ? 20 : 15;
        }
        return 0;
    }

    /** 账单页独行大数字：只有强信号满两条才收，避免把聊天里孤零零的一行价格当账单。 */
    private static void collectBare(String text, String[] lines, List<Candidate> out) {
        int strong = 0;
        for (String key : STRONG_SIGNALS) {
            if (text.contains(key)) strong++;
        }
        if (strong < 2) return;
        int base = 20 + Math.min(strong - 2, 2) * 5;
        for (int i = 0; i < lines.length; i++) {
            if (containsAny(lines[i], BALANCE_KEYS)) continue;
            String line = lines[i].trim();
            Matcher m = BARE_LINE.matcher(line);
            if (m.matches()) {
                Candidate c = new Candidate(m.group(1), base + lineBias(lines[i]), 0);
                c.plus = line.startsWith("+");
                out.add(c);
            }
        }
    }

    /** 平台模板：微信/支付宝/银行的金额字段名很固定，命中就直接取，不再走通用打分。 */
    private static Candidate templateAmount(String text, String[] lines) {
        String[] anchors;
        String platform = platform(text);
        if ("alipay".equals(platform)) anchors = ALIPAY_ANCHORS;
        else if ("wechat".equals(platform)) anchors = WECHAT_ANCHORS;
        else if ("bank".equals(platform)) anchors = BANK_ANCHORS;
        else return null;
        for (int i = 0; i < lines.length; i++) {
            if (containsAny(lines[i], BALANCE_KEYS)) continue;
            for (String anchor : anchors) {
                Candidate c = keyedCandidate(lines, i, anchor, 3, 60);
                if (c != null) return c;
            }
        }
        return null;
    }

    /** 这张截图更像哪个平台的账单页：alipay / wechat / bank / 空。 */
    static String platform(String text) {
        if (text == null || text.isEmpty()) return "";
        if (containsAny(text, ALIPAY_KEYS)) return "alipay";
        if (containsAny(text, WECHAT_KEYS)) return "wechat";
        if (containsAny(text, BANK_KEYS)) return "bank";
        return "";
    }

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
        return containsAny(text, INCOME_WORDS) ? "income" : "expense";
    }

    static boolean hasPayContext(String[] lines, int index) {
        for (int i = Math.max(0, index - 1); i <= Math.min(lines.length - 1, index + 1); i++) {
            if (containsAny(lines[i], PAY_CONTEXT)) return true;
        }
        return false;
    }

    /** 付款语境门槛：支付应用名 / 付款结果词、商户或日期，至少命中一个。 */
    static boolean hasPaymentSignal(String text) {
        if (text == null || text.isEmpty()) return false;
        if (containsAny(text, PAY_SIGNALS) || containsAny(text, MERCHANT_KEYS)) return true;
        return DATE.matcher(text).find();
    }

    /** 「优惠/原价」这类行里的金额压到门槛以下；正常行返回 0。 */
    private static int lineBias(String line) {
        return containsAny(line, PENALTY_KEYS) ? -50 : 0;
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
        if (containsAny(raw, OWN_CARD)) return true;
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
