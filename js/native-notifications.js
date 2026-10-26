import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getAllItems, STORES } from "./db.js";

const DAILY_REMINDER_ID = 810001;
const DEBT_ID_MIN = 820000;
const DEBT_ID_MAX = 899999;
const REMINDER_HOUR = 21;
const DEBT_REMINDER_HOUR = 9;

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

function stableNotificationId(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return DEBT_ID_MIN + (Math.abs(hash >>> 0) % (DEBT_ID_MAX - DEBT_ID_MIN + 1));
}

function isOurNotification(id) {
  return id === DAILY_REMINDER_ID || (id >= DEBT_ID_MIN && id <= DEBT_ID_MAX);
}

async function ensurePermission() {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

function buildDebtNotifications(debts, now) {
  const scheduled = [];
  for (const debt of debts) {
    if (!debt || debt.status === "completed") continue;
    const isReceivable = debt.type !== "owe";
    const party = String(debt.partyName || "pihak terkait").trim() || "pihak terkait";
    const isInstallment = debt.isInstallment === true && Array.isArray(debt.installments) && debt.installments.length > 0;
    const obligations = isInstallment
      ? debt.installments.map((item, index) => {
          const paid = (debt.payments || [])
            .filter((payment) => payment.installmentId === item.id)
            .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
          return {
            key: item.id || `${index}-${item.dueDate}`,
            dueDate: item.dueDate,
            remaining: Math.max(0, Number(item.amount || 0) - paid),
            installment: true,
          };
        })
      : [{
          key: "full",
          dueDate: debt.dueDate,
          remaining: Number(debt.remainingAmount ?? debt.amount ?? 0),
          installment: false,
        }];

    for (const obligation of obligations) {
      if (!obligation.dueDate || obligation.remaining <= 0) continue;
      const due = atLocalTime(obligation.dueDate, DEBT_REMINDER_HOUR);
      const remindAt = addDays(due, -2);
      if (remindAt <= now) continue;

      let title;
      let body;
      if (isReceivable && obligation.installment) {
        title = "Angsuran piutang jatuh tempo 2 hari lagi";
        body = `Pastikan angsuran dari ${party} sudah ditagih atau diterima.`;
      } else if (isReceivable) {
        title = "Piutang jatuh tempo 2 hari lagi";
        body = `Sudah menagih ${party} atau menerima pelunasannya?`;
      } else if (obligation.installment) {
        title = "Angsuran utang jatuh tempo 2 hari lagi";
        body = `Siapkan pembayaran angsuran kepada ${party}.`;
      } else {
        title = "Utang jatuh tempo 2 hari lagi";
        body = `Siapkan dana untuk melunasi utang kepada ${party}.`;
      }

      scheduled.push({
        id: stableNotificationId(`${debt.id || party}:${obligation.key}:${obligation.dueDate}:${debt.type}`),
        title,
        body,
        schedule: { at: remindAt },
        isExactNotification: false,
      });
    }
  }
  return scheduled;
}

export async function syncNativeNotifications() {
  if (!isNativeAndroid()) return;

  try {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") return;

    const pendingResult = await LocalNotifications.getPending();
    const owned = (pendingResult.notifications || []).filter((item) => isOurNotification(item.id));
    if (owned.length) {
      await LocalNotifications.cancel({ notifications: owned.map(({ id }) => ({ id })) });
    }

    const now = new Date();
    const todayKey = localDateKey(now);
    const transactions = await getAllItems(STORES.TRANSACTIONS);
    const hasTransactionToday = transactions.some((item) => item.date === todayKey);
    let dailyAt = atLocalTime(todayKey, REMINDER_HOUR);
    if (hasTransactionToday || dailyAt <= now) {
      dailyAt = atLocalTime(localDateKey(addDays(now, 1)), REMINDER_HOUR);
    }

    const notifications = [{
      id: DAILY_REMINDER_ID,
      title: "Pengingat pencatatan harian",
      body: "Kamu tidak membeli apa pun hari ini, atau lupa mencatat pengeluaranmu?",
      schedule: { at: dailyAt },
      isExactNotification: false,
    }];

    const debts = await getAllItems(STORES.DEBTS);
    notifications.push(...buildDebtNotifications(debts, now));

    if (notifications.length) {
      await LocalNotifications.schedule({ notifications });
    }
  } catch (error) {
    console.error("Gagal menyinkronkan notifikasi Android:", error);
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
