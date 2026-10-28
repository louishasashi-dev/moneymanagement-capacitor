// Report Component - Versi Sederhana
// Menampilkan laporan keuangan, grafik, dan analisis

import { getAllItems, getTransactionsByDateRange, STORES } from "./db.js";
import { formatCurrency, formatDate, showToast } from "./utils.js";
import { savePdf } from "./pdf-save.js";

// State
let currentReportPeriod = "month";
let customFilters = {
  day: "all", // tanggal spesifik dalam minggu ini, "all" = tampilkan seminggu penuh
};
let reportData = {
  transactions: [],
  startDate: "",
  endDate: "",
};

// Nama hari singkat & nama bulan lengkap (untuk label filter tanggal custom)
const DAY_NAMES_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTH_NAMES_FULL = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// Helper function to format date to YYYY-MM-DD
function formatDateToYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper: Get month name
function getMonthNameFromDate(dateStr) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  const [year, month] = dateStr.split("-");
  return `${months[parseInt(month) - 1]} ${year}`;
}

// Dapatkan tanggal awal & akhir minggu ini (Minggu - Sabtu)
function getWeekBounds(refDate = new Date()) {
  const startOfWeek = new Date(refDate);
  startOfWeek.setDate(refDate.getDate() - refDate.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(0, 0, 0, 0);
  return { startOfWeek, endOfWeek };
}

// Daftar tanggal dalam minggu ini (Minggu - Sabtu), dipakai untuk opsi filter tanggal custom
function getCurrentWeekDayOptions() {
  const { startOfWeek } = getWeekBounds(new Date());
  const options = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    options.push({
      value: formatDateToYYYYMMDD(d),
      label: `${DAY_NAMES_SHORT[d.getDay()]}, ${d.getDate()}`,
    });
  }
  return options;
}

// Get date range based on period
function getDateRange(period, customDay = "all") {
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case "week": {
      const { startOfWeek, endOfWeek } = getWeekBounds(now);
      startDate = formatDateToYYYYMMDD(startOfWeek);
      endDate = formatDateToYYYYMMDD(endOfWeek);
      break;
    }
    case "month":
      startDate = formatDateToYYYYMMDD(
        new Date(now.getFullYear(), now.getMonth(), 1),
      );
      endDate = formatDateToYYYYMMDD(
        new Date(now.getFullYear(), now.getMonth() + 1, 0),
      );
      break;
    case "year":
      startDate = formatDateToYYYYMMDD(new Date(now.getFullYear(), 0, 1));
      endDate = formatDateToYYYYMMDD(new Date(now.getFullYear(), 11, 31));
      break;
    case "custom": {
      if (customDay && customDay !== "all") {
        // Tanggal spesifik yang dipilih (hanya bisa dari minggu ini)
        startDate = customDay;
        endDate = customDay;
      } else {
        // Belum pilih tanggal spesifik -> tampilkan minggu ini secara penuh
        const { startOfWeek, endOfWeek } = getWeekBounds(now);
        startDate = formatDateToYYYYMMDD(startOfWeek);
        endDate = formatDateToYYYYMMDD(endOfWeek);
      }
      break;
    }
    default:
      startDate = formatDateToYYYYMMDD(
        new Date(now.getFullYear(), now.getMonth(), 1),
      );
      endDate = formatDateToYYYYMMDD(
        new Date(now.getFullYear(), now.getMonth() + 1, 0),
      );
  }

  return { startDate, endDate };
}

