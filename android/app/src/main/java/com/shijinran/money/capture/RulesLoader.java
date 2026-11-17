package com.shijinran.money.capture;

import android.content.Context;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * 把打包在 assets/rules/capture-rules.json 里的规则表读给 ShotRules。
 *
 * 规则表的唯一来源是仓库里的 src/lib/ocr/capture-rules.json，构建时同步到 assets；
 * 读失败就保持「未装载」状态，ShotRules 会一律不弹卡（宁可漏记，也不拿坏规则乱弹）。
 */
final class RulesLoader {

    private static final String TAG = "RulesLoader";
    private static final String ASSET = "rules/capture-rules.json";
    private static volatile boolean loaded;

    private RulesLoader() {}

    static void ensure(Context context) {
        if (loaded) return;
        synchronized (RulesLoader.class) {
            if (loaded) return;
            try (InputStream in = context.getAssets().open(ASSET)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int n;
                while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
                ShotRules.init(new JSONObject(out.toString("UTF-8")));
                loaded = true;
                Log.d(TAG, "capture rules loaded");
            } catch (Throwable t) {
                Log.w(TAG, "capture rules load failed", t);
            }
        }
    }
}
