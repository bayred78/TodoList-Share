package com.todolistshare.app.widget;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.QueryDocumentSnapshot;
import com.google.firebase.firestore.QuerySnapshot;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Calendar;
import java.util.concurrent.TimeUnit;

public class WidgetDataHelper {
    private static final String TAG = "WidgetData";
    private static final String PREFS = "TodoWidgetPrefs";

    private static String key(int wid, String k) {
        return "w_" + wid + "_" + k;
    }

    // --- 설정 ---

    public static void saveConfig(Context c, int wid, boolean dark, int opacity, int fontSize) {
        prefs(c).edit()
            .putBoolean(key(wid, "dark"), dark)
            .putInt(key(wid, "opacity"), opacity)
            .putInt(key(wid, "fontSize"), fontSize)
            .putInt(key(wid, "pageIdx"), 0)
            .apply();
    }

    public static boolean isDark(Context c, int wid) {
        return prefs(c).getBoolean(key(wid, "dark"), false);
    }

    public static int getOpacity(Context c, int wid) {
        return prefs(c).getInt(key(wid, "opacity"), 100);
    }

    public static int getFontSize(Context c, int wid) {
        return prefs(c).getInt(key(wid, "fontSize"), 13);
    }

    public static int getPageIndex(Context c, int wid) {
        return prefs(c).getInt(key(wid, "pageIdx"), 0);
    }

    public static void setPageIndex(Context c, int wid, int idx) {
        prefs(c).edit().putInt(key(wid, "pageIdx"), idx).apply();
    }

    public static void deleteConfig(Context c, int wid) {
        SharedPreferences.Editor e = prefs(c).edit();
        for (String s : new String[]{"dark", "opacity", "fontSize", "pageIdx", "projects", "items", "lastFetch"}) {
            e.remove(key(wid, s));
        }
        e.apply();
    }

    // --- 갱신 주기 관리 ---

    /**
     * Firestore 데이터를 새로 가져와야 하는지 판단.
     * - 낮 (07:00~23:00): 30분 간격
     * - 밤 (23:00~07:00): 2시간 간격
     */
    public static boolean shouldFetch(Context c, int wid) {
        long last = prefs(c).getLong(key(wid, "lastFetch"), 0);
        long now = System.currentTimeMillis();
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);

        long interval;
        if (hour >= 23 || hour < 7) {
            interval = 2 * 60 * 60 * 1000L; // 2시간
        } else {
            interval = 30 * 60 * 1000L; // 30분
        }

        return (now - last) >= interval;
    }

    private static void setLastFetchTime(Context c, int wid) {
        prefs(c).edit().putLong(key(wid, "lastFetch"), System.currentTimeMillis()).apply();
    }

    // --- Firestore (백그라운드 스레드에서만 호출) ---

    public static JSONArray fetchProjects(Context c, int wid) {
        try {
            FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
            if (user == null) return new JSONArray();

            QuerySnapshot snap = Tasks.await(
                FirebaseFirestore.getInstance()
                    .collection("projects")
                    .whereArrayContains("memberUIDs", user.getUid())
                    .get(),
                15, TimeUnit.SECONDS);

            JSONArray arr = new JSONArray();
            for (QueryDocumentSnapshot doc : snap) {
                JSONObject o = new JSONObject();
                o.put("id", doc.getId());
                o.put("name", doc.getString("name") != null ? doc.getString("name") : "");
                arr.put(o);
            }
            prefs(c).edit().putString(key(wid, "projects"), arr.toString()).apply();
            setLastFetchTime(c, wid);
            return arr;
        } catch (Exception e) {
            Log.e(TAG, "fetchProjects 실패", e);
            return getCachedJson(c, wid, "projects");
        }
    }

    public static JSONArray fetchItems(Context c, int wid, String projectId) {
        try {
            QuerySnapshot snap = Tasks.await(
                FirebaseFirestore.getInstance()
                    .collection("projects").document(projectId)
                    .collection("items")
                    .whereEqualTo("deleted", false)
                    .get(),
                15, TimeUnit.SECONDS);

            // 정렬: 미완료(최신순) → 완료(최신순)
            java.util.List<QueryDocumentSnapshot> sorted = new java.util.ArrayList<>();
            for (QueryDocumentSnapshot doc : snap) {
                sorted.add(doc);
            }
            sorted.sort((a, b) -> {
                boolean ca = Boolean.TRUE.equals(a.getBoolean("checked"));
                boolean cb = Boolean.TRUE.equals(b.getBoolean("checked"));
                if (ca != cb) return ca ? 1 : -1; // 미완료 먼저
                // 같은 그룹 내: order 역순 (최신순)
                Long oa = a.getLong("order");
                Long ob = b.getLong("order");
                return Long.compare(ob != null ? ob : 0, oa != null ? oa : 0);
            });

            JSONArray arr = new JSONArray();
            for (QueryDocumentSnapshot doc : sorted) {
                JSONObject o = new JSONObject();
                o.put("id", doc.getId());
                o.put("title", doc.getString("title") != null ? doc.getString("title") : "");
                o.put("checked", Boolean.TRUE.equals(doc.getBoolean("checked")));
                arr.put(o);
            }
            prefs(c).edit().putString(key(wid, "items"), arr.toString()).apply();
            return arr;
        } catch (Exception e) {
            Log.e(TAG, "fetchItems 실패: " + e.getMessage(), e);
            return getCachedJson(c, wid, "items");
        }
    }

    // package-private: TodoWidgetProvider에서도 호출
    static JSONArray getCachedJson(Context c, int wid, String field) {
        try {
            return new JSONArray(prefs(c).getString(key(wid, field), "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    // --- 체크박스 토글 ---

    public static void toggleItem(Context c, int wid, String projectId, String itemId, boolean newChecked) {
        try {
            FirebaseFirestore.getInstance()
                .collection("projects").document(projectId)
                .collection("items").document(itemId)
                .update("checked", newChecked);
        } catch (Exception e) {
            Log.e(TAG, "toggleItem 실패", e);
        }
    }

    public static void toggleItemCache(Context c, int wid, String itemId, boolean newChecked) {
        try {
            JSONArray items = getCachedJson(c, wid, "items");
            for (int i = 0; i < items.length(); i++) {
                JSONObject o = items.getJSONObject(i);
                if (itemId.equals(o.getString("id"))) {
                    o.put("checked", newChecked);
                    break;
                }
            }
            prefs(c).edit().putString(key(wid, "items"), items.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "toggleItemCache 실패", e);
        }
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
