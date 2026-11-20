package com.shijinran.money;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.shijinran.money.capture.CapturePlugin;
import com.shijinran.money.ocr.OcrPlugin;

public class MainActivity extends BridgeActivity {
    /** 桌面快捷方式 / 小组件「记一笔」用的启动动作 */
    public static final String ACTION_ADD = "com.shijinran.money.action.ADD";

    /** 网页还没起来时先存着，被 takePendingAction() 取走后清空 */
    private static volatile String pendingAction;

    /** 取走一次启动动作，只会返回一次 */
    public static String takePendingAction() {
        String action = pendingAction;
        pendingAction = null;
        return action;
    }

    private void readIntent(Intent intent) {
        if (intent == null) return;
        if (ACTION_ADD.equals(intent.getAction())) {
            pendingAction = "add";
            // App 已经开着时没有冷启动取用流程，直接喊网页开弹层
            CapturePlugin.pingLaunch();
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OcrPlugin.class);
        registerPlugin(CapturePlugin.class);
        readIntent(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        readIntent(intent);
    }
}
