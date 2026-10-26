# Build APK Android Money Manager (Capacitor)

## Build online lewat GitHub Actions

1. Commit dan push source proyek ke repositori GitHub pribadi. Jangan commit folder `backupdata/` atau file ekspor keuangan.
2. Buka tab **Actions** pada repositori.
3. Pilih workflow **Build Android APK** lalu klik **Run workflow**. Workflow juga berjalan otomatis saat file aplikasi terkait di-push ke branch `main` atau `master`.
4. Setelah selesai, buka run workflow dan unduh artifact `money-manager-debug-apk`.
5. Ekstrak ZIP artifact, lalu instal `app-debug.apk` di HP Android. Izinkan instalasi dari sumber tersebut jika Android memintanya.

## Catatan

- Build menggunakan GitHub Actions, jadi Android SDK dan Gradle tidak perlu dijalankan di laptop lokal. Kuota GitHub Actions bergantung pada jenis akun dan penggunaan.
- APK debug cocok untuk pengujian dan instalasi pribadi. Untuk distribusi publik/Play Store, siapkan signing release yang aman secara terpisah. Jangan simpan keystore atau password signing di source code.
- Notifikasi lokal memerlukan izin notifikasi Android. Jadwal disegarkan ketika aplikasi dibuka dan saat transaksi/utang diperbarui. Pengingat H-2 (utang/piutang, per angsuran) dijadwalkan pukul 09.00 dua hari sebelum jatuh tempo dan dibatalkan saat lunas/dihapus/diubah. Pengingat pencatatan harian pukul 21.00 dijadwalkan untuk 7 hari ke depan; hari yang sudah punya transaksi pemasukan/pengeluaran dilewati (tabungan dan pembayaran utang/piutang tidak dihitung). Aplikasi tidak bisa mengecek kondisi saat tertutup, jadi jadwal dihitung ulang setiap aplikasi dibuka dan setiap data berubah.
- Android dapat menunda alarm non-tepat-waktu karena penghematan baterai. Pengguna juga bisa mematikan izin notifikasi dari pengaturan sistem.
- Data IndexedDB PWA di browser tidak otomatis berpindah ke penyimpanan APK Capacitor. Backup data dari PWA sebelum pindah; lakukan restore di APK dan verifikasi datanya. Jangan hapus PWA/browser sebelum memastikan backup berhasil.
- Web assets dipaketkan lokal. Dependensi CDN yang sudah digunakan aplikasi (Chart.js, jsPDF, html2canvas, Font Awesome) tetap memerlukan internet sampai dipaketkan lokal secara terpisah.
