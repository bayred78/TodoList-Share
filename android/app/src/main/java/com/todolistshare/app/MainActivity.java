package com.todolistshare.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FileSaver.class);
        super.onCreate(savedInstanceState);
        handleWidgetDeepLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleWidgetDeepLink(intent);
    }

    private void handleWidgetDeepLink(Intent intent) {
        if (intent == null) return;
        String projectId = intent.getStringExtra("projectId");
        if (projectId == null) return;

        String itemId = intent.getStringExtra("itemId");
        String url;
        if (itemId != null) {
            url = "/project/" + projectId + "?itemId=" + itemId;
        } else {
            url = "/project/" + projectId;
        }

        // WebView가 준비된 후 네비게이션
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().loadUrl("javascript:window.location.hash='';window.history.pushState(null,'','" + url + "');window.dispatchEvent(new PopStateEvent('popstate'));");
                }
            });
        }
    }
}
