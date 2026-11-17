package com.shijinran.money.capture;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 截图判定的纯函数：金额、付款语境门槛、是不是我们自己的卡片、去重 hash。
 * 不依赖 Android，可以直接用 JVM 单测覆盖。关键词数组与 src/lib/ocr/capture-rules.json
 * 保持一致，由 capture-rules.test.ts 检查。
 */
final class ShotRules {
    private ShotRules() {}

    /** 「付了多少」类关键词，命中就直接取后面的数字 */
    static final String[] AMOUNT_KEYS = {"实付", "实收", "支付金额", "付款金额", "消费金额", "交易金额", "实付款"};
    /** 合计类关键词，实付没有时才退到这里 */
    static final String[] TOTAL_KEYS = {"合计", "总计", "总金额", "应收", "本次消费"};
    /** ¥ 后面的数字只有同一行或相邻行出现这些词才算金额 */
    static final String[] PAY_CONTEXT = {"实付", "合计", "支付", "付款", "交易金额", "收款"};
    /** 付款语境信号：支付应用名或付款结果词 */
    static final String[] PAY_SIGNALS = {"微信支付", "支付宝", "云闪付", "付款成功", "支付成功", "收款方", "交易单号", "账单详情"};
    /** 商户之类的字样也算一个信号 */
    static final String[] MERCHANT_KEYS = {"商户", "商家"};
    /** 我们自己的卡片会写的词，这些截图不能再认成账单 */
    static final String[] OWN_CARD = {"已写进账本", "已记一笔", "正在认金额"};

    private static final String NUM = "([0-9]{1,7}(?:\\.[0-9]{1,2})?)";
    private static final Pattern AMOUNT_KEYED = Pattern.compile("(?:" + alt(AMOUNT_KEYS) + ")[^0-9]{0,8}[¥￥]?\\s*" + NUM);
    private static final Pattern TOTAL_KEYED = Pattern.compile("(?:" + alt(TOTAL_KEYS) + ")[^0-9]{0,8}[¥￥]?\\s*" + NUM);
    private static final Pattern YEN = Pattern.compile("[¥￥]\\s*" + NUM);
    private static final Pattern DATE = Pattern.compile("20[0-9]{2}[-/.年][0-9]{1,2}[-/.月][0-9]{1,2}");

    private static String alt(String[] keys) {
        return String.join("|", keys);
    }

    private static boolean containsAny(String text, String[] keys) {
        for (String key : keys) {
            if (text.contains(key)) return true;
        }
        return false;
    }

    /** 只抽取金额（不带 ¥）：先看关键词，再看 ¥ 且同行或相邻行有支付语境。认不出返回 null。 */
    static String amount(String text) {
        if (text == null || text.isEmpty()) return null;
        Matcher m = AMOUNT_KEYED.matcher(text);
        if (m.find()) return m.group(1);
        m = TOTAL_KEYED.matcher(text);
        if (m.find()) return m.group(1);
        String[] lines = text.split("\n");
        for (int i = 0; i < lines.length; i++) {
            Matcher y = YEN.matcher(lines[i]);
            if (y.find() && hasPayContext(lines, i)) return y.group(1);
        }
        return null;
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

    /** 真正决定要不要弹卡：金额 + 至少一个付款语境信号，否则返回 null（静默）。 */
    static String acceptedAmount(String text) {
        String amount = amount(text);
        if (amount == null) return null;
        return hasPaymentSignal(text) ? amount : null;
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
