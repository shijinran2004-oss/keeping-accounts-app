package com.shijinran.money.capture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ShotRulesTest {
    // 真账单：有支付结果词 + 金额
    @Test public void realBillIsAccepted() {
        assertEquals("23.45", ShotRules.acceptedAmount("支付成功\n¥23.45\n商户：美团外卖\n2026-11-16 16:12"));
    }

    // 聊天：价格没有支付语境，也没有商户/日期/支付词
    @Test public void chatPriceIsRejected() {
        assertNull(ShotRules.acceptedAmount("小明：这个包多少钱\n我：¥199 包邮吧\n小明：好的"));
    }

    // 网页商品价
    @Test public void webProductPriceIsRejected() {
        assertNull(ShotRules.acceptedAmount("白色运动鞋\n¥59.90\n加入购物车\n立即购买"));
    }

    // 股票：有 ¥ 也有数字，但没有支付语境
    @Test public void stockNumbersAreRejected() {
        assertNull(ShotRules.acceptedAmount("贵州茅台 1,680.00 +1.23%\n成交额 ¥12.3亿"));
    }

    // 时间、版本号：没有 ¥，裸 xx.xx 不再算金额
    @Test public void timeAndVersionAreRejected() {
        assertNull(ShotRules.acceptedAmount("16:12\nv1.4.23\n2026-11-16"));
    }

    // 有金额关键词但没有任何付款信号（商户/日期/支付应用名）：静默
    @Test public void amountWithoutSignalIsRejected() {
        assertNull(ShotRules.acceptedAmount("实付 ¥12.00"));
    }

    // 同行有 ¥ 和支付语境词但没有信号：金额能取到，门槛拦下
    @Test public void payContextWithoutSignalStillRejected() {
        assertNull(ShotRules.acceptedAmount("付款\n¥9.90"));
    }

    // 相邻行的支付语境词也算数
    @Test public void adjacentPayContextCountsForYen() {
        assertEquals("9.90", ShotRules.amount("付款\n¥9.90"));
    }

    // 账单页：没有 ¥、没有「实付」，标题下面就是一个 -3.49；支付成功 + 交易单号 + 商户全称给了足够信号
    @Test public void billWithoutYenIsAccepted() {
        String page = "12:44\n先购后付\n-3.49\n当前状态 支付成功\n支付时间 2026年11月15日 13:23:40"
                + "\n商品 先购后付\n商户全称 芜湖市丰宜科技有限公司\n收单机构 财付通支付科技有限公司"
                + "\n支付方式 零钱\n交易单号 420000315620261157640752267";
        assertEquals("3.49", ShotRules.acceptedAmount(page));
    }

    // 只有一行裸金额、信号不满两条：还是不能当账单
    @Test public void chatWithBarePriceStillRejected() {
        assertNull(ShotRules.acceptedAmount("小明\n商户：这个是价格\n199.00\n好的"));
    }

    @Test public void oneStrongSignalIsNotEnough() {
        assertNull(ShotRules.acceptedAmount("贵州茅台\n1680.00\n支付成功"));
    }

    @Test public void ownCardIsRecognised() {
        assertTrue(ShotRules.looksLikeOurCard("¥23.45 已写进账本，回 App 就能看到"));
        assertTrue(ShotRules.looksLikeOurCard("识别到 ¥45.67\n点「确认记录」直接记一笔"));
        assertFalse(ShotRules.looksLikeOurCard("支付成功\n¥23.45\n商户：美团外卖"));
    }

    @Test public void dedupeKeyIgnoresWhitespaceButNotAmount() {
        String a = ShotRules.dedupeKey("23.45", "支付成功\n ¥23.45 \n商户：美团外卖");
        String b = ShotRules.dedupeKey("23.45", "支付成功¥23.45商户：美团外卖");
        String c = ShotRules.dedupeKey("12.00", "支付成功¥23.45商户：美团外卖");
        assertEquals(a, b);
        assertNotEquals(a, c);
    }

    // ---- 1.4.26：归一化、候选打分、平台模板、方向 ----

    // 全角数字/全角点/全角减号/￥：归一化之后照样认出 12.00
    @Test public void fullwidthTextIsNormalised() {
        assertTrue(ShotRules.normalizeText("－￥１２．００\n16:12").contains("-¥12.00"));
        assertEquals("12.00", ShotRules.acceptedAmount("支付成功\n－￥１２．００\n商户：测试"));
    }

    // 千分位逗号不能把 1,234.56 拆成 1 块钱；余额行整行跳过
    @Test public void balanceLineIsNotTheAmount() {
        assertEquals("23.45",
                ShotRules.acceptedAmount("支付成功\n余额 ¥1,234.56\n¥23.45\n商户：美团外卖"));
    }

    // 优惠行的金额要扣分，实付才是这笔钱
    @Test public void discountLineDoesNotWin() {
        assertEquals("25.00",
                ShotRules.acceptedAmount("支付成功\n合计 ¥30.00\n优惠 -¥5.00\n实付 ¥25.00\n商户：美团"));
    }

    // 退款页：金额认出来了，但方向是收入，不弹支出卡
    @Test public void refundIsNotAnExpense() {
        String page = "退款成功\n退款金额 ¥23.45\n原支付金额 ¥25.00\n交易单号 420000";
        assertEquals("25.00", ShotRules.amount(page));
        assertNull(ShotRules.acceptedAmount(page));
    }

    // 微信转账页：模板锚点「转账金额」命中，金额在下一行
    @Test public void wechatTemplateReadsTransferAmount() {
        String page = "微信支付\n转账金额\n￥100.00\n收款方 张三\n转账成功";
        assertEquals("wechat", ShotRules.platform(page));
        assertEquals("100.00", ShotRules.acceptedAmount(page));
    }

    // 两个候选一样高分：拿不准，不弹
    @Test public void ambiguousAmountsAreRejected() {
        assertNull(ShotRules.acceptedAmount("支付成功\n¥30.00\n¥50.00\n付款"));
    }

    // 平台判断
    @Test public void platformIsDetected() {
        assertEquals("alipay", ShotRules.platform("支付宝\n先购后付\n交易单号 420"));
        assertEquals("bank", ShotRules.platform("交易成功\n账户余额 1.00"));
        assertEquals("", ShotRules.platform("支付成功\n¥23.45\n商户：美团外卖"));
    }

    // 「入账」这种收入词：不弹支出卡
    @Test public void incomingTransferIsNotAnExpense() {
        assertNull(ShotRules.acceptedAmount("账户入账\n转账金额 ¥500.00\n交易成功\n尾号 1234"));
    }

    // 金额转分不经过浮点
    @Test public void centsAreParsedExactly() {
        assertEquals(1234L, ShotRules.centsOf("12.34"));
        assertEquals(1200L, ShotRules.centsOf("12"));
        assertEquals(1200L, ShotRules.centsOf("12.0"));
        assertEquals(1200L, ShotRules.centsOf("12.00"));
        assertEquals(9999900L, ShotRules.centsOf("99999.00"));
    }

    // ---- 1.4.27：微信转账详情页（没有 ¥、没有「实付」，金额带正负号）----

    // 转账支出页：只有「转账说明/转账时间/转账单号」，-84.00 就是这笔支出
    @Test public void wechatTransferOutIsAccepted() {
        String page = "转账-转给王泽涛\n-84.00\n当前状态 对方已收钱\n转账说明 微信转账"
                + "\n转账时间 2026年11月7日 23:15:32\n收款时间 2026年11月7日 23:15:53"
                + "\n支付方式 零钱\n转账单号 1000050001202611070534857338511\n账单服务";
        assertEquals("84.00", ShotRules.amount(page));
        assertEquals("84.00", ShotRules.acceptedAmount(page));
        assertEquals("wechat", ShotRules.platform(page));
    }

    // 转账收入页：+100.00 是收进来的钱，不能记成支出
    @Test public void wechatTransferInIsNotAnExpense() {
        String page = "转账-来自妈妈\n+100.00\n当前状态 已存入零钱\n转账说明 微信转账"
                + "\n转账时间 2026年11月9日 19:29:39\n收款时间 2026年11月9日 19:38:22"
                + "\n支付方式 零钱\n转账单号 1000050001202611090442941488104\n账单服务";
        assertEquals("100.00", ShotRules.amount(page));
        assertNull(ShotRules.acceptedAmount(page));
    }

    // 账单列表页的退款行（转账-退款 +400.00）：同样是收入，不弹支出卡
    @Test public void listedRefundIsNotAnExpense() {
        String page = "账单\n转账-退款\n+400.00\n11月3日 14:56\n支出¥672.52 收入¥822.00\n账单服务";
        assertNull(ShotRules.acceptedAmount(page));
    }
}
