package com.todolistshare.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import com.todolistshare.app.R;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public class TodoWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext(), intent);
    }

    static class Factory implements RemoteViewsFactory {
        private final Context ctx;
        private final int wid;
        private final List<JSONObject> items = new ArrayList<>();
        private String currentProjectId = "";
        private boolean dark = false;
        private int fs = 13;

        Factory(Context c, Intent i) {
            ctx = c;
            wid = i.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID);
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            items.clear();
            dark = WidgetDataHelper.isDark(ctx, wid);
            fs = WidgetDataHelper.getFontSize(ctx, wid);
            int idx = WidgetDataHelper.getPageIndex(ctx, wid);

            // 캐시 우선: 이미 캐시된 데이터가 있으면 fetch 하지 않음
            JSONArray projects = WidgetDataHelper.getCachedJson(ctx, wid, "projects");
            if (projects.length() == 0) {
                projects = WidgetDataHelper.fetchProjects(ctx, wid);
            }
            if (projects.length() == 0) return;
            if (idx >= projects.length()) idx = 0;

            try {
                currentProjectId = projects.getJSONObject(idx).getString("id");
                // 캐시된 items 우선 사용
                JSONArray arr = WidgetDataHelper.getCachedJson(ctx, wid, "items");
                if (arr.length() == 0) {
                    arr = WidgetDataHelper.fetchItems(ctx, wid, currentProjectId);
                }
                // 미완료 우선 + 최신순 정렬 (캐시에서 읽어도 항상 적용)
                java.util.List<JSONObject> list = new java.util.ArrayList<>();
                for (int i = 0; i < arr.length(); i++) {
                    list.add(arr.getJSONObject(i));
                }
                list.sort((a, b) -> {
                    boolean ca = a.optBoolean("checked", false);
                    boolean cb = b.optBoolean("checked", false);
                    if (ca != cb) return ca ? 1 : -1; // 미완료 먼저
                    // 같은 그룹 내: id 역순 (Firestore 자동 ID는 시간 기반 → 최신순)
                    return b.optString("id").compareTo(a.optString("id"));
                });
                items.addAll(list);
            } catch (Exception ignored) {}
        }

        @Override
        public void onDestroy() { items.clear(); }

        @Override
        public int getCount() { return items.size(); }

        @Override
        public RemoteViews getViewAt(int pos) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(),
                R.layout.widget_todo_item);
            try {
                JSONObject item = items.get(pos);
                String itemId = item.getString("id");
                boolean checked = item.getBoolean("checked");
                rv.setTextViewText(R.id.item_checkbox, checked ? "☑" : "☐");
                rv.setTextViewText(R.id.item_title, item.getString("title"));

                int tc = dark ? Color.WHITE : Color.BLACK;
                int cc = dark ? Color.GRAY : Color.LTGRAY;
                rv.setTextColor(R.id.item_checkbox, tc);
                rv.setTextColor(R.id.item_title, checked ? cc : tc);
                rv.setTextViewTextSize(R.id.item_checkbox, android.util.TypedValue.COMPLEX_UNIT_SP, fs);
                rv.setTextViewTextSize(R.id.item_title, android.util.TypedValue.COMPLEX_UNIT_SP, fs);

                // 아이템 전체 클릭 → 앱 열기 (딥링크)
                Intent fillIntent = new Intent();
                fillIntent.putExtra("projectId", currentProjectId);
                fillIntent.putExtra("itemId", itemId);
                fillIntent.putExtra("action", "open");
                rv.setOnClickFillInIntent(R.id.item_title, fillIntent);

                // 체크박스 클릭 → 토글
                Intent toggleIntent = new Intent();
                toggleIntent.putExtra("projectId", currentProjectId);
                toggleIntent.putExtra("itemId", itemId);
                toggleIntent.putExtra("checked", !checked);
                toggleIntent.putExtra("action", "toggle");
                rv.setOnClickFillInIntent(R.id.item_checkbox, toggleIntent);

            } catch (Exception ignored) {}
            return rv;
        }

        @Override
        public RemoteViews getLoadingView() { return null; }

        @Override
        public int getViewTypeCount() { return 1; }

        @Override
        public long getItemId(int pos) { return pos; }

        @Override
        public boolean hasStableIds() { return false; }
    }
}