// Render halaman laporan utama
export async function renderReportsPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  // Halaman selalu dibuka pada "Bulan Ini"; samakan state modul dengan tampilan
  currentReportPeriod = "month";
  customFilters.day = "all";
  txVisibleCount = TX_PAGE_SIZE;

  const { startDate, endDate } = getDateRange("month");
  reportData.startDate = startDate;
  reportData.endDate = endDate;

  await loadReportData();

  const weekOptions = getCurrentWeekDayOptions()
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join("");

  container.innerHTML = `
    <div class="reports-container rp">
      <div class="rp-head">
        <div class="rp-head-text">
          <h1>Laporan Keuangan</h1>
          <p class="rp-range" id="report-range" aria-live="polite"></p>
        </div>
        <button type="button" class="btn-primary rp-export" id="export-pdf-btn">
          <i class="fas fa-file-pdf" aria-hidden="true"></i> Export PDF
        </button>
      </div>

      <div class="rp-period" role="group" aria-label="Periode laporan">
        <button type="button" class="period-btn" data-period="week" aria-pressed="false">Minggu Ini</button>
        <button type="button" class="period-btn active" data-period="month" aria-pressed="true">Bulan Ini</button>
        <button type="button" class="period-btn" data-period="year" aria-pressed="false">Tahun Ini</button>
        <button type="button" class="period-btn" data-period="custom" aria-pressed="false">Pilih Tanggal</button>
      </div>
      <div class="rp-custom" id="report-custom-date-group" style="display: none;">
        <select id="filter-report-day" class="filter-select" aria-label="Tanggal">
          <option value="all">Semua tanggal minggu ini</option>
          ${weekOptions}
        </select>
        <select id="filter-report-month" class="filter-select" aria-label="Bulan" disabled>
          <option value="${new Date().getMonth() + 1}" selected>${MONTH_NAMES_FULL[new Date().getMonth()]} (bulan ini)</option>
        </select>
        <select id="filter-report-year" class="filter-select" aria-label="Tahun" disabled>
          <option value="${new Date().getFullYear()}" selected>${new Date().getFullYear()} (tahun ini)</option>
        </select>
      </div>
      <p class="rp-help" id="report-custom-date-help" style="display: none;">
        Laporan hanya bisa ditampilkan untuk periode berjalan (minggu, bulan, dan tahun ini).
      </p>

      <section class="rp-panel rp-summary" aria-label="Ringkasan periode">
        <div class="rp-balance">
          <span class="rp-label">Saldo Akhir <small>(pemasukan − pengeluaran)</small></span>
          <span class="rp-balance-value" id="total-balance">Rp 0</span>
        </div>
        <dl class="rp-flows">
          <div>
            <dt><span class="rp-dot in" aria-hidden="true"></span>Total Pemasukan</dt>
            <dd id="total-income">Rp 0</dd>
          </div>
          <div>
            <dt><span class="rp-dot out" aria-hidden="true"></span>Total Pengeluaran</dt>
            <dd id="total-expense">Rp 0</dd>
          </div>
          <div>
            <dt><span class="rp-dot save" aria-hidden="true"></span>Total Ditabung</dt>
            <dd id="total-saving">Rp 0</dd>
          </div>
        </dl>
      </section>

      <div class="rp-grid">
        <section class="rp-panel" aria-labelledby="rp-cat-title">
          <h2 id="rp-cat-title">Kategori Pengeluaran</h2>
          <div id="rp-categories"></div>
        </section>
        <section class="rp-panel" aria-labelledby="rp-trend-title">
          <h2 id="rp-trend-title">Arus Kas <span id="rp-trend-unit"></span></h2>
          <div id="rp-trend"></div>
        </section>
      </div>

      <section class="rp-panel" aria-labelledby="rp-tx-title">
        <h2 id="rp-tx-title">Detail Transaksi</h2>
        <div id="rp-tx"></div>
      </section>
    </div>
  `;

  addReportStyles();
  setupReportEventListeners();
  await renderReportData();
}

// Load report data
async function loadReportData() {
  reportData.transactions = await getTransactionsByDateRange(
    reportData.startDate,
    reportData.endDate,
  );
  reportData.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Transaksi banyak (isMultiItem): kembalikan daftar barang, selain itu null.
// Item: { itemName, amount (harga satuan), quantity, category }
function getMultiItems(t) {
  if (t && t.isMultiItem === true && Array.isArray(t.items) && t.items.length) {
    return t.items;
  }
  return null;
}

// Render all report data
async function renderReportData() {
  const transactions = reportData.transactions;

  let totalIncome = 0;
  let totalExpense = 0;
  let totalSaving = 0;
  transactions.forEach((t) => {
    if (t.type === "income") totalIncome += t.amount;
    else if (t.type === "saving") totalSaving += t.amount;
    else totalExpense += t.amount;
  });
  const balance = totalIncome - totalExpense;

  document.getElementById("total-income").textContent =
    formatCurrency(totalIncome);
  document.getElementById("total-expense").textContent =
    formatCurrency(totalExpense);
  document.getElementById("total-saving").textContent =
    formatCurrency(totalSaving);
  const balanceEl = document.getElementById("total-balance");
  balanceEl.textContent = formatCurrency(balance);
  balanceEl.classList.toggle("neg", balance < 0);

  const rangeEl = document.getElementById("report-range");
  if (rangeEl) {
    rangeEl.textContent =
      reportData.startDate === reportData.endDate
        ? formatDate(reportData.startDate)
        : `${formatDate(reportData.startDate)} – ${formatDate(reportData.endDate)}`;
  }

  renderCategoryBreakdown(transactions);
  renderTrend(transactions);
  renderTransactionList(transactions);
}

// Rincian pengeluaran per kategori: batang proporsional (CSS, tanpa library grafik)
const CATEGORY_LIMIT = 8;
function renderCategoryBreakdown(transactions) {
  const el = document.getElementById("rp-categories");
  if (!el) return;

  const totals = {};
  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      const multi = getMultiItems(t);
      if (multi) {
        // Transaksi banyak: hitung per kategori barang, bukan satu kategori induk
        multi.forEach((it) => {
          const c = it.category || "Lainnya";
          totals[c] = (totals[c] || 0) + it.amount * it.quantity;
        });
        return;
      }
      const c = t.category || "Lainnya";
      totals[c] = (totals[c] || 0) + t.amount;
    });

  let rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) {
    el.innerHTML = '<p class="rp-empty">Belum ada pengeluaran pada periode ini.</p>';
    return;
  }
  const grand = rows.reduce((s, r) => s + r[1], 0);
  if (rows.length > CATEGORY_LIMIT) {
    const rest = rows.slice(CATEGORY_LIMIT - 1);
    rows = rows.slice(0, CATEGORY_LIMIT - 1);
    rows.push([
      `${rest.length} kategori lainnya`,
      rest.reduce((s, r) => s + r[1], 0),
    ]);
  }
  const max = rows[0][1] > 0 ? Math.max(...rows.map((r) => r[1])) : 1;

  el.innerHTML = `<ol class="rp-cats">${rows
    .map(([name, amount]) => {
      const share = grand > 0 ? (amount / grand) * 100 : 0;
      const width = max > 0 ? Math.max((amount / max) * 100, 1) : 0;
      return `
        <li>
          <div class="rp-cat-top">
            <span class="rp-cat-name">${escapeHtml(name)}</span>
            <span class="rp-cat-val">${formatCurrency(amount)} <small>${share.toFixed(1)}%</small></span>
          </div>
          <div class="rp-meter" aria-hidden="true"><span style="width:${width}%"></span></div>
        </li>`;
    })
    .join("")}</ol>`;
}

