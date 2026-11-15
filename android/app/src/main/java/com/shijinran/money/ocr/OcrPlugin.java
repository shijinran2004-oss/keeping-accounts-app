package com.shijinran.money.ocr;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.util.Base64;

import com.benjaminwan.ocrlibrary.OcrResult;
import com.benjaminwan.ocrlibrary.Point;
import com.benjaminwan.ocrlibrary.TextBlock;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 端上小票识别：PP-OCR（RapidOcrAndroidOnnx 的 AAR）包一层 Capacitor 接口。
 * 只负责「图片 -> 文本行」，金额/日期/商户的抽取放在前端 src/lib/ocr 里做。
 */
@CapacitorPlugin(name = "Ocr")
public class OcrPlugin extends Plugin {

    private static final int MAX_SIDE_DEFAULT = 1600;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    /** 提前把模型读进内存，首张图就不用等加载。 */
    @PluginMethod
    public void warmUp(PluginCall call) {
        worker.execute(() -> {
            try {
                long t0 = System.currentTimeMillis();
                OcrEngineHolder.warmUp(getContext());
                JSObject ret = new JSObject();
                ret.put("ready", true);
                ret.put("ms", System.currentTimeMillis() - t0);
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject(friendly(t), "ocr_init_failed");
            }
        });
    }

    @PluginMethod
    public void recognize(PluginCall call) {
        String dataUrl = call.getString("dataUrl");
        if (dataUrl == null || dataUrl.isEmpty()) {
            call.reject("没有拿到图片", "ocr_no_image");
            return;
        }
        Integer maxSideArg = call.getInt("maxSide", MAX_SIDE_DEFAULT);
        final int maxSide = maxSideArg == null ? MAX_SIDE_DEFAULT : maxSideArg;

        worker.execute(() -> {
            try {
                Bitmap source = decode(dataUrl);
                if (source == null) {
                    call.reject("图片无法解码", "ocr_decode_failed");
                    return;
                }
                Bitmap input = shrink(source, maxSide);
                long t0 = System.currentTimeMillis();
                Bitmap box = Bitmap.createBitmap(input.getWidth(), input.getHeight(), Bitmap.Config.ARGB_8888);
                new Canvas(box).drawColor(0x00000000);
                OcrResult result = OcrEngineHolder.detect(getContext(), input, box, maxSide);
                long ms = System.currentTimeMillis() - t0;

                // 顺序统一由 OcrEngineHolder 负责：RapidOCR 原始块顺序不可靠
                List<TextBlock> blocks = OcrEngineHolder.orderedBlocks(result);

                JSArray lines = new JSArray();
                StringBuilder all = new StringBuilder();
                for (TextBlock block : blocks) {
                    String text = block.getText() == null ? "" : block.getText().trim();
                    if (text.isEmpty()) continue;
                    JSObject line = new JSObject();
                    line.put("text", text);
                    line.put("score", (double) block.getBoxScore());
                    JSArray boxPoints = new JSArray();
                    if (block.getBoxPoint() != null) {
                        for (Point p : block.getBoxPoint()) {
                            JSArray xy = new JSArray();
                            xy.put(p.getX());
                            xy.put(p.getY());
                            boxPoints.put(xy);
                        }
                    }
                    line.put("box", boxPoints);
                    lines.put(line);
                    if (all.length() > 0) all.append("\n");
                    all.append(text);
                }

                JSObject ret = new JSObject();
                ret.put("lines", lines);
                ret.put("text", all.toString());
                ret.put("width", input.getWidth());
                ret.put("height", input.getHeight());
                ret.put("ms", ms);
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject(friendly(t), "ocr_failed");
            }
        });
    }

    private static Bitmap decode(String dataUrl) {
        String base64 = dataUrl;
        int comma = dataUrl.indexOf(',');
        if (comma >= 0) base64 = dataUrl.substring(comma + 1);
        byte[] bytes;
        try {
            bytes = Base64.decode(base64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            return null;
        }
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        int sample = 1;
        int longest = Math.max(bounds.outWidth, bounds.outHeight);
        while (longest / (sample * 2) >= 2000) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
    }

    private static Bitmap shrink(Bitmap source, int maxSide) {
        int longest = Math.max(source.getWidth(), source.getHeight());
        if (longest <= maxSide) return source;
        float scale = maxSide / (float) longest;
        int w = Math.max(1, Math.round(source.getWidth() * scale));
        int h = Math.max(1, Math.round(source.getHeight() * scale));
        Bitmap scaled = Bitmap.createScaledBitmap(source, w, h, true);
        if (scaled != source) source.recycle();
        return scaled;
    }

    private static String friendly(Throwable t) {
        String msg = t.getMessage();
        if (msg == null || msg.isEmpty()) msg = t.getClass().getSimpleName();
        if (t instanceof OutOfMemoryError) return "图片太大，内存不够";
        return "识别失败：" + msg;
    }
}
