package com.shijinran.money.capture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import org.json.JSONObject;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * 通知栏规则的 JVM 单测：规则表来自仓库里的 src/lib/ocr/capture-rules.json，
 * 和线上装载的是同一份文件（构建时按字节复制到 assets）。
 */
public class NotifyRulesTest {

    private static final String WECHAT = "com.tencent.mm";
    private static final String ALIPAY = "com.eg.android.AlipayGphone";

    @BeforeClass
    public static void loadRules() throws Exception {
        File dir = new File(System.getProperty("user.dir"));
        for (int i = 0; i < 8 && dir != null; i++) {
            File candidate = new File(dir, "src/lib/ocr/capture-rules.json");
            if (candidate.isFile()) {
                String json = new String(Files.readAllBytes(candidate.toPath()), StandardCharsets.UTF_8);
                NotifyRules.init(new JSONObject(json));
                return;
            }
            dir = dir.getParentFile();
        }
        throw new IllegalStateException("找不到 src/lib/ocr/capture-rules.json");
    }

    @Test
    public void rulesAreLoaded() {
        assertEquals(true, NotifyRules.isReady());
    }

    @Test
    public void wechatPaymentIsParsed() {
        NotifyRules.Parsed parsed = NotifyRules.parse(
                WECHAT, "微信支付", "向 麦当劳 付款 12.30 元", null, null);
        assertNotNull(parsed);
        assertEquals(1230L, parsed.cents);
        assertEquals("12.30", parsed.amount);
        assertEquals(NotifyRules.TYPE_EXPENSE, parsed.type);
        assertEquals("麦当劳", parsed.merchant);
        assertEquals("微信支付", parsed.platform);
        assertNotNull(parsed.key);
    }

    @Test
    public void alipayPaymentIsParsed() {
        NotifyRules.Parsed parsed = NotifyRules.parse(
                ALIPAY, "支付宝", "付款成功￥3.00 (AB)湖北武汉", null, null);
        assertNotNull(parsed);
        assertEquals(300L, parsed.cents);
        assertEquals(NotifyRules.TYPE_EXPENSE, parsed.type);
        assertEquals("支付宝", parsed.platform);
    }

    @Test
    public void refundIsIncome() {
        NotifyRules.Parsed parsed = NotifyRules.parse(
                ALIPAY, "支付宝", "退款成功 ￥23.45", null, null);
        assertNotNull(parsed);
        assertEquals(2345L, parsed.cents);
        assertEquals(NotifyRules.TYPE_INCOME, parsed.type);
    }

    @Test
    public void wholeYuanIsParsed() {
        NotifyRules.Parsed parsed = NotifyRules.parse(
                WECHAT, "微信支付", "向 便利店 付款 12 元", null, null);
        assertNotNull(parsed);
        assertEquals(1200L, parsed.cents);
    }

    @Test
    public void fullwidthAmountIsParsed() {
        NotifyRules.Parsed parsed = NotifyRules.parse(
                WECHAT, "微信支付", "－￥１２．３０", null, null);
        assertNotNull(parsed);
        assertEquals(1230L, parsed.cents);
    }

    @Test
    public void verificationCodeIsIgnored() {
        assertNull(NotifyRules.parse(WECHAT, "微信", "验证码 123456，请勿泄露", null, null));
    }

    @Test
    public void pendingPaymentIsIgnored() {
        assertNull(NotifyRules.parse(ALIPAY, "支付宝", "待支付 ￥12.00", null, null));
    }

    @Test
    public void otherPackagesAreIgnored() {
        assertNull(NotifyRules.parse("com.example.app", "支付成功", "￥12.00", null, null));
    }

    @Test
    public void twoDifferentAmountsAreRejected() {
        assertNull(NotifyRules.parse(ALIPAY, "支付宝", "支付成功 ￥12.00，订单 ￥33.00", null, null));
    }

    @Test
    public void amountWithoutUnitIsRejected() {
        assertNull(NotifyRules.parse(ALIPAY, "支付宝", "支付成功 12.30", null, null));
    }

    @Test
    public void duplicateTextFieldsDoNotDoubleCount() {
        NotifyRules.Parsed parsed = NotifyRules.parse(
                WECHAT, "微信支付", "向 麦当劳 付款 12.30 元", "向 麦当劳 付款 12.30 元", null);
        assertNotNull(parsed);
        assertEquals(1230L, parsed.cents);
    }

    @Test
    public void incomeNotificationWithPlatformTitleIsIncome() {
        // 标题「微信支付」里的「支付」以前会把收款通知判成支出
        NotifyRules.Parsed parsed = NotifyRules.parse(
                WECHAT, "微信支付", "收款成功 ￥80.00", null, null);
        assertNotNull(parsed);
        assertEquals(8000L, parsed.cents);
        assertEquals(NotifyRules.TYPE_INCOME, parsed.type);
    }

    @Test
    public void arrivalWithPlatformTitleIsIncome() {
        NotifyRules.Parsed parsed = NotifyRules.parse(
                ALIPAY, "支付宝", "已到账 ￥90.00", null, null);
        assertNotNull(parsed);
        assertEquals(9000L, parsed.cents);
        assertEquals(NotifyRules.TYPE_INCOME, parsed.type);
    }

    @Test
    public void expenseNotificationWithPlatformTitleStaysExpense() {
        NotifyRules.Parsed parsed = NotifyRules.parse(
                WECHAT, "微信支付", "付款成功 ￥5.00", null, null);
        assertNotNull(parsed);
        assertEquals(NotifyRules.TYPE_EXPENSE, parsed.type);
    }

    @Test
    public void sameNotificationHasSameKey() {
        NotifyRules.Parsed a = NotifyRules.parse(WECHAT, "微信支付", "向 麦当劳 付款 12.30 元", null, null);
        NotifyRules.Parsed b = NotifyRules.parse(WECHAT, "微信支付", "向 麦当劳 付款 12.30 元", null, null);
        assertNotNull(a);
        assertNotNull(b);
        assertEquals(a.key, b.key);
    }
}
