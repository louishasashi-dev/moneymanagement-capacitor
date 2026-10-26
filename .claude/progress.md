# Progress: Mobile modal fix & Android notifications (SELESAI)

## Selesai
- [x] Baca CLAUDE.md / SKILL.md / DESIGN.md
- [x] Modal: layer CSS `mm-modal-safe` di akhir css/style.css (token --mm-safe-top/bottom, dvh, footer sheet + inset)
- [x] Notifikasi: js/native-notifications.js ditulis ulang (harian 21.00 x7 hari, H-2 utang/piutang, ID anti-tabrakan)
- [x] Pemicu sinkronisasi: transaction.js (saveMultiTransactionAtomic oncomplete), planned.js (konfirmasi rencana tunggal)
- [x] scripts/prepare-android.js: izin POST_NOTIFICATIONS + RECEIVE_BOOT_COMPLETED (idempoten)
- [x] capacitor.config.json: SystemBars.insetsHandling = "css" (eksplisit; appId tidak berubah)

## Pengujian
- Unit test logika notifikasi (43 kasus, 3 zona waktu) lulus; uji modal di Chromium 360x740 & 740x360 lulus
- Belum bisa: npm install/vite build (registry diblokir di sandbox), uji di perangkat Android fisik

## Keputusan penting
- Tidak ada perubahan skema IndexedDB / data pengguna
- Transaksi bertipe saving dan source debt/debt-loan/debt-payment tidak dihitung untuk pengingat harian
