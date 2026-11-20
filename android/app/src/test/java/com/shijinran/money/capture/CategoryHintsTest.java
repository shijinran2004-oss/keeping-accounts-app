package com.shijinran.money.capture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 截图卡片的分类提示：纯函数部分（解析 / 打分 / 排序） */
public class CategoryHintsTest {

    private static CategoryHints.Hint hint(String id, String name, String... keywords) {
        return new CategoryHints.Hint(id, name, keywords);
    }

    private static List<CategoryHints.Hint> catalog() {
        return java.util.Arrays.asList(
                hint("food", "餐饮", "外卖", "星巴克", "便利店"),
                hint("shopping", "购物", "超市", "京东"),
                hint("transport", "交通", "打车", "地铁"));
    }

    @Test public void parseHintsSkipsBrokenEntries() {
        String raw = "[{\"id\":\"food\",\"name\":\"餐饮\",\"keywords\":[\"外卖\",\"咖啡\"]},"
                + "{\"id\":\"\",\"name\":\"坏的\"},{\"name\":\"也没 id\"}]";
        List<CategoryHints.Hint> hints = CategoryHints.parseHints(raw);
        assertEquals(1, hints.size());
        assertEquals("food", hints.get(0).id);
        assertEquals(2, hints.get(0).keywords.length);
        assertTrue(CategoryHints.parseHints("不是 JSON").isEmpty());
        assertTrue(CategoryHints.parseHints("").isEmpty());
    }

    @Test public void parseMemoryIgnoresEmptyValues() {
        Map<String, String> memory = CategoryHints.parseMemory("{\"星巴克\":\"food\",\"空\":\"\"}");
        assertEquals("food", memory.get("星巴克"));
        assertFalse(memory.containsKey("空"));
        assertTrue(CategoryHints.parseMemory("坏数据").isEmpty());
    }

    @Test public void nameOfReturnsNullForUnknownId() {
        assertEquals("餐饮", CategoryHints.nameOf(catalog(), "food"));
        assertNull(CategoryHints.nameOf(catalog(), "nope"));
        assertNull(CategoryHints.nameOf(catalog(), null));
    }

    // 商户名命中关键词（+3）压过整页文字（+1）
    @Test public void merchantMatchBeatsPageText() {
        CategoryHints.Guess guess = CategoryHints.best(catalog(), new HashMap<String, String>(),
                "美团外卖", "支付成功 外卖订单 打车");
        assertEquals("food", guess.id);
        // 商户命中 +3（同一个词不再叠加整页命中）
        assertEquals(3, guess.score);
    }

    // 用户给这家店选过的分类（+20）压过关键词
    @Test public void merchantMemoryWins() {
        Map<String, String> memory = new HashMap<>();
        memory.put("美团外卖", "shopping");
        CategoryHints.Guess guess = CategoryHints.best(catalog(), memory, "美团外卖", "支付成功 外卖");
        assertEquals("shopping", guess.id);
        assertTrue(guess.score >= 20);
    }

    @Test public void noClueReturnsNull() {
        assertNull(CategoryHints.best(catalog(), new HashMap<String, String>(), "", "今天天气不错"));
    }

    // 卡片备选：选中的排最前，其余按分数补足
    @Test public void suggestPutsSelectedFirst() {
        List<CategoryHints.Guess> picks = CategoryHints.suggest(catalog(), new HashMap<String, String>(),
                "美团外卖", "支付成功 外卖", "shopping", CategoryHints.DEFAULT_LIMIT);
        assertEquals("shopping", picks.get(0).id);
        assertEquals("购物", picks.get(0).name);
        assertEquals("food", picks.get(1).id);
        assertEquals(2, picks.size());
    }

    @Test public void suggestFallsBackToSelectedName() {
        List<CategoryHints.Guess> picks = CategoryHints.suggest(catalog(), new HashMap<String, String>(),
                "", "今天天气不错", "transport", CategoryHints.DEFAULT_LIMIT);
        assertEquals(1, picks.size());
        assertEquals("交通", picks.get(0).name);
        assertEquals(0, picks.get(0).score);
    }
}