// Arus kas per hari (minggu/bulan/hari) atau per bulan (tahun): pasangan batang
// pemasukan & pengeluaran. Tap/klik batang untuk melihat nominalnya.
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function buildBuckets() {
  const parse = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const start = parse(reportData.startDate);
  const end = parse(reportData.endDate);
  const buckets = [];
  if (currentReportPeriod === "year") {
    for (let m = 0; m < 12; m++) {
      buckets.push({
        key: `${start.getFullYear()}-${String(m + 1).padStart(2, "0")}`,
        label: MONTHS_SHORT[m],
        full: `${MONTH_NAMES_FULL[m]} ${start.getFullYear()}`,
        income: 0,
        expense: 0,
      });
    }
    return { buckets, unit: "per bulan", keyLen: 7 };
  }
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = formatDateToYYYYMMDD(d);
    buckets.push({
      key,
      label:
        end - start <= 6 * 86400000
          ? `${DAY_NAMES_SHORT[d.getDay()]} ${d.getDate()}`
          : String(d.getDate()),
      full: formatDate(key),
      income: 0,
      expense: 0,
    });
  }
  return { buckets, unit: "per hari", keyLen: 10 };
}

function renderTrend(transactions) {
  const el = document.getElementById("rp-trend");
  const unitEl = document.getElementById("rp-trend-unit");
  if (!el) return;

  const { buckets, unit, keyLen } = buildBuckets();
  if (unitEl) unitEl.textContent = buckets.length > 1 ? `(${unit})` : "";

  const index = new Map(buckets.map((b, i) => [b.key, i]));
  transactions.forEach((t) => {
    if (t.type !== "income" && t.type !== "expense") return;
    const i = index.get(String(t.date).substring(0, keyLen));
    if (i !== undefined) buckets[i][t.type] += t.amount;
  });

  const max = Math.max(1, ...buckets.map((b) => Math.max(b.income, b.expense)));
  if (buckets.every((b) => b.income === 0 && b.expense === 0)) {
    el.innerHTML = '<p class="rp-empty">Belum ada pemasukan atau pengeluaran pada periode ini.</p>';
    return;
  }

  const n = buckets.length;
  const tickEvery = n <= 12 ? 1 : 5;
  const bars = buckets
    .map((b, i) => {
      const label = `${b.full}: pemasukan ${formatCurrency(b.income)}, pengeluaran ${formatCurrency(b.expense)}`;
      return `
        <button type="button" class="rp-bucket" data-i="${i}" aria-pressed="false" aria-label="${escapeHtml(label)}">
          <span class="rp-bars">
            <span class="rp-bar in" style="height:${(b.income / max) * 100}%"></span>
            <span class="rp-bar out" style="height:${(b.expense / max) * 100}%"></span>
          </span>
          <span class="rp-tick">${i % tickEvery === 0 || i === n - 1 ? escapeHtml(b.label) : ""}</span>
        </button>`;
    })
    .join("");

  el.innerHTML = `
    <div class="rp-legend">
      <span><span class="rp-dot in" aria-hidden="true"></span>Pemasukan</span>
      <span><span class="rp-dot out" aria-hidden="true"></span>Pengeluaran</span>
      <span class="rp-scale">Tertinggi ${formatCurrency(max)}</span>
    </div>
    <div class="rp-trend" style="--cols:${n}">${bars}</div>
    <p class="rp-readout" id="rp-readout" aria-live="polite">${n > 1 ? "Pilih batang untuk melihat nominalnya." : ""}</p>`;

  const readout = el.querySelector("#rp-readout");
  const select = (i) => {
    const b = buckets[i];
    el.querySelectorAll(".rp-bucket").forEach((btn) =>
      btn.setAttribute("aria-pressed", String(Number(btn.dataset.i) === i)),
    );
    readout.textContent = `${b.full} — Pemasukan ${formatCurrency(b.income)} · Pengeluaran ${formatCurrency(b.expense)}`;
  };
  el.querySelectorAll(".rp-bucket").forEach((btn) =>
    btn.addEventListener("click", () => select(Number(btn.dataset.i))),
  );
  if (n === 1) select(0);
}

