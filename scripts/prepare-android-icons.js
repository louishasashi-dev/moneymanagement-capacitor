import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// Ikon sumber: gambar yang sudah ada di images/icons (tanpa desain baru, hanya resize).
const SOURCE = path.resolve("images/icons/icon-512x512.png");
// Warna latar adaptive icon = warna tepi ikon sumber (#1C213E) agar menyatu.
const BACKGROUND = "#1C213E";

const resDir = path.resolve("android/app/src/main/res");
if (!fs.existsSync(resDir)) {
  throw new Error("Folder Android belum dibuat. Jalankan npx cap add android terlebih dahulu.");
}
if (!fs.existsSync(SOURCE)) {
  throw new Error(`Ikon sumber tidak ditemukan: ${SOURCE}`);
}

// Ukuran per density: launcher legacy (48dp) dan layer adaptive icon (108dp).
const densities = {
  mdpi: { launcher: 48, foreground: 108 },
  hdpi: { launcher: 72, foreground: 162 },
  xhdpi: { launcher: 96, foreground: 216 },
  xxhdpi: { launcher: 144, foreground: 324 },
  xxxhdpi: { launcher: 192, foreground: 432 },
};

const resize = (size) => sharp(SOURCE).resize(size, size, { kernel: "lanczos3" });

for (const [density, size] of Object.entries(densities)) {
  const dir = path.join(resDir, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });

  // Launcher legacy (Android < 8) - persegi dan bulat.
  await resize(size.launcher).png().toFile(path.join(dir, "ic_launcher.png"));
  const mask = Buffer.from(
    `<svg width="${size.launcher}" height="${size.launcher}"><circle cx="${size.launcher / 2}" cy="${size.launcher / 2}" r="${size.launcher / 2}"/></svg>`
  );
  await resize(size.launcher)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toFile(path.join(dir, "ic_launcher_round.png"));

  // Layer foreground adaptive icon (Android 8+): ikon sumber utuh, hanya di-resize.
  await resize(size.foreground).png().toFile(path.join(dir, "ic_launcher_foreground.png"));
}

// Warna latar adaptive icon (nama sendiri agar tidak bentrok dengan template Capacitor).
const valuesDir = path.join(resDir, "values");
fs.mkdirSync(valuesDir, { recursive: true });
fs.writeFileSync(
  path.join(valuesDir, "mm_icon_colors.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="mm_icon_background">${BACKGROUND}</color>
</resources>
`,
  "utf8"
);

const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/mm_icon_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
const anydpi = path.join(resDir, "mipmap-anydpi-v26");
fs.mkdirSync(anydpi, { recursive: true });
fs.writeFileSync(path.join(anydpi, "ic_launcher.xml"), adaptive, "utf8");
fs.writeFileSync(path.join(anydpi, "ic_launcher_round.xml"), adaptive, "utf8");

console.log("Prepared Android launcher icons from images/icons/icon-512x512.png.");
