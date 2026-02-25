package com.todolistshare.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

@CapacitorPlugin(name = "FileSaver")
public class FileSaver extends Plugin {

    @PluginMethod
    public void saveAs(PluginCall call) {
        String data = call.getString("data"); // base64
        String name = call.getString("name"); // filename
        String mimeType = call.getString("mimeType", "*/*");

        if (data == null || name == null) {
            call.reject("Data and filename are required.");
            return;
        }

        call.setKeepAlive(true); // Callback 유지를 위해 설정

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, name);

        // 사용자가 파일 저장 창에서 결과를 선택하면 saveAsResult로 콜백
        startActivityForResult(call, intent, "saveAsResult");
    }

    @ActivityCallback
    private void saveAsResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_OK) {
            Intent data = result.getData();
            if (data != null && data.getData() != null) {
                Uri uri = data.getData();
                String base64Data = call.getString("data");

                // Base64 디코딩 및 URI에 쓰기
                byte[] decodedBytes = Base64.decode(base64Data, Base64.DEFAULT);
                try {
                    OutputStream outputStream = getContext().getContentResolver().openOutputStream(uri);
                    if (outputStream != null) {
                        outputStream.write(decodedBytes);
                        outputStream.close();
                        
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        call.resolve(ret);
                    } else {
                        call.reject("Failed to open output stream");
                    }
                } catch (Exception e) {
                    call.reject("Error saving file: " + e.getMessage());
                }
            } else {
                call.reject("No file selected.");
            }
        } else {
            call.reject("User cancelled the save dialog.");
        }
    }
}
