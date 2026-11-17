package com.shijinran.money.ocr;

/**
 * 一行 OCR 文字 + 版面坐标（像素）。
 *
 * RapidOCR 原本就给了每个文字块的四角坐标和置信度，但以前只拼成纯文本，
 * 坐标被丢掉了。规则引擎需要「这一行是不是标题下面那个大金额」这类判断，
 * 所以把一行做成纯数据对象传进去；不依赖 Android，单测可以直接构造。
 */
public final class OcrLine {

    public final String text;
    public final int left;
    public final int top;
    public final int right;
    public final int bottom;
    public final float score;

    public OcrLine(String text, int left, int top, int right, int bottom, float score) {
        this.text = text == null ? "" : text;
        this.left = left;
        this.top = top;
        this.right = right;
        this.bottom = bottom;
        this.score = score;
    }

    public int width() {
        return right - left;
    }

    public int height() {
        return bottom - top;
    }

    public int centerX() {
        return (left + right) / 2;
    }

    public int centerY() {
        return (top + bottom) / 2;
    }
}
