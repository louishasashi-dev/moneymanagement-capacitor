// Simpan PDF jsPDF. Di browser/PWA tetap memakai doc.save() (perilaku lama, jalan di Edge).
// Di APK Capacitor Android, doc.save() tidak melakukan apa-apa karena WebView tidak
// menangani unduhan Blob (<a download>). Di sana PDF ditulis ke cache aplikasi lewat
// Filesystem lalu dibuka lewat lembar Bagikan (Simpan ke File/Drive, WhatsApp, dll).
// Cache app tidak butuh izin Android tambahan.
//
// PENTING: tidak boleh ada import statis "@capacitor/..." di file ini. Saat dijalankan
// sebagai web biasa (Live Server/GitHub Pages) browser tidak bisa menyelesaikan nama
// paket itu dan seluruh aplikasi gagal dimuat. Plugin hanya di-import dinamis di APK
// (Vite membundelnya saat build).

function isNativeAndroid() {
  const cap = window.Capacitor;
  return Boolean(
    cap &&
      typeof cap.isNativePlatform === "function" &&
      cap.isNativePlatform() &&
      cap.getPlatform() === "android",
  );
}

async function loadNativePlugins() {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  return { Filesystem, Directory, Share };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Mengembalikan "saved" (browser), "shared" (Android, lembar Bagikan dibuka),
// atau "cancelled" (pengguna menutup lembar Bagikan). Melempar Error jika gagal.
export async function savePdf(doc, filename) {
  if (!isNativeAndroid()) {
    doc.save(filename);
    return "saved";
  }

  const buffer = doc.output("arraybuffer");
  if (!buffer || buffer.byteLength < 100) {
    throw new Error("PDF kosong");
  }

  const { Filesystem, Directory, Share } = await loadNativePlugins();
  const written = await Filesystem.writeFile({
    path: filename,
    data: arrayBufferToBase64(buffer),
    directory: Directory.Cache,
  });

  try {
    await Share.share({
      title: filename,
      dialogTitle: "Simpan atau bagikan PDF",
      files: [written.uri],
    });
    return "shared";
  } catch (error) {
    // Menutup lembar Bagikan dilaporkan sebagai error "canceled" oleh plugin.
    if (/cancel/i.test(String(error?.message || error))) return "cancelled";
    throw error;
  }
}

// Simpan gambar PNG (data URL). Browser: unduhan <a download> seperti semula.
// Android APK: tulis ke cache lalu buka lembar Bagikan (sama seperti savePdf).
// Mengembalikan "saved" | "shared" | "cancelled"; melempar Error jika gagal.
export async function saveImage(dataUrl, filename) {
  if (!isNativeAndroid()) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return "saved";
  }

  const base64 = String(dataUrl).split(",")[1];
  if (!base64 || base64.length < 100) {
    throw new Error("Gambar kosong");
  }

  const { Filesystem, Directory, Share } = await loadNativePlugins();
  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });

  try {
    await Share.share({
      title: filename,
      dialogTitle: "Simpan atau bagikan gambar",
      files: [written.uri],
    });
    return "shared";
  } catch (error) {
    if (/cancel/i.test(String(error?.message || error))) return "cancelled";
    throw error;
  }
}
