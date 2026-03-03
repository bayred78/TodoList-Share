package com.todolistshare.app.widget;

import androidx.appcompat.app.AppCompatActivity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.widget.Button;
import android.widget.RadioGroup;
import android.widget.SeekBar;
import android.widget.TextView;
import com.todolistshare.app.R;
import org.json.JSONArray;

public class TodoWidgetConfigActivity extends AppCompatActivity {
    private int wid = AppWidgetManager.INVALID_APPWIDGET_ID;
    private boolean isDark = false;
    private int opacity = 100;
    private int fontSize = 13;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        setResult(RESULT_CANCELED);
        setContentView(R.layout.widget_config_activity);

        Intent intent = getIntent();
        if (intent.getExtras() != null)
            wid = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, wid);
        if (wid == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        RadioGroup tg = findViewById(R.id.theme_group);
        SeekBar sb = findViewById(R.id.opacity_seekbar);
        TextView ol = findViewById(R.id.opacity_label);
        SeekBar fs = findViewById(R.id.fontsize_seekbar);
        TextView fl = findViewById(R.id.fontsize_label);
        TextView pv = findViewById(R.id.preview_text);
        Button save = findViewById(R.id.btn_save);

        // 저장된 설정값 로드
        isDark = WidgetDataHelper.isDark(this, wid);
        opacity = WidgetDataHelper.getOpacity(this, wid);
        fontSize = WidgetDataHelper.getFontSize(this, wid);

        // UI에 반영
        tg.check(isDark ? R.id.theme_dark : R.id.theme_light);
        sb.setProgress(opacity);
        ol.setText(opacity + "%");
        fs.setProgress(fontSize);
        fl.setText(fontSize + "sp");

        tg.setOnCheckedChangeListener((g, id) -> {
            isDark = id == R.id.theme_dark;
            preview(pv);
        });

        sb.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar b, int p, boolean u) {
                opacity = p;
                ol.setText(p + "%");
                preview(pv);
            }
            @Override public void onStartTrackingTouch(SeekBar b) {}
            @Override public void onStopTrackingTouch(SeekBar b) {}
        });

        fs.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar b, int p, boolean u) {
                fontSize = p;
                fl.setText(p + "sp");
                pv.setTextSize(p);
            }
            @Override public void onStartTrackingTouch(SeekBar b) {}
            @Override public void onStopTrackingTouch(SeekBar b) {}
        });

        save.setOnClickListener(v -> {
            WidgetDataHelper.saveConfig(this, wid, isDark, opacity, fontSize);

            // 즉시 초기 상태로 위젯 렌더링
            AppWidgetManager mgr = AppWidgetManager.getInstance(this);
            TodoWidgetProvider.updateWidget(this, mgr, wid);

            // 백그라운드에서 데이터 로드 후 재갱신
            final Context appCtx = getApplicationContext();
            new Thread(() -> {
                JSONArray p = WidgetDataHelper.fetchProjects(appCtx, wid);
                if (p.length() > 0) {
                    try {
                        WidgetDataHelper.fetchItems(appCtx, wid,
                            p.getJSONObject(0).getString("id"));
                    } catch (Exception ignored) {}
                }
                AppWidgetManager mgr2 = AppWidgetManager.getInstance(appCtx);
                mgr2.notifyAppWidgetViewDataChanged(wid, R.id.widget_list);
                TodoWidgetProvider.updateWidget(appCtx, mgr2, wid);
            }).start();

            Intent r = new Intent();
            r.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, wid);
            setResult(RESULT_OK, r);
            finish();
        });

        preview(pv);
    }

    private void preview(TextView pv) {
        int a = (int) (opacity * 2.55f);
        pv.setBackgroundColor(isDark
            ? Color.argb(a, 45, 52, 54) : Color.argb(a, 255, 255, 255));
        pv.setTextColor(isDark ? Color.WHITE : Color.BLACK);
        pv.setText(isDark ? "다크 미리보기" : "라이트 미리보기");
        pv.setTextSize(fontSize);
    }
}