// Daftar transaksi: baris rata dengan nominal di kanan
const TX_PAGE_SIZE = 50;
let txVisibleCount = TX_PAGE_SIZE;
const TYPE_LABEL = { income: "Pemasukan", saving: "Tabungan", expense: "Pengeluaran" };

function renderTransactionList(transactions) {
  const el = document.getElementById("rp-tx");
  if (!el) return;

  if (transactions.length === 0) {
    el.innerHTML = '<p class="rp-empty">Tidak ada transaksi pada periode ini.</p>';
    return;
  }

  const shown = transactions.slice(0, txVisibleCount);
  const rows = shown
    .map((t) => {
      const multi = getMultiItems(t);
      const type = t.type === "income" || t.type === "saving" ? t.type : "expense";
      const sign = type === "income" ? "+" : type === "expense" ? "-" : "";
      const subItems = multi
        ? `<ul class="rp-sub">${multi
            .map(
              (it) => `
          <li>
            <span>${escapeHtml(it.itemName)} <small>${it.quantity} × ${formatCurrency(it.amount)} · ${escapeHtml(it.category || "-")}</small></span>
            <span>${formatCurrency(it.amount * it.quantity)}</span>
          </li>`,
            )
            .join("")}</ul>`
        : "";
      return `
        <li class="rp-tx ${type}">
          <div class="rp-tx-main">
            <div class="rp-tx-text">
              <span class="rp-tx-name">${escapeHtml(t.itemName)}${multi ? ` <small>(${multi.length} barang)</small>` : ""}</span>
              <span class="rp-tx-meta">${formatDate(t.date)} · ${escapeHtml(multi ? "Beberapa kategori" : t.category || "-")} · ${TYPE_LABEL[type]}</span>
            </div>
            <span class="rp-tx-amt">${sign}${formatCurrency(t.amount)}</span>
          </div>
          ${subItems}
        </li>`;
    })
    .join("");

  const more =
    transactions.length > shown.length
      ? `<div class="rp-more">
           <span>Menampilkan ${shown.length} dari ${transactions.length} transaksi</span>
           <button type="button" class="btn-secondary" id="rp-more-btn">Tampilkan lebih banyak</button>
         </div>`
      : "";

  el.innerHTML = `<ul class="rp-txlist">${rows}</ul>${more}`;
  el.querySelector("#rp-more-btn")?.addEventListener("click", () => {
    txVisibleCount += TX_PAGE_SIZE;
    renderTransactionList(reportData.transactions);
  });
}

// Setup event listeners
function setupReportEventListeners() {
  const customDateGroup = document.getElementById("report-custom-date-group");
  const customDateHelp = document.getElementById("report-custom-date-help");
  const filterReportDay = document.getElementById("filter-report-day");

  document.querySelectorAll(".period-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".period-btn").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      currentReportPeriod = btn.dataset.period;

      // Tampilkan/sembunyikan panel filter tanggal custom
      const isCustom = currentReportPeriod === "custom";
      if (customDateGroup)
        customDateGroup.style.display = isCustom ? "grid" : "none";
      if (customDateHelp)
        customDateHelp.style.display = isCustom ? "block" : "none";

      // Reset pilihan tanggal setiap kali pindah/membuka filter custom
      customFilters.day = "all";
      if (filterReportDay) filterReportDay.value = "all";
      txVisibleCount = TX_PAGE_SIZE;

      const { startDate, endDate } = getDateRange(
        currentReportPeriod,
        customFilters.day,
      );
      reportData.startDate = startDate;
      reportData.endDate = endDate;

      await loadReportData();
      await renderReportData();
    });
  });

  // Filter tanggal spesifik (hanya bisa dari minggu ini)
  if (filterReportDay) {
    filterReportDay.addEventListener("change", async (e) => {
      customFilters.day = e.target.value;
      txVisibleCount = TX_PAGE_SIZE;

      const { startDate, endDate } = getDateRange("custom", customFilters.day);
      reportData.startDate = startDate;
      reportData.endDate = endDate;

      await loadReportData();
      await renderReportData();
    });
  }

  const exportBtn = document.getElementById("export-pdf-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => exportToPDF());
  }
}

