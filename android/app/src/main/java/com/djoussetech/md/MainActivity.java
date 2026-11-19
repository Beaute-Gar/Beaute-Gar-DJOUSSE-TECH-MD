package com.djoussetech.md;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BotServicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}