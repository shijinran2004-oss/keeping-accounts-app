package com.shijinran.money.capture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
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
}
