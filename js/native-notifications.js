import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getAllItems, STORES } from "./db.js";

// ID notifikasi milik aplikasi. Rentang dipakai untuk membatalkan jadwal lama
// tanpa menyentuh notifikasi lain.
//   810001..810099 : pengingat pencatatan harian (810001 = ID lama, tetap dipakai)
//   820000..899999 : pengingat utang/piutang H-2
const DAILY_REMINDER_ID = 810001;
const DAILY_ID_MAX = 810099;
const DEBT_ID_MIN = 820000;
const DEBT_ID_MAX = 899999;

const REMINDER_HOUR = 21; // pengingat harian: 21.00 waktu lokal perangkat
const DEBT_REMINDER_HOUR = 9; // pengingat H-2: 09.00 waktu lokal perangkat
const DEBT_REMINDER_DAYS_BEFORE = 2;

// Pengingat piutang overdue: hari overdue ke-1, 8, 15, ... (tiap 7 hari) pukul 09.00.
// Dijadwalkan beberapa kemunculan ke depan; jadwal dihitung ulang setiap sync.
const OVERDUE_INTERVAL_DAYS = 7;
const OVERDUE_LOOKAHEAD_COUNT = 4;

// Jadwal harian dibuat untuk beberapa hari ke depan sekaligus. Mencatat transaksi
// hanya mungkin lewat aplikasi, dan setiap perubahan data menjadwalkan ulang,
// jadi hari yang sudah punya transaksi tidak dijadwalkan. Jika aplikasi tidak
// dibuka, tidak ada transaksi baru, sehingga pengingat hari-hari itu memang benar.
const DAILY_LOOKAHEAD_DAYS = 7;

// Transaksi yang dibuat otomatis dari fitur utang/piutang bukan catatan
// belanja/pemasukan harian pengguna. Tipe "saving" (tabungan) juga bukan.
const NON_DAILY_TX_SOURCES = new Set([
  "debt",
  "debt-loan",
  "debt-payment",
  "savings-deposit",
  "savings-withdraw",
]);

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function atLocalTime(dateKey, hour) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function isOurNotification(id) {
  return (
    (id >= DAILY_REMINDER_ID && id <= DAILY_ID_MAX) ||
    (id >= DEBT_ID_MIN && id <= DEBT_ID_MAX)
  );
}

// ID stabil dari kunci kewajiban (id utang + id angsuran + jatuh tempo).
// Jika dua kunci kebetulan bertabrakan, ID digeser ke slot kosong berikutnya
// supaya satu pengingat tidak menimpa pengingat lain.
function stableNotificationId(value, usedIds) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const span = DEBT_ID_MAX - DEBT_ID_MIN + 1;
  let slot = (hash >>> 0) % span;
  while (usedIds.has(DEBT_ID_MIN + slot)) slot = (slot + 1) % span;
  const id = DEBT_ID_MIN + slot;
  usedIds.add(id);
  return id;
}

async function ensurePermission() {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

// Apakah transaksi ini dihitung sebagai "sudah mencatat" untuk pengingat harian.
export function countsAsDailyRecord(transaction) {
  if (!transaction) return false;
  if (transaction.type !== "income" && transaction.type !== "expense") return false;
  if (NON_DAILY_TX_SOURCES.has(transaction.source)) return false;
  return DATE_KEY_PATTERN.test(String(transaction.date || ""));
}

function buildDailyNotifications(transactions, now) {
  const recordedDays = new Set();
  for (const item of transactions) {
    if (countsAsDailyRecord(item)) recordedDays.add(item.date);
  }

  const notifications = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let offset = 0; offset < DAILY_LOOKAHEAD_DAYS; offset += 1) {
    const dayKey = localDateKey(addDays(today, offset));
    const at = atLocalTime(dayKey, REMINDER_HOUR);
    if (at <= now) continue;
    if (recordedDays.has(dayKey)) continue;
    notifications.push({
      id: DAILY_REMINDER_ID + offset,
      title: "Pengingat pencatatan harian",
      body: "Kamu tidak membeli apapun hari ini? Atau lupa mencatatnya?",
      schedule: { at, allowWhileIdle: true },
      isExactNotification: false,
    });
  }
  return notifications;
}

