package com.axon.phase0poc;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundJobsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
