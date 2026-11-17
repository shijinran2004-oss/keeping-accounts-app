package com.shijinran.money.capture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.shijinran.money.ocr.OcrLine;

import org.json.JSONObject;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.List;

public class ShotRulesTest {

    /**
     * 规则表在 JSON 里（src/lib/ocr/capture-rules.json），单测按仓库相对路径找它。
     * 找不到就直接失败：拿空规则跑出来的「全部静默」是假绿灯。
     */
    @BeforeClass
    public static void loadRules() throws Exception {
        File dir = new File(System.getProperty("user.dir", "."));
        File found = null;
        for (int i = 0; i < 8 && dir != null; i++, dir = dir.getParentFile()) {
            File candidate = new File(dir, "src/lib/ocr/capture-rules.json");
            if (candidate.isFile()) {
                found = candidate;
                break;
            }
        }
        assertNotNull("找不到 src/lib/ocr/capture-rules.json", found);
        String json = new String(Files.readAllBytes(found.toPath()), StandardCharsets.UTF_8);
        ShotRules.init(new JSONObject(json));
    }

    @Test
    public void rulesAreLoaded() {
        assertTrue(ShotRules.isReady());
    }

    private static OcrLine line(String text, int left, int top, int right, int bottom) {
        return new OcrLine(text, left, top, right, bottom, 0.9f);
    }

    private static List<OcrLine> page(OcrLine... items) {
        return Arrays.asList(items);
    }

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

    // 强信号只有一条时，孤零零的金额还是不算
    @Test public void oneStrongSignalIsNotEnough() {
        assertNull(ShotRules.acceptedAmount("贵州茅台\n1680.00\n支付成功"));
    }

    // 拍到我们自己的卡片：一律不当账单
    @Test public void ownCardIsRecognised() {
        assertTrue(ShotRules.looksLikeOurCard("¥23.45 已写进账本，回 App 就能看到"));
        assertTrue(ShotRules.looksLikeOurCard("识别到 ¥45.67\n点「确认记录」直接记一笔"));
        assertFalse(ShotRules.looksLikeOurCard("支付成功\n¥23.45\n商户：美团外卖"));
    }

    // 去重：同一张账单的空白不同也要得到同一个 key，金额不同则不同
    @Test public void dedupeKeyIgnoresWhitespaceButNotAmount() {
        String a = ShotRules.dedupeKey("23.45", "支付成功\n ¥23.45 \n商户：美团外卖");
        String b = ShotRules.dedupeKey("23.45", "支付成功¥23.45商户：美团外卖");
        String c = ShotRules.dedupeKey("12.00", "支付成功¥23.45商户：美团外卖");
        assertEquals(a, b);
        assertNotEquals(a, c);
    }

    // 全角数字、全角减号、全角￥都要归一化
    @Test public void fullwidthTextIsNormalised() {
        assertTrue(ShotRules.normalizeText("－￥１２．００\n16:12").contains("-¥12.00"));
        assertEquals("12.00", ShotRules.acceptedAmount("支付成功\n－￥１２．００\n商户：测试"));
    }

    // 余额行里的数字不是这笔钱
    @Test public void balanceLineIsNotTheAmount() {
        assertEquals("23.45",
                ShotRules.acceptedAmount("支付成功\n余额 ¥1,234.56\n¥23.45\n商户：美团外卖"));
    }

    // 合计 30、优惠 5、实付 25：只认实付
    @Test public void discountLineDoesNotWin() {
        assertEquals("25.00",
                ShotRules.acceptedAmount("支付成功\n合计 ¥30.00\n优惠 -¥5.00\n实付 ¥25.00\n商户：美团"));
    }

    // 退款页：金额认得出，但方向是收入，不弹支出卡
    @Test public void refundIsNotAnExpense() {
        String page = "支付成功\n合计 ¥30.00\n优惠 -¥5.00\n实付 ¥25.00\n商户：美团\n退款成功";
        assertEquals("25.00", ShotRules.amount(page));
        assertNull(ShotRules.acceptedAmount(page));
    }

    // 微信模板：关键词一行、金额下一行
    @Test public void wechatTemplateReadsTransferAmount() {
        String page = "微信支付\n转账金额\n¥100.00\n交易成功";
        assertEquals("wechat", ShotRules.platform(page));
        assertEquals("100.00", ShotRules.acceptedAmount(page));
    }

    // 两个金额分数一样高：宁可不弹
    @Test public void ambiguousAmountsAreRejected() {
        assertNull(ShotRules.acceptedAmount("支付成功\n¥30.00\n¥50.00\n付款"));
    }

    // 平台识别按 JSON 里模板的顺序：支付宝 → 微信 → 银行
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

    @Test public void wechatTransferOutIsAccepted() {
        String page = "转账-转给王泽涛\n-84.00\n当前状态 对方已收钱\n转账说明 微信转账"
                + "\n转账时间 2026年11月7日 23:15:32\n收款时间 2026年11月7日 23:15:53"
                + "\n支付方式 零钱\n转账单号 1000050001202611070534857338511\n账单服务";
        assertEquals("84.00", ShotRules.amount(page));
        assertEquals("84.00", ShotRules.acceptedAmount(page));
        assertEquals("wechat", ShotRules.platform(page));
    }

    @Test public void wechatTransferInIsNotAnExpense() {
        String page = "转账-来自妈妈\n+100.00\n当前状态 已存入零钱\n转账说明 微信转账"
                + "\n转账时间 2026年11月9日 19:29:39\n收款时间 2026年11月9日 19:38:22"
                + "\n支付方式 零钱\n转账单号 1000050001202611090442941488104\n账单服务";
        assertEquals("100.00", ShotRules.amount(page));
        assertNull(ShotRules.acceptedAmount(page));
    }

    @Test public void listedRefundIsNotAnExpense() {
        String page = "账单\n转账-退款\n+400.00\n11月3日 14:56\n支出¥672.52 收入¥822.00\n账单服务";
        assertNull(ShotRules.acceptedAmount(page));
    }

    // ---- 1.4.28：支付宝「账单详情」页（没有 ¥、没有「实付」，标题下面就一行大金额）----

    @Test public void alipayBillDetailExpenseIsAccepted() {
        String page = "14:10\n账单详情\n智能自助设备\n-20.00\n交易成功\n支付时间\n2026-11-13 12:36:02"
                + "\n付款方式\n余额宝>\n商品说明\n自助服务-充值-充电桩/G919042\n支付奖励\n立即领取2积分"
                + "\n收单机构\n上海汇付支付有限公司\n清算机构\n中国银联股份有限公司"
                + "\n收款方全称\n武汉大源科技有限公司\n账单分类\n商业服务>\n计入收支";
        assertEquals("alipay", ShotRules.platform(page));
        assertEquals("20.00", ShotRules.amount(page));
        assertEquals("20.00", ShotRules.acceptedAmount(page));
    }

    @Test public void alipayBillDetailWithoutIssuerIsAccepted() {
        String page = "账单详情\n拼多多平台商户\n-5.90\n交易成功\n支付时间\n2026-11-15 23:56:40"
                + "\n付款方式\n花呗>\n商品说明\n商户单号XP2426111523101488604494\n001258"
                + "\n账单分类\n日用百货>\n计入收支\n备注";
        assertEquals("5.90", ShotRules.acceptedAmount(page));
    }

    @Test public void alipayRepaymentIsNotAnExpense() {
        String page = "账单详情\n花呗\n83.85\n还款成功\n创建时间\n2026-11-12 09:15:12"
                + "\n付款方式\n网商银行数字人民币(9283)>\n还款到\n花呗\n服务详情\n花呗主动还款-2026年11月账单"
                + "\n账单分类\n信用借还>\n计入收支";
        assertEquals("83.85", ShotRules.amount(page));
        assertNull(ShotRules.acceptedAmount(page));
    }

