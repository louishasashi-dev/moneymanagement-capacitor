import fs from "node:fs";
import path from "node:path";

const target = path.resolve("android/app/src/main/res/drawable/ic_stat_icon_config_sample.xml");
if (!fs.existsSync(path.dirname(target))) {
  throw new Error("Folder Android belum dibuat. Jalankan npx cap add android terlebih dahulu.");
}

// Monochrome status-bar icon required by the Local Notifications plugin.
const vector = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M20,6H4C2.9,6 2,6.9 2,8v10c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2V8c0,-1.1 -0.9,-2 -2,-2zM20,18H4V8h16v10zM17,13h-4v2h4v-2zM6,3h14v2H6z" />
</vector>
`;
fs.writeFileSync(target, vector, "utf8");
console.log("Prepared Android notification icon.");

// Izin yang dibutuhkan notifikasi lokal. Android 13+ butuh POST_NOTIFICATIONS agar
// dialog izin bisa muncul; RECEIVE_BOOT_COMPLETED agar jadwal dipulihkan setelah
// perangkat restart. Ditambahkan hanya jika belum ada (aman dijalankan berulang;
// deklarasi ganda dari plugin digabung otomatis oleh manifest merger).
const manifestPath = path.resolve("android/app/src/main/AndroidManifest.xml");
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, "utf8");
  const missing = [
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.RECEIVE_BOOT_COMPLETED",
  ].filter((name) => !manifest.includes(`android:name="${name}"`));
  if (missing.length && manifest.includes("</manifest>")) {
    const lines = missing
      .map((name) => `    <uses-permission android:name="${name}" />\n`)
      .join("");
    manifest = manifest.replace("</manifest>", `${lines}</manifest>`);
    fs.writeFileSync(manifestPath, manifest, "utf8");
  }
  console.log("Prepared Android notification permissions.");
} else {
  console.warn("AndroidManifest.xml tidak ditemukan; izin notifikasi tidak ditambahkan.");
}

// ── Plugin native "DownloadSaver": simpan file ke Download/Hylim lewat MediaStore ──
// Android 10+ tidak mengizinkan menulis langsung ke folder Download publik, tetapi
// MediaStore resmi dan tanpa izin tambahan. Dipasang ke project hasil `cap add android`
// (folder android/ tidak ada di repo). Aman dijalankan berulang.
const javaRoot = path.resolve("android/app/src/main/java");
function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

const mainActivityPath = findFile(javaRoot, "MainActivity.java");
if (!mainActivityPath) {
  throw new Error("MainActivity.java tidak ditemukan; plugin DownloadSaver tidak bisa dipasang.");
}
const mainActivity = fs.readFileSync(mainActivityPath, "utf8");
const packageMatch = mainActivity.match(/^\s*package\s+([\w.]+)\s*;/m);
if (!packageMatch) throw new Error("Package MainActivity tidak terbaca.");
const javaPackage = packageMatch[1];
const javaDir = path.dirname(mainActivityPath);

const pluginSource = `package ${javaPackage};

import android.content.ContentUris;
import android.content.ContentValues;
import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

/**
 * Menyimpan file ke Download/<folder> lewat MediaStore (Android 10+, tanpa izin).
 * Di Android lebih lama menolak dengan "unsupported" agar JS memakai lembar Bagikan.
 */
@CapacitorPlugin(name = "DownloadSaver")
public class DownloadSaverPlugin extends Plugin {

    private static String clean(String value) {
        return value.replaceAll("[\\\\\\\\/:*?\\"<>|]", "_").trim();
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        String filename = call.getString("filename");
        String data = call.getString("data");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String folder = call.getString("folder", "Hylim");

        if (filename == null || filename.trim().isEmpty() || data == null) {
            call.reject("filename dan data wajib diisi");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("unsupported");
            return;
        }

        filename = clean(filename);
        folder = clean(folder);
        if (folder.isEmpty()) folder = "Hylim";

        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            ContentResolver resolver = getContext().getContentResolver();
            Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            String relativePath = Environment.DIRECTORY_DOWNLOADS + "/" + folder;

            // Hapus file lama bernama sama (milik aplikasi ini) agar tidak menjadi "nama (1)".
            try (Cursor cursor = resolver.query(
                    collection,
                    new String[] { MediaStore.Downloads._ID },
                    MediaStore.Downloads.DISPLAY_NAME + "=? AND " + MediaStore.Downloads.RELATIVE_PATH + "=?",
                    new String[] { filename, relativePath + "/" },
                    null)) {
                while (cursor != null && cursor.moveToNext()) {
                    try {
                        resolver.delete(ContentUris.withAppendedId(collection, cursor.getLong(0)), null, null);
                    } catch (Exception ignored) {
                        // bukan milik aplikasi ini: biarkan, file baru diberi nama berbeda oleh sistem
                    }
                }
            } catch (Exception ignored) {
                // gagal mencari file lama tidak boleh membatalkan penyimpanan
            }

            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            values.put(MediaStore.Downloads.RELATIVE_PATH, relativePath);
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri uri = resolver.insert(collection, values);
            if (uri == null) {
                call.reject("Gagal membuat file di Download");
                return;
            }

            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("Stream kosong");
                out.write(bytes);
                out.flush();
            } catch (Exception writeError) {
                try {
                    resolver.delete(uri, null, null);
                } catch (Exception ignored) {
                    // abaikan
                }
                call.reject("Gagal menulis file: " + writeError.getMessage());
                return;
            }

            ContentValues done = new ContentValues();
            done.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(uri, done, null, null);

            JSObject result = new JSObject();
            result.put("path", relativePath + "/" + filename);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Gagal menyimpan: " + error.getMessage());
        }
    }
}
`;
fs.writeFileSync(path.join(javaDir, "DownloadSaverPlugin.java"), pluginSource, "utf8");

if (!mainActivity.includes("DownloadSaverPlugin")) {
  const newMain = `package ${javaPackage};

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DownloadSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
  fs.writeFileSync(mainActivityPath, newMain, "utf8");
}
console.log("Prepared DownloadSaver plugin (Download/Hylim).");