// Export to PDF
async function exportToPDF() {
  showToast("Membuat PDF...", "info");

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    const W = 210; // A4 width mm
    const ML = 8; // margin left
    const MR = 8; // margin right
    const CW = W - ML - MR; // content width

    const transactions = reportData.transactions;
    let totalIncome = 0,
      totalExpense = 0,
      totalSaving = 0;
    transactions.forEach((t) => {
      if (t.type === "income") totalIncome += t.amount;
      else if (t.type === "saving") totalSaving += t.amount;
      else totalExpense += t.amount;
    });

    // Ambil data dompet untuk ditampilkan di kolom "Dompet"
    const wallets = await getAllItems(STORES.WALLETS);
    const walletNameMap = {};
    wallets.forEach((w) => {
      walletNameMap[w.id] = w.name;
    });
    const getWalletName = (walletId) =>
      walletNameMap[walletId] || "Dompet Lain";

    // ── HEADER ──────────────────────────────────────
    doc.setFillColor(26, 26, 46);
    doc.rect(0, 0, W, 28, "F");

    // Load logo aplikasi
    try {
      const logoUrl =
        window.location.origin + "/moneymanagement/images/logo/logo.png";
      const logoData = await loadImageAsBase64(logoUrl);
      doc.addImage(logoData, "PNG", ML, 6, 16, 16);
    } catch {
      doc.setFillColor(59, 130, 246);
      doc.circle(ML + 6, 14, 6, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("H", ML + 4.8, 16);
    }

    // Nama app
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Hylim", ML + 16, 12);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 190, 210);
    doc.text("Laporan Keuangan Pribadi", ML + 16, 18);

    // Tanggal cetak
    doc.setFontSize(7);
    doc.setTextColor(180, 190, 210);
    const printDate = new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    doc.text(`Dicetak: ${printDate}`, W - MR, 12, { align: "right" });
    const periodeLabel =
      reportData.startDate === reportData.endDate
        ? `Tanggal: ${formatDate(reportData.startDate)}`
        : `Periode: ${formatDate(reportData.startDate)} - ${formatDate(reportData.endDate)}`;
    doc.text(periodeLabel, W - MR, 18, { align: "right" });

    let y = 36;

    // ── RINGKASAN ────────────────────────────────────
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 50);
    doc.text("RINGKASAN", ML, y);
    y += 5;

    const boxW = (CW - 9) / 4;
    const boxes = [
      {
        label: "Total Pemasukan",
        value: formatCurrency(totalIncome),
        r: 34,
        g: 197,
        b: 94,
      },
      {
        label: "Total Pengeluaran",
        value: formatCurrency(totalExpense),
        r: 239,
        g: 68,
        b: 68,
      },
      {
        label: "Total Ditabung",
        value: formatCurrency(totalSaving),
        r: 139,
        g: 92,
        b: 246,
      },
      {
        label: "Saldo Akhir",
        value: formatCurrency(totalIncome - totalExpense),
        r: 59,
        g: 130,
        b: 246,
      },
    ];

    boxes.forEach((box, i) => {
      const bx = ML + i * (boxW + 3);
      doc.setFillColor(box.r, box.g, box.b);
      doc.roundedRect(bx, y, boxW, 16, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(box.label, bx + boxW / 2, y + 5, { align: "center" });
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(box.value, bx + boxW / 2, y + 12, { align: "center" });
    });

    y += 22;

    // ── TABEL TRANSAKSI ───────────────────────────────
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 50);
    doc.text("DETAIL TRANSAKSI", ML, y);
    y += 5;

    // Header tabel
    const cols = {
      date: { x: ML, w: 20 },
      name: { x: ML + 20, w: 62 },
      cat: { x: ML + 82, w: 28 },
      wallet: { x: ML + 110, w: 30 },
      amount: { x: ML + 140, w: 54 },
    };

    doc.setFillColor(26, 26, 46);
    doc.rect(ML, y, CW, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("Tanggal", cols.date.x + 1, y + 4.5);
    doc.text("Keterangan", cols.name.x + 1, y + 4.5);
    doc.text("Kategori", cols.cat.x + 1, y + 4.5);
    doc.text("Dompet", cols.wallet.x + 1, y + 4.5);
    doc.text("Nominal", cols.amount.x + cols.amount.w - 1, y + 4.5, {
      align: "right",
    });
    y += 8;

    // Baris transaksi
    doc.setFont("helvetica", "normal");
    transactions.forEach((t, idx) => {
      // Hitung dulu apakah baris ini punya catatan, supaya tinggi baris
      // (dan cek page-break) memperhitungkan baris catatan tambahan.
      const noteText = (t.note || "").trim();
      const noteFontSize = 6.3;
      const noteLineHeight = 3;
      let noteLines = [];
      if (noteText) {
        doc.setFontSize(noteFontSize);
        doc.setFont("helvetica", "italic");
        noteLines = doc.splitTextToSize(`Catatan: ${noteText}`, CW - 10);
        doc.setFont("helvetica", "normal");
      }
      const mainRowHeight = 6.5;
      const multiItems = getMultiItems(t);
      const itemLineHeight = 4.2;
      const itemBlockHeight = multiItems
        ? multiItems.length * itemLineHeight + 1
        : 0;
      const noteBlockHeight = noteLines.length
        ? noteLines.length * noteLineHeight + 2
        : 0;
      const totalRowHeight = mainRowHeight + itemBlockHeight + noteBlockHeight;

      if (y + totalRowHeight > 280) {
        doc.addPage();
        y = 15;
        // Repeat header
        doc.setFillColor(26, 26, 46);
        doc.rect(ML, y, CW, 7, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.text("Tanggal", cols.date.x + 1, y + 4.5);
        doc.text("Keterangan", cols.name.x + 1, y + 4.5);
        doc.text("Kategori", cols.cat.x + 1, y + 4.5);
        doc.text("Dompet", cols.wallet.x + 1, y + 4.5);
        doc.text("Nominal", cols.amount.x + cols.amount.w - 1, y + 4.5, {
          align: "right",
        });
        y += 8;
        doc.setFont("helvetica", "normal");
      }

      // Zebra stripe (mencakup baris utama + baris catatan kalau ada)
      if (idx % 2 === 0) {
        doc.setFillColor(248, 249, 252);
        doc.rect(ML, y - 1, CW, totalRowHeight, "F");
      }

      doc.setFontSize(7);
      doc.setTextColor(40, 40, 60);

      // Tanggal
      doc.text(formatDate(t.date), cols.date.x + 1, y + 3.5);

      // Keterangan (potong kalau terlalu panjang, max width 78mm)
      const nameStr = t.itemName || "-";
      const nameTrunc =
        doc.getTextWidth(nameStr) > cols.name.w - 2
          ? nameStr.substring(
              0,
              Math.floor(
                (cols.name.w - 4) /
                  (doc.getTextWidth(nameStr) / nameStr.length),
              ),
            ) + "…"
          : nameStr;
      doc.text(nameTrunc, cols.name.x + 1, y + 3.5);

      // Kategori
      const catStr = (multiItems ? "Beberapa" : t.category || "-").substring(
        0,
        14,
      );
      doc.text(catStr, cols.cat.x + 1, y + 3.5);

      // Dompet / sumber uang
      doc.setTextColor(40, 40, 60);
      const walletStr = getWalletName(t.walletId).substring(0, 16);
      doc.text(walletStr, cols.wallet.x + 1, y + 3.5);

      // Nominal (rata kanan, warna sesuai tipe)
      if (t.type === "income") doc.setTextColor(16, 185, 129);
      else if (t.type === "saving") doc.setTextColor(139, 92, 246);
      else doc.setTextColor(239, 68, 68);
      const amountStr = `${t.type === "income" ? "+" : "-"} ${formatCurrency(t.amount)}`;
      doc.text(amountStr, cols.amount.x + cols.amount.w - 1, y + 3.5, {
        align: "right",
      });

      y += mainRowHeight;

      // Transaksi banyak: rincian tiap barang (nama, kategori, jumlah × harga, subtotal)
      if (multiItems) {
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        multiItems.forEach((it) => {
          doc.setTextColor(90, 90, 110);
          let itemName = `- ${it.itemName || "-"}`;
          const maxW = cols.name.w - 4;
          if (doc.getTextWidth(itemName) > maxW) {
            itemName =
              itemName.substring(
                0,
                Math.floor(
                  maxW / (doc.getTextWidth(itemName) / itemName.length),
                ) - 1,
              ) + "…";
          }
          doc.text(itemName, cols.name.x + 4, y + 2);
          doc.text(
            (it.category || "-").substring(0, 14),
            cols.cat.x + 1,
            y + 2,
          );
          doc.text(
            `${it.quantity} x ${formatCurrency(it.amount)}`,
            cols.wallet.x + 1,
            y + 2,
          );
          doc.text(
            formatCurrency(it.amount * it.quantity),
            cols.amount.x + cols.amount.w - 1,
            y + 2,
            { align: "right" },
          );
          y += itemLineHeight;
        });
        y += 1;
      }

      // Catatan transaksi: ditampilkan sebagai baris tambahan di bawah baris
      // utama, teks panjang otomatis di-split ke beberapa baris & rata
      // kiri-kanan (justify), supaya tetap rapi walau catatannya panjang.
      if (noteLines.length) {
        doc.setFontSize(noteFontSize);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(120, 120, 140);
        doc.text(noteLines[0], ML + 3, y + 2, {
          maxWidth: CW - 10,
          align: noteLines.length > 1 ? "justify" : "left",
        });
        for (let li = 1; li < noteLines.length; li++) {
          doc.text(noteLines[li], ML + 6, y + 2 + li * noteLineHeight, {
            maxWidth: CW - 12,
            align: li < noteLines.length - 1 ? "justify" : "left",
          });
        }
        doc.setFont("helvetica", "normal");
        y += noteBlockHeight;
      }
    });

    // ── FOOTER ───────────────────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 170);
      doc.text(`Hylim — Laporan Keuangan Pribadi`, ML, 292);
      doc.text(`Halaman ${i} dari ${pageCount}`, W - MR, 292, {
        align: "right",
      });
    }

    const result = await savePdf(
      doc,
      `laporan_keuangan_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
    if (result !== "cancelled") showToast("PDF berhasil diunduh!", "success");
  } catch (error) {
    console.error("PDF error:", error);
    showToast(
      "Gagal membuat atau menyimpan PDF. Pastikan koneksi internet aktif.",
      "error",
    );
  }
}

// Add styles
function addReportStyles() {
  if (document.getElementById("report-styles")) return;

  const style = document.createElement("style");
  style.id = "report-styles";
  style.textContent = `
    .rp { max-width: 1100px; margin: 0 auto; padding-bottom: 24px; font-variant-numeric: tabular-nums; }
    .rp-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .rp-head h1 { font-size: 1.4rem; font-weight: 700; line-height: 1.2; }
    .rp-range { margin-top: 4px; font-size: .85rem; color: var(--text-secondary); }
    .rp-export { display: inline-flex; align-items: center; gap: 8px; }

    /* Pilihan periode: satu kontrol bersegmen */
    .rp-period { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background: var(--bg-secondary); margin-bottom: 12px; }
    .rp-period .period-btn { padding: 11px 6px; border: 0; border-left: 1px solid var(--border-color); background: transparent; color: var(--text-primary); font-size: .85rem; cursor: pointer; min-height: 44px; }
    .rp-period .period-btn:first-child { border-left: 0; }
    .rp-period .period-btn.active { background: var(--info); color: #fff; font-weight: 600; }
    .rp-custom { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
    .rp-custom .filter-select { width: 100%; }
    .rp-help { font-size: .75rem; color: var(--text-secondary); margin-bottom: 12px; }

    .rp-panel { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
    .rp-panel h2 { font-size: .95rem; font-weight: 600; margin-bottom: 12px; }
    .rp-panel h2 span { font-weight: 400; color: var(--text-secondary); font-size: .8rem; }
    .rp-empty { color: var(--text-secondary); font-size: .85rem; padding: 12px 0; }

    /* Ringkasan: saldo sebagai angka utama, tiga arus di bawahnya */
    .rp-summary { padding: 0; }
    .rp-balance { padding: 16px; border-bottom: 1px solid var(--border-color); }
    .rp-label { display: block; font-size: .8rem; color: var(--text-secondary); }
    .rp-label small { font-size: .72rem; }
    .rp-balance-value { display: block; margin-top: 4px; font-size: 1.9rem; font-weight: 700; line-height: 1.15; overflow-wrap: anywhere; }
    .rp-balance-value.neg { color: var(--danger); }
    .rp-flows { display: grid; grid-template-columns: repeat(3, 1fr); }
    .rp-flows > div { padding: 12px 16px; border-left: 1px solid var(--border-color); min-width: 0; }
    .rp-flows > div:first-child { border-left: 0; }
    .rp-flows dt { font-size: .75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; }
    .rp-flows dd { margin: 4px 0 0; font-size: 1.02rem; font-weight: 600; overflow-wrap: anywhere; }
    .rp-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; flex: none; margin-right: 6px; }
    .rp-flows .rp-dot { margin-right: 0; }
    .rp-dot.in { background: var(--success); }
    .rp-dot.out { background: var(--danger); }
    .rp-dot.save { background: var(--purple); }

    .rp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
    .rp-grid .rp-panel { margin-bottom: 16px; min-width: 0; }

    /* Kategori */
    .rp-cats { list-style: none; display: flex; flex-direction: column; gap: 12px; }
    .rp-cat-top { display: flex; justify-content: space-between; gap: 12px; font-size: .85rem; margin-bottom: 4px; }
    .rp-cat-name { min-width: 0; overflow-wrap: anywhere; }
    .rp-cat-val { font-weight: 600; white-space: nowrap; }
    .rp-cat-val small { font-weight: 400; color: var(--text-secondary); margin-left: 4px; }
    .rp-meter { height: 6px; background: var(--bg-primary); border-radius: 3px; overflow: hidden; }
    .rp-meter span { display: block; height: 100%; background: var(--danger); border-radius: 3px; }

    /* Arus kas */
    .rp-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .75rem; color: var(--text-secondary); margin-bottom: 8px; }
    .rp-legend .rp-scale { margin-left: auto; }
    .rp-trend { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 3px; }
    .rp-bucket { display: flex; flex-direction: column; align-items: stretch; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; border-radius: 4px; min-width: 0; }
    .rp-bars { display: flex; align-items: flex-end; justify-content: center; gap: 1px; height: 140px; border-bottom: 1px solid var(--border-color); padding: 0 1px; }
    .rp-bar { flex: 1; max-width: 14px; min-height: 0; border-radius: 2px 2px 0 0; }
    .rp-bar.in { background: var(--success); }
    .rp-bar.out { background: var(--danger); }
    .rp-tick { height: 16px; margin-top: 4px; font-size: .62rem; color: var(--text-secondary); text-align: center; white-space: nowrap; overflow: visible; }
    .rp-bucket[aria-pressed="true"] .rp-bars { background: var(--bg-primary); }
    .rp-bucket[aria-pressed="true"] .rp-tick { color: var(--text-primary); font-weight: 700; }
    .rp-readout { margin-top: 10px; min-height: 1.3em; font-size: .8rem; color: var(--text-secondary); overflow-wrap: anywhere; }

    /* Daftar transaksi */
    .rp-txlist { list-style: none; }
    .rp-tx { padding: 10px 0; border-top: 1px solid var(--border-color); }
    .rp-tx:first-child { border-top: 0; padding-top: 0; }
    .rp-tx-main { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .rp-tx-text { min-width: 0; }
    .rp-tx-name { display: block; font-size: .9rem; overflow-wrap: anywhere; }
    .rp-tx-name small { color: var(--text-secondary); font-size: .75rem; }
    .rp-tx-meta { display: block; margin-top: 2px; font-size: .75rem; color: var(--text-secondary); }
    .rp-tx-amt { font-weight: 600; font-size: .9rem; white-space: nowrap; }
    .rp-tx.income .rp-tx-amt { color: var(--success); }
    .rp-tx.expense .rp-tx-amt { color: var(--danger); }
    .rp-tx.saving .rp-tx-amt { color: var(--purple); }
    .rp-sub { list-style: none; margin: 6px 0 0 12px; padding-left: 10px; border-left: 2px solid var(--border-color); }
    .rp-sub li { display: flex; justify-content: space-between; gap: 12px; font-size: .78rem; padding: 2px 0; }
    .rp-sub small { display: block; color: var(--text-secondary); font-size: .7rem; }
    .rp-more { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color); font-size: .8rem; color: var(--text-secondary); }
    .rp-more .btn-secondary { padding: 8px 14px; border-radius: 8px; cursor: pointer; border: 0; min-height: 40px; }

    .rp .period-btn:focus-visible, .rp-bucket:focus-visible, .rp-export:focus-visible, .rp-more .btn-secondary:focus-visible, .rp-custom .filter-select:focus-visible {
      outline: 2px solid var(--info); outline-offset: 2px;
    }

    @media (max-width: 768px) {
      .rp-grid { grid-template-columns: 1fr; gap: 0; }
      .rp-balance-value { font-size: 1.6rem; }
      .rp-flows { grid-template-columns: 1fr; }
      .rp-flows > div { border-left: 0; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      .rp-flows > div:first-child { border-top: 0; }
      .rp-flows dd { margin: 0; text-align: right; }
      .rp-custom { grid-template-columns: 1fr; }
      .rp-export { width: 100%; justify-content: center; }
      .rp-bars { height: 110px; }
    }
  `;
  document.head.appendChild(style);
}

function loadImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
