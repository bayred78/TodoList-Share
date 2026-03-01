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

        if (name == null) {
            call.reject("Filename is required.");
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
                Uri destUri = data.getData();
                String srcPath = call.getString("srcPath");

                if (srcPath == null) {
                    call.reject("Source path is missing.");
                    return;
                }

                try {
                    java.io.File srcFile = new java.io.File(srcPath);
                    if (!srcFile.exists()) {
                        call.reject("Source file does not exist.");
                        return;
                    }

                    try (java.io.InputStream inputStream = new java.io.FileInputStream(srcFile);
                         OutputStream outputStream = getContext().getContentResolver().openOutputStream(destUri)) {

                    if (outputStream != null) {
                        byte[] buffer = new byte[8192];
                        int bytesRead;
                        while ((bytesRead = inputStream.read(buffer)) != -1) {
                            outputStream.write(buffer, 0, bytesRead);
                        }

                        // Copy complete, optionally delete temp file
                        srcFile.delete();

                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        call.resolve(ret);
                    } else {
                        call.reject("Failed to open output stream");
                    }
                    } // 내부 try-with-resources 닫기
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
