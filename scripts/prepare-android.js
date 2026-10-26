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