    @Test public void alipayYieldIsNotAnExpense() {
        String page = "账单详情\n长盛基金管理有限公司>\n0.01\n交易成功\n创建时间\n2026-11-11 05:52:13"
                + "\n商品说明\n余额宝-2026.11.10-收益发放\n对方账户\n长盛基金管理有限公司"
                + "\n账单分类\n投资理财>\n计入收支";
        assertEquals("0.01", ShotRules.amount(page));
        assertNull(ShotRules.acceptedAmount(page));
    }

    // ---- 1.4.29：行级版面（字号 / 靠上 / 居中）----

    private static final String BIG_PAGE = "订单信息\n白色运动鞋\n199.00\n支付成功\n商户：某某\n2026-11-16\n商品说明\n查看物流";

    private static List<OcrLine> bigPageLines() {
        return page(
                line("订单信息", 40, 80, 300, 120),
                line("白色运动鞋", 40, 140, 300, 180),
                line("199.00", 240, 220, 440, 310),
                line("支付成功", 40, 500, 240, 540),
                line("商户：某某", 40, 560, 440, 600),
                line("2026-11-16", 40, 620, 360, 660),
                line("商品说明", 40, 1000, 240, 1040),
                line("查看物流", 40, 2400, 240, 2440));
    }

    // 纯文本认不出（强信号只有一条），但版面能看出「标题下面的大金额」
    @Test public void bigTopAmountOnPaymentPageIsAccepted() {
        assertNull("没有坐标时认不出", ShotRules.amount(BIG_PAGE));
        ShotRules.Judgement judged = ShotRules.judge(BIG_PAGE, bigPageLines());
        assertEquals("199.00", judged.amount);
        assertNull(judged.reason);
    }

    // 页脚（按钮区）上的大金额不算
    @Test public void footerButtonAmountIsIgnored() {
        String raw = "支付成功\n商户：某某\n2026-11-16\n199.00";
        List<OcrLine> layout = page(
                line("支付成功", 40, 80, 240, 120),
                line("商户：某某", 40, 140, 440, 180),
                line("2026-11-16", 40, 200, 360, 240),
                line("199.00", 240, 2400, 440, 2490));
        assertNull(ShotRules.amount(raw));
        assertNull(ShotRules.judge(raw, layout).amount);
    }

    // 版面认出了金额，但没有付款信号：只记日志，不弹卡
    @Test public void bigAmountWithoutSignalIsStillRejected() {
        String raw = "商品详情\n199.00\n加入购物车";
        List<OcrLine> layout = page(
                line("商品详情", 40, 80, 240, 120),
                line("199.00", 240, 220, 440, 310),
                line("加入购物车", 40, 2400, 240, 2440));
        ShotRules.Judgement judged = ShotRules.judge(raw, layout);
        assertEquals("199.00", judged.amount);
        assertEquals("no_signal", judged.reason);
        assertNull(ShotRules.acceptedAmount(raw));
    }

    // 有「实付」锚点时，版面分数不能让旁边那个大数字翻盘
    @Test public void keyedAmountBeatsUnrelatedBigNumber() {
        String raw = "价格\n999.00\n实付 ¥25.00\n支付成功\n商户：某某";
        List<OcrLine> layout = page(
                line("价格", 40, 80, 240, 120),
                line("999.00", 240, 200, 440, 290),
                line("实付 ¥25.00", 40, 700, 600, 740),
                line("支付成功", 40, 800, 240, 840),
                line("商户：某某", 40, 860, 440, 900));
        assertEquals("25.00", ShotRules.judge(raw, layout).amount);
    }

    // 坐标行数对不上时退回纯文本，不拿错位的坐标硬打分
    @Test public void misalignedLinesFallBackToTextOnly() {
        List<OcrLine> wrong = page(line("订单信息", 40, 80, 300, 120));
        assertNull(ShotRules.judge(BIG_PAGE, wrong).amount);
    }
}
