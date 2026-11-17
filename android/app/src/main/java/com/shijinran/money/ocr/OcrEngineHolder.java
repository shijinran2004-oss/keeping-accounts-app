package com.shijinran.money.ocr;

import android.content.Context;
import android.graphics.Bitmap;

import com.benjaminwan.ocrlibrary.OcrEngine;
import com.benjaminwan.ocrlibrary.OcrResult;
import com.benjaminwan.ocrlibrary.Point;
import com.benjaminwan.ocrlibrary.TextBlock;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * 全进程共用一个 OcrEngine。
 *
 * RapidOcr 的 native 层不是多实例安全的：同一进程里创建第二个 OcrEngine 之后，
 * 识别结果会变成一堆字形相近的乱码（行数、字数都对得上，但每个字都错）。
 * 截图监听服务和前端插件跑在同一个进程里，所以必须共用一份引擎；
 * detect 内部还有共享缓冲区，并发调用也要串行。
 */
public final class OcrEngineHolder {

    private static final Object LOCK = new Object();
    private static OcrEngine engine;

    private OcrEngineHolder() {}

    /** 提前把模型读进内存；已经初始化过就直接返回。 */
    public static void warmUp(Context context) {
        engine(context);
    }

    /** 串行识别：同一个引擎实例不能同时 detect。 */
    public static OcrResult detect(Context context, Bitmap input, Bitmap box, int maxSide) {
        synchronized (LOCK) {
            return engine(context).detect(input, box, maxSide);
        }
    }

    /**
     * 按版面顺序排好的文字块。
     *
     * RapidOCR 返回的 TextBlock 顺序并不可靠（同一张图两次识别顺序可能不同），
     * 而前端解析要靠「相邻行」拼金额（「实付」一行、「48.00」下一行）。
     * 所以统一在这里排：先按行（中心 y 相近算同一行），再按行内从左到右。
     * 插件和截图服务都走这一个方法，顺序只有一套逻辑。
     */
    public static List<TextBlock> orderedBlocks(OcrResult result) {
        List<TextBlock> blocks = new ArrayList<>();
        if (result == null || result.getTextBlocks() == null) return blocks;
        for (TextBlock block : result.getTextBlocks()) {
            if (block != null) blocks.add(block);
        }
        Collections.sort(blocks, new Comparator<TextBlock>() {
            @Override
            public int compare(TextBlock a, TextBlock b) {
                int rowA = centerY(a) / 24;
                int rowB = centerY(b) / 24;
                if (rowA != rowB) return Integer.compare(rowA, rowB);
                return Integer.compare(centerX(a), centerX(b));
            }
        });
        return blocks;
    }

    /** 识别结果按版面顺序拼成多行文本；空行跳过。 */
    public static String toText(OcrResult result) {
        StringBuilder text = new StringBuilder();
        for (TextBlock block : orderedBlocks(result)) {
            String line = block.getText() == null ? "" : block.getText().trim();
            if (line.isEmpty()) continue;
            if (text.length() > 0) text.append('\n');
            text.append(line);
        }
        return text.toString();
    }

/**
     * 按版面顺序排好的行，带坐标与置信度。
     *
     * 规则引擎靠 bbox 判断「这行是不是标题下面的大金额」：字号 = 行高、
     * 位置靠上、水平居中。纯文本的 toText 仍然保留给前端解析用。
     */
    public static List<OcrLine> lines(OcrResult result) {
        List<OcrLine> out = new ArrayList<>();
        for (TextBlock block : orderedBlocks(result)) {
            String line = block.getText() == null ? "" : block.getText().trim();
            if (line.isEmpty()) continue;
            List<Point> points = block.getBoxPoint();
            if (points == null || points.isEmpty()) {
                out.add(new OcrLine(line, 0, 0, 0, 0, scoreOf(block)));
                continue;
            }
            int left = Integer.MAX_VALUE;
            int top = Integer.MAX_VALUE;
            int right = Integer.MIN_VALUE;
            int bottom = Integer.MIN_VALUE;
            for (Point point : points) {
                left = Math.min(left, point.getX());
                top = Math.min(top, point.getY());
                right = Math.max(right, point.getX());
                bottom = Math.max(bottom, point.getY());
            }
            out.add(new OcrLine(line, left, top, right, bottom, scoreOf(block)));
        }
        return out;
    }

    /** 这一行的识别置信度：字符置信度的平均值（TextBlock 只有 boxScore 和 charScores，没有整行分数）。 */
    private static float scoreOf(TextBlock block) {
        float[] chars = block.getCharScores();
        if (chars != null && chars.length > 0) {
            float sum = 0;
            for (float c : chars) sum += c;
            return sum / chars.length;
        }
        return block.getBoxScore();
    }

    private static int centerY(TextBlock block) {
        return average(block, 1);
    }

    private static int centerX(TextBlock block) {
        return average(block, 0);
    }

    private static int average(TextBlock block, int axis) {
        List<Point> points = block.getBoxPoint();
        if (points == null || points.isEmpty()) return 0;
        int sum = 0;
        for (Point point : points) {
            sum += axis == 0 ? point.getX() : point.getY();
        }
        return sum / points.size();
    }

    private static OcrEngine engine(Context context) {
        synchronized (LOCK) {
            if (engine == null) {
                OcrEngine created = new OcrEngine(context.getApplicationContext());
                created.setPadding(50);
                created.setBoxScoreThresh(0.5f);
                created.setBoxThresh(0.3f);
                created.setUnClipRatio(1.6f);
                created.setDoAngle(true);
                created.setMostAngle(true);
                engine = created;
            }
            return engine;
        }
    }
}
