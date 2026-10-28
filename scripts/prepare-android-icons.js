import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// Ikon sumber: gambar siap pakai di images/android-icon (tanpa desain baru, hanya resize).
const ICON_DIR = path.resolve("images/android-icon");
const SOURCE = path.join(ICON_DIR, "launchericon-512x512.png");
// Warna latar = warna tepi ikon sumber (putih) agar adaptive icon menyatu.
const BACKGROUND = "#FEFEFE";
// Adaptive icon dipotong sesuai bentuk launcher (lingkaran paling ketat). Logo diperkecil
// ke area aman agar tidak terpotong (titik terjauh logo ~218px dari pusat pada 512px;
// area terlihat berjari-jari 36/108 x 512 = 171px, jadi skala = 0.78). Desain tidak diubah.
const SAFE_SCALE = 0.78;

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

// Logo diperkecil di tengah kanvas berlatar BACKGROUND
async function paddedIcon(size) {
  const inner = Math.round(size * SAFE_SCALE);
  const logo = await resize(inner).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 3, background: BACKGROUND },
  }).composite([{ input: logo, gravity: "center" }]);
}

for (const [density, size] of Object.entries(densities)) {
  const dir = path.join(resDir, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });

  // Launcher legacy (Android < 8), persegi: pakai file bawaan bila ukurannya persis sama.
  const provided = path.join(ICON_DIR, `launchericon-${size.launcher}x${size.launcher}.png`);
  if (fs.existsSync(provided)) {
    fs.copyFileSync(provided, path.join(dir, "ic_launcher.png"));
  } else {
    await resize(size.launcher).png().toFile(path.join(dir, "ic_launcher.png"));
  }

  // Launcher legacy bulat: logo di area aman, dipotong lingkaran
  const mask = Buffer.from(
    `<svg width="${size.launcher}" height="${size.launcher}"><circle cx="${size.launcher / 2}" cy="${size.launcher / 2}" r="${size.launcher / 2}"/></svg>`
  );
  const round = await paddedIcon(size.launcher);
  await round
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toFile(path.join(dir, "ic_launcher_round.png"));

  // Layer foreground adaptive icon (Android 8+)
  const fg = await paddedIcon(size.foreground);
  await fg.png().toFile(path.join(dir, "ic_launcher_foreground.png"));
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

console.log("Prepared Android launcher icons from images/android-icon/launchericon-512x512.png.");
