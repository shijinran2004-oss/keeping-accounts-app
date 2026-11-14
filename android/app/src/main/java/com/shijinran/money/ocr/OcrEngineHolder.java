package com.shijinran.money.ocr;

import android.content.Context;
import android.graphics.Bitmap;

import com.benjaminwan.ocrlibrary.OcrEngine;
import com.benjaminwan.ocrlibrary.OcrResult;

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
