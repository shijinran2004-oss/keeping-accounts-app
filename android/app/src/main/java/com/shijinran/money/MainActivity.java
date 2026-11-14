package com.shijinran.money;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.shijinran.money.ocr.OcrPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OcrPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
