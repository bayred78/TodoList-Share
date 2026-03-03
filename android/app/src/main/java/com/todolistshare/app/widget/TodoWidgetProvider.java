package com.todolistshare.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.util.Log;
import android.widget.RemoteViews;
import com.todolistshare.app.MainActivity;
import com.todolistshare.app.R;
import org.json.JSONArray;

public class TodoWidgetProvider extends AppWidgetProvider {
    private static final String TAG = "AppWidgetProvider";
    static final String ACTION_PREV = "com.todolistshare.WIDGET_PREV";
    static final String ACTION_NEXT = "com.todolistshare.WIDGET_NEXT";
    static final String ACTION_REFRESH = "com.todolistshare.WIDGET_REFRESH";
    static final String ACTION_LIST_CLICK = "com.todolistshare.WIDGET_LIST_CLICK";
    static final String EXTRA_WID = "extra_wid";

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) {
            // 시간대별 갱신 주기: 낮 30분, 새벽 2시간
            if (WidgetDataHelper.shouldFetch(c, id)) {
                final int wid = id;
                new Thread(() -> {
                    WidgetDataHelper.fetchProjects(c, wid);
                    int idx = WidgetDataHelper.getPageIndex(c, wid);
                    JSONArray ps = WidgetDataHelper.getCachedJson(c, wid, "projects");
                    if (idx < ps.length()) {
                        try {
                            String pid = ps.getJSONObject(idx).getString("id");
                            WidgetDataHelper.fetchItems(c, wid, pid);
                        } catch (Exception ignored) {}
                    }
                    AppWidgetManager mgr = AppWidgetManager.getInstance(c);
                    mgr.notifyAppWidgetViewDataChanged(wid, R.id.widget_list);
                    updateWidget(c, mgr, wid);
                }).start();
            } else {
                updateWidget(c, m, id);
            }
        }
    }

    @Override
    public void onDeleted(Context c, int[] ids) {
        for (int id : ids) WidgetDataHelper.deleteConfig(c, id);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        String action = intent.getAction();
        if (action == null) return;

        int wid = intent.getIntExtra(EXTRA_WID,
            AppWidgetManager.INVALID_APPWIDGET_ID);
        if (wid == AppWidgetManager.INVALID_APPWIDGET_ID) return;

        Log.d(TAG, "onReceive:" + action);

        if (ACTION_PREV.equals(action) || ACTION_NEXT.equals(action)) {
            int idx = WidgetDataHelper.getPageIndex(c, wid);
            JSONArray projects = WidgetDataHelper.getCachedJson(c, wid, "projects");
            int count = projects.length();
            if (count > 0) {
                idx = ACTION_PREV.equals(action)
                    ? (idx - 1 + count) % count
                    : (idx + 1) % count;
                WidgetDataHelper.setPageIndex(c, wid, idx);
            }
            // 헤더 즉시 갱신
            AppWidgetManager mgrImm = AppWidgetManager.getInstance(c);
            updateWidget(c, mgrImm, wid);

            // 새 페이지의 items 백그라운드 fetch 후 리스트 갱신
            final int newIdx = idx;
            final JSONArray ps = projects;
            new Thread(() -> {
                try {
                    if (ps.length() > 0 && newIdx < ps.length()) {
                        String pid = ps.getJSONObject(newIdx).getString("id");
                        WidgetDataHelper.fetchItems(c, wid, pid);
                    }
                } catch (Exception ignored) {}
                AppWidgetManager mgr = AppWidgetManager.getInstance(c);
                mgr.notifyAppWidgetViewDataChanged(wid, R.id.widget_list);
                updateWidget(c, mgr, wid);
            }).start();

        } else if (ACTION_REFRESH.equals(action)) {
            // 로딩 표시
            AppWidgetManager mgrLoading = AppWidgetManager.getInstance(c);
            RemoteViews loadingView = new RemoteViews(c.getPackageName(), R.layout.widget_todo);
            loadingView.setTextViewText(R.id.btn_refresh, "⏳");
            mgrLoading.partiallyUpdateAppWidget(wid, loadingView);

            new Thread(() -> {
                WidgetDataHelper.fetchProjects(c, wid);
                int idx = WidgetDataHelper.getPageIndex(c, wid);
                JSONArray ps = WidgetDataHelper.getCachedJson(c, wid, "projects");
                if (idx < ps.length()) {
                    try {
                        String pid = ps.getJSONObject(idx).getString("id");
                        WidgetDataHelper.fetchItems(c, wid, pid);
                    } catch (Exception ignored) {}
                }
                AppWidgetManager mgr = AppWidgetManager.getInstance(c);
                mgr.notifyAppWidgetViewDataChanged(wid, R.id.widget_list);
                updateWidget(c, mgr, wid);
            }).start();

        } else if (ACTION_LIST_CLICK.equals(action)) {
            String itemAction = intent.getStringExtra("action");
            String projectId = intent.getStringExtra("projectId");
            String itemId = intent.getStringExtra("itemId");

            if ("toggle".equals(itemAction) && projectId != null && itemId != null) {
                boolean newChecked = intent.getBooleanExtra("checked", false);
                // 캐시 즉시 갱신
                WidgetDataHelper.toggleItemCache(c, wid, itemId, newChecked);
                // Firestore 업데이트 (백그라운드)
                new Thread(() -> WidgetDataHelper.toggleItem(c, wid, projectId, itemId, newChecked)).start();
                // UI 즉시 갱신
                AppWidgetManager mgr = AppWidgetManager.getInstance(c);
                mgr.notifyAppWidgetViewDataChanged(wid, R.id.widget_list);

            } else if ("open".equals(itemAction)) {
                // 앱 열기 (딥링크)
                Intent appIntent = new Intent(c, MainActivity.class);
                appIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                if (projectId != null) {
                    appIntent.putExtra("projectId", projectId);
                }
                if (itemId != null) {
                    appIntent.putExtra("itemId", itemId);
                }
                c.startActivity(appIntent);
            }
        }
    }

    static void updateWidget(Context c, AppWidgetManager mgr, int wid) {
        boolean dark = WidgetDataHelper.isDark(c, wid);
        int opacity = WidgetDataHelper.getOpacity(c, wid);
        int pageIdx = WidgetDataHelper.getPageIndex(c, wid);

        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_todo);

        // 배경색 (투명도)
        int alpha = (int) (opacity * 2.55f);
        int bgColor = dark
            ? Color.argb(alpha, 45, 52, 54)
            : Color.argb(alpha, 255, 255, 255);
        v.setInt(R.id.widget_root, "setBackgroundColor", bgColor);

        // 텍스트 색상
        int tc = dark ? Color.WHITE : Color.BLACK;
        v.setTextColor(R.id.widget_page_name, tc);
        v.setTextColor(R.id.btn_prev_page, tc);
        v.setTextColor(R.id.btn_next_page, tc);
        v.setTextColor(R.id.btn_refresh, tc);

        // 글씨 크기
        int fs = WidgetDataHelper.getFontSize(c, wid);
        v.setTextViewTextSize(R.id.widget_page_name,
            android.util.TypedValue.COMPLEX_UNIT_SP, fs);

        // 새로고침 아이콘 복원
        v.setTextViewText(R.id.btn_refresh, "⟳");

        // 페이지명
        JSONArray projects = WidgetDataHelper.getCachedJson(c, wid, "projects");
        String currentProjectId = null;
        if (projects.length() > 0 && pageIdx < projects.length()) {
            try {
                currentProjectId = projects.getJSONObject(pageIdx).getString("id");
                String name = projects.getJSONObject(pageIdx).getString("name");
                v.setTextViewText(R.id.widget_page_name,
                    name + " (" + (pageIdx + 1) + "/" + projects.length() + ")");
            } catch (Exception e) {
                v.setTextViewText(R.id.widget_page_name, "로딩 중...");
            }
        } else {
            v.setTextViewText(R.id.widget_page_name, "페이지 없음");
        }

        // 페이지 제목 클릭 → 해당 프로젝트 열기
        if (currentProjectId != null) {
            Intent pageIntent = new Intent(c, MainActivity.class);
            pageIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            pageIntent.putExtra("projectId", currentProjectId);
            v.setOnClickPendingIntent(R.id.widget_page_name,
                PendingIntent.getActivity(c, wid + "page".hashCode(), pageIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }

        // ListView 서비스
        Intent si = new Intent(c, TodoWidgetService.class);
        si.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, wid);
        si.setData(Uri.parse(si.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.widget_list, si);
        v.setEmptyView(R.id.widget_list, R.id.widget_empty);

        // 리스트 아이템 클릭 → 브로드캐스트 (토글 or 앱열기)
        Intent listClickIntent = new Intent(c, TodoWidgetProvider.class);
        listClickIntent.setAction(ACTION_LIST_CLICK);
        listClickIntent.putExtra(EXTRA_WID, wid);
        v.setPendingIntentTemplate(R.id.widget_list,
            PendingIntent.getBroadcast(c, wid, listClickIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE));

        // 버튼
        v.setOnClickPendingIntent(R.id.btn_prev_page, makePi(c, wid, ACTION_PREV));
        v.setOnClickPendingIntent(R.id.btn_next_page, makePi(c, wid, ACTION_NEXT));
        v.setOnClickPendingIntent(R.id.btn_refresh, makePi(c, wid, ACTION_REFRESH));

        mgr.updateAppWidget(wid, v);
    }

    private static PendingIntent makePi(Context c, int wid, String action) {
        Intent i = new Intent(c, TodoWidgetProvider.class);
        i.setAction(action);
        i.putExtra(EXTRA_WID, wid);
        return PendingIntent.getBroadcast(c, wid + action.hashCode(), i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