function installmentPaidAmount(debt, installment) {
  // Pembayaran hanya bisa dikaitkan ke angsuran yang punya ID (sama seperti debt.js).
  if (!installment || !installment.id) return 0;
  return (debt.payments || [])
    .filter((payment) => payment.installmentId === installment.id)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

function debtMessage(isReceivable, isInstallment, party) {
  if (isReceivable && !isInstallment) {
    return {
      title: "Piutang jatuh tempo 2 hari lagi",
      body: `${party} dijadwalkan melunasi piutang dalam 2 hari. Sudah ditagih atau dibayar belum?`,
    };
  }
  if (isReceivable) {
    return {
      title: "Angsuran piutang jatuh tempo 2 hari lagi",
      body: `Angsuran ${party} jatuh tempo 2 hari lagi. Pastikan pembayaran sudah ditagih atau diterima.`,
    };
  }
  if (!isInstallment) {
    return {
      title: "Utang jatuh tempo 2 hari lagi",
      body: `Utangmu kepada ${party} jatuh tempo 2 hari lagi. Siapkan dana agar bisa membayar tepat waktu.`,
    };
  }
  return {
    title: "Angsuran utang jatuh tempo 2 hari lagi",
    body: `Angsuran utangmu kepada ${party} jatuh tempo 2 hari lagi. Pastikan dananya tersedia.`,
  };
}

function buildDebtNotifications(debts, now, usedIds = new Set()) {
  const notifications = [];

  for (const debt of debts) {
    if (!debt) continue;
    if (debt.status === "completed" || debt.status === "cancelled") continue;
    // "debt" = piutang (orang berhutang ke saya), "owe" = utang saya.
    if (debt.type !== "debt" && debt.type !== "owe") continue;

    const isReceivable = debt.type === "debt";
    const party = String(debt.partyName || "").trim() || "pihak terkait";
    const totalRemaining = Number(debt.remainingAmount ?? debt.amount ?? 0);
    if (!(totalRemaining > 0)) continue;

    const isInstallment =
      debt.isInstallment === true &&
      Array.isArray(debt.installments) &&
      debt.installments.length > 0;

    const obligations = isInstallment
      ? debt.installments.map((item, index) => ({
          key: item.id || `idx${index}`,
          dueDate: item.dueDate,
          remaining: Math.max(
            0,
            Number(item.amount || 0) - installmentPaidAmount(debt, item),
          ),
        }))
      : [{ key: "full", dueDate: debt.dueDate, remaining: totalRemaining }];

    for (const obligation of obligations) {
      if (!DATE_KEY_PATTERN.test(String(obligation.dueDate || ""))) continue;
      if (!(obligation.remaining > 0)) continue;

      const remindAt = addDays(
        atLocalTime(obligation.dueDate, DEBT_REMINDER_HOUR),
        -DEBT_REMINDER_DAYS_BEFORE,
      );
      if (remindAt <= now) continue;

      const { title, body } = debtMessage(isReceivable, isInstallment, party);
      notifications.push({
        id: stableNotificationId(
          `${debt.id ?? party}:${obligation.key}:${obligation.dueDate}:${debt.type}`,
          usedIds,
        ),
        title,
        body,
        schedule: { at: remindAt, allowWhileIdle: true },
        isExactNotification: false,
      });
    }
  }
  return notifications;
}

// Pengingat piutang overdue (type "debt"): satu deret per piutang, berdasarkan jatuh
// tempo paling awal yang belum lunas. Nominal = sisa piutang saat dijadwalkan;
// jumlah hari overdue dihitung untuk tanggal kemunculan notifikasinya.
function buildOverdueReceivableNotifications(debts, now, usedIds = new Set()) {
  const notifications = [];
  for (const debt of debts) {
    if (!debt || debt.type !== "debt") continue;
    if (debt.status === "completed" || debt.status === "cancelled") continue;
    const totalRemaining = Number(debt.remainingAmount ?? debt.amount ?? 0);
    if (!(totalRemaining > 0)) continue;

    const isInstallment =
      debt.isInstallment === true &&
      Array.isArray(debt.installments) &&
      debt.installments.length > 0;
    const dueDates = (
      isInstallment
        ? debt.installments
            .filter(
              (item) =>
                Math.max(
                  0,
                  Number(item.amount || 0) - installmentPaidAmount(debt, item),
                ) > 0,
            )
            .map((item) => item.dueDate)
        : [debt.dueDate]
    )
      .filter((d) => DATE_KEY_PATTERN.test(String(d || "")))
      .sort();
    const dueDate = dueDates[0];
    if (!dueDate) continue;

    const dueAt = atLocalTime(dueDate, 0);
    const party = String(debt.partyName || "").trim() || "pihak terkait";
    let scheduled = 0;
    for (let k = 0; scheduled < OVERDUE_LOOKAHEAD_COUNT && k < 520; k += 1) {
      const dayOffset = 1 + k * OVERDUE_INTERVAL_DAYS; // hari overdue ke-1, 8, 15, ...
      const slotDay = addDays(dueAt, dayOffset);
      const at = atLocalTime(localDateKey(slotDay), DEBT_REMINDER_HOUR);
      if (at <= now) continue;
      scheduled += 1;
      notifications.push({
        id: stableNotificationId(
          `${debt.id ?? party}:overdue:${localDateKey(slotDay)}`,
          usedIds,
        ),
        title: "Piutang melewati jatuh tempo",
        body: `${party} masih memiliki tagihan sebesar ${formatRupiah(totalRemaining)}, dan telah melewati batas waktu pembayaran selama ${dayOffset} hari.`,
        schedule: { at, allowWhileIdle: true },
        isExactNotification: false,
      });
    }
  }
  return notifications;
}

function formatRupiah(amount) {
  return `Rp ${Math.round(amount).toLocaleString("id-ID")}`;
}

// Murni (tanpa efek samping): hasilkan daftar notifikasi dari data saat ini.
export function buildNotificationPlan({ transactions = [], debts = [], now = new Date() }) {
  // Satu set ID bersama agar pengingat H-2 dan overdue tidak pernah memakai ID yang sama
  const usedIds = new Set();
  return [
    ...buildDailyNotifications(transactions, now),
    ...buildDebtNotifications(debts, now, usedIds),
    ...buildOverdueReceivableNotifications(debts, now, usedIds),
  ];
}

let syncRunning = false;
let syncQueued = false;

async function runSync() {
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") return;

  const now = new Date();
  const [transactions, debts] = await Promise.all([
    getAllItems(STORES.TRANSACTIONS),
    getAllItems(STORES.DEBTS),
  ]);
  const notifications = buildNotificationPlan({ transactions, debts, now });

  const pendingResult = await LocalNotifications.getPending();
  const owned = (pendingResult.notifications || []).filter((item) =>
    isOurNotification(item.id),
  );
  if (owned.length) {
    await LocalNotifications.cancel({
      notifications: owned.map(({ id }) => ({ id })),
    });
  }

  if (notifications.length) {
    await LocalNotifications.schedule({ notifications });
  }
}

// Jadwal dibangun ulang dari data terbaru: saat aplikasi dibuka dan setiap
// transaksi/utang berubah (tambah, ubah, hapus, bayar, lunas, tanggal diubah).
// Pemanggilan beruntun digabung agar hasil lama tidak menimpa hasil baru.
export async function syncNativeNotifications() {
  if (!isNativeAndroid()) return;
  if (syncRunning) {
    syncQueued = true;
    return;
  }
  syncRunning = true;
  try {
    do {
      syncQueued = false;
      try {
        await runSync();
      } catch (error) {
        console.error("Gagal menyinkronkan notifikasi Android:", error);
      }
    } while (syncQueued);
  } finally {
    syncRunning = false;
  }
}

export async function initializeNativeNotifications() {
  if (!isNativeAndroid()) return;
  try {
    const granted = await ensurePermission();
    if (granted) await syncNativeNotifications();
  } catch (error) {
    console.error("Inisialisasi notifikasi Android gagal:", error);
  }
}

// ── Alat uji di HP (Pengaturan > Notifikasi Android) ─────────────────────────
// ID uji di luar rentang milik aplikasi, jadi tidak ikut dihapus/dibuat ulang
// oleh syncNativeNotifications().
const TEST_NOTIFICATION_ID = 900001;

// Status izin + daftar notifikasi terjadwal milik aplikasi (urut waktu).
export async function getNotificationStatus() {
  if (!isNativeAndroid()) return { supported: false, permission: "n/a", pending: [] };
  const permission = (await LocalNotifications.checkPermissions()).display;
  const pendingResult = await LocalNotifications.getPending();
  const pending = (pendingResult.notifications || [])
    .filter((item) => isOurNotification(item.id))
    .map((item) => ({
      id: item.id,
      title: item.title || "",
      body: item.body || "",
      at: item.schedule?.at ? new Date(item.schedule.at) : null,
    }))
    .sort((a, b) => (a.at?.getTime() || 0) - (b.at?.getTime() || 0));
  return { supported: true, permission, pending };
}

// Kirim satu notifikasi uji beberapa detik lagi (minta izin jika belum ada).
// Mengembalikan true jika dijadwalkan, false jika izin ditolak.
export async function sendTestNotification(delaySeconds = 5) {
  if (!isNativeAndroid()) return false;
  if (!(await ensurePermission())) return false;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: TEST_NOTIFICATION_ID,
        title: "Tes notifikasi Hylim",
        body: "Jika kamu membaca ini, notifikasi Android berfungsi.",
        schedule: {
          at: new Date(Date.now() + delaySeconds * 1000),
          allowWhileIdle: true,
        },
      },
    ],
  });
  return true;
}

// ── Notifikasi aktivitas (langsung tampil di bilah notifikasi HP) ────────────
// Dipanggil dari addAppNotification() saat bayar/tambah utang atau tabungan.
// ID 910000..919999 di luar rentang yang dibersihkan syncNativeNotifications().
let activitySeq = 0;
export async function showActivityNotification(title, body) {
  if (!isNativeAndroid()) return false;
  if (!(await ensurePermission())) return false;
  activitySeq = (activitySeq + 1) % 10000;
  const id = 910000 + ((Date.now() + activitySeq) % 10000);
  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title: String(title || "Hylim"),
        body: String(body || ""),
        schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true },
      },
    ],
  });
  return true;
}
