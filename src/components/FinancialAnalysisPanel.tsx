import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  FileDown,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  FinanceEntry,
  SheetBookingRow,
  SheetFinanceRow,
  VALIDATION_LIMITS,
} from '../types/homestay';
import {
  formatDisplayDate,
  formatMYR,
  getTodayString,
  MALAY_MONTHS,
} from '../lib/dateUtils';
import {
  APPS_SCRIPT_TEMPLATE,
  appendFinanceToSheet,
  appendFinanceToWebhook,
  fetchSheetAllRows,
  fetchWebhookSheetRows,
} from '../lib/googleSheets';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { downloadFinanceReportPdf, printFinanceReport } from '../lib/financePdf';

interface FinancialAnalysisPanelProps {
  user: User | null;
  bookingAccessKey: string | null;
  sheetRows: SheetBookingRow[];
  sheetFinanceRows: SheetFinanceRow[];
  financeEntries: FinanceEntry[];
  financeLoading: boolean;
  sheetSourceMode: 'csv' | 'live-sheet' | 'apps-script';
  sheetsWebhookUrl: string | null;
  sheetsAccessToken: string | null;
  connectedSheetInfo: {
    spreadsheetId: string;
    spreadsheetTitle: string;
    tabTitle: string;
  } | null;
  onAppsScriptDataLoaded: (
    rows: SheetBookingRow[],
    financeRows: SheetFinanceRow[],
    spreadsheetTitle: string,
    tabTitle: string
  ) => void;
  onLiveDataLoaded: (
    rows: SheetBookingRow[],
    financeRows: SheetFinanceRow[],
    spreadsheetId: string,
    spreadsheetTitle: string,
    tabTitle: string
  ) => void;
}

interface UnifiedLedgerRow {
  id: string;
  sortOrder: number;
  date: string;
  perkara: string;
  wangMasuk: number;
  wangKeluar: number;
  source: 'google-sheet' | 'admin-web';
  firestoreEntry?: FinanceEntry;
}

function formatMonthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return yyyyMm;
  return `${MALAY_MONTHS[m - 1]} ${y}`;
}

export function FinancialAnalysisPanel({
  user,
  bookingAccessKey,
  sheetRows,
  sheetFinanceRows,
  financeEntries,
  financeLoading,
  sheetSourceMode,
  sheetsWebhookUrl,
  sheetsAccessToken,
  connectedSheetInfo,
  onAppsScriptDataLoaded,
  onLiveDataLoaded,
}: FinancialAnalysisPanelProps) {
  const todayStr = getTodayString();

  // Form states for adding Wang Keluar / Manual Wang Masuk
  const [entryType, setEntryType] = useState<'expense' | 'income'>('expense');
  const [entryDate, setEntryDate] = useState<string>(todayStr);
  const [perkaraInput, setPerkaraInput] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');
  const [savingEntry, setSavingEntry] = useState<boolean>(false);
  const [syncingEntryId, setSyncingEntryId] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [refreshingSheet, setRefreshingSheet] = useState<boolean>(false);

  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelNotice, setPanelNotice] = useState<string | null>(null);
  const [needsScriptUpgrade, setNeedsScriptUpgrade] = useState<boolean>(false);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [showScriptCode, setShowScriptCode] = useState<boolean>(false);

  // Filters
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Merge Google Sheet finance rows (JUMLAH / PERKARA / WANG KELUAR) with unsynced Firestore admin entries (deduplicated)
  const unifiedRows = useMemo<UnifiedLedgerRow[]>(() => {
    const rows: UnifiedLedgerRow[] = [];

    sheetFinanceRows.forEach((row, idx) => {
      rows.push({
        id: row.id,
        sortOrder: idx,
        date: row.date,
        perkara: row.perkara,
        wangMasuk: row.wangMasuk,
        wangKeluar: row.wangKeluar,
        source: 'google-sheet',
      });
    });

    // Include Firestore entries only if not already present in live Google Sheet
    financeEntries.forEach((entry, idx) => {
      const normalizedPerkara = entry.perkara.trim().toLowerCase();
      const alreadyInSheet = sheetFinanceRows.some((sRow) => {
        const sAmount = entry.entryType === 'expense' ? sRow.wangKeluar : sRow.wangMasuk;
        return (
          sRow.perkara.trim().toLowerCase() === normalizedPerkara &&
          Math.abs(sAmount - entry.amount) < 0.01 &&
          (!entry.date || !sRow.date || sRow.date === entry.date)
        );
      });

      if (!alreadyInSheet) {
        rows.push({
          id: `fs_${entry.id}`,
          sortOrder: sheetFinanceRows.length + idx,
          date: entry.date,
          perkara: entry.perkara,
          wangMasuk: entry.entryType === 'income' ? entry.amount : 0,
          wangKeluar: entry.entryType === 'expense' ? entry.amount : 0,
          source: 'admin-web',
          firestoreEntry: entry,
        });
      }
    });

    // Sort chronologically (oldest -> newest) so cumulative running Baki is accurate
    return rows.sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      return a.sortOrder - b.sortOrder;
    });
  }, [sheetFinanceRows, financeEntries]);

  // Available months dropdown options (all 12 months of active years + transaction counts)
  const monthOptions = useMemo(() => {
    const counts = new Map<string, number>();
    const years = new Set<number>([Number(todayStr.slice(0, 4)) || new Date().getFullYear()]);

    unifiedRows.forEach((r) => {
      if (r.date && r.date.length >= 7) {
        const key = r.date.slice(0, 7);
        counts.set(key, (counts.get(key) || 0) + 1);
        const y = Number(key.slice(0, 4));
        if (y >= 2020 && y <= 2100) years.add(y);
      }
    });

    const allKeys: string[] = [];
    Array.from(years)
      .sort((a, b) => b - a)
      .forEach((y) => {
        for (let m = 12; m >= 1; m--) {
          allKeys.push(`${y}-${String(m).padStart(2, '0')}`);
        }
      });

    return allKeys.map((key) => ({
      key,
      label: formatMonthLabel(key),
      count: counts.get(key) || 0,
    }));
  }, [unifiedRows, todayStr]);

  // Apply filters and compute cumulative running balance
  const ledgerWithBalance = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = unifiedRows.filter((row) => {
      if (monthFilter !== 'all' && !row.date.startsWith(monthFilter)) return false;
      if (typeFilter === 'income' && row.wangMasuk <= 0) return false;
      if (typeFilter === 'expense' && row.wangKeluar <= 0) return false;
      if (q) {
        const hay = `${row.perkara} ${row.date} ${row.wangMasuk} ${row.wangKeluar}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    let running = 0;
    return filtered.map((row) => {
      running = Math.round((running + row.wangMasuk - row.wangKeluar) * 100) / 100;
      return {
        ...row,
        runningBalance: running,
      };
    });
  }, [unifiedRows, monthFilter, typeFilter, searchQuery]);

  // Overall KPI metrics for current filter
  const kpis = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let incomeCount = 0;
    let expenseCount = 0;

    ledgerWithBalance.forEach((row) => {
      if (row.wangMasuk > 0) {
        totalIncome += row.wangMasuk;
        incomeCount++;
      }
      if (row.wangKeluar > 0) {
        totalExpense += row.wangKeluar;
        expenseCount++;
      }
    });

    totalIncome = Math.round(totalIncome * 100) / 100;
    totalExpense = Math.round(totalExpense * 100) / 100;
    const netBalance = Math.round((totalIncome - totalExpense) * 100) / 100;

    return {
      totalIncome,
      totalExpense,
      netBalance,
      incomeCount,
      expenseCount,
    };
  }, [ledgerWithBalance]);

  // Monthly breakdown for visual comparison chart
  const monthlySummary = useMemo(() => {
    const map = new Map<string, { monthKey: string; income: number; expense: number }>();

    unifiedRows.forEach((row) => {
      const key = row.date && row.date.length >= 7 ? row.date.slice(0, 7) : 'Lain-lain';
      const current = map.get(key) || { monthKey: key, income: 0, expense: 0 };
      current.income = Math.round((current.income + row.wangMasuk) * 100) / 100;
      current.expense = Math.round((current.expense + row.wangKeluar) * 100) / 100;
      map.set(key, current);
    });

    const list = Array.from(map.values())
      .map((item) => ({
        ...item,
        balance: Math.round((item.income - item.expense) * 100) / 100,
      }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

    const maxVal = list.reduce((m, item) => Math.max(m, item.income, item.expense), 0);
    return { list, maxVal: maxVal > 0 ? maxVal : 1 };
  }, [unifiedRows]);

  // Count older booking rows in Google Sheet that don't have JUMLAH filled yet
  const bookingsWithoutJumlahCount = useMemo(
    () => sheetRows.filter((r) => r.totalAmount === undefined).length,
    [sheetRows]
  );

  const handleRefreshFromSheet = async () => {
    setRefreshingSheet(true);
    setPanelError(null);
    setPanelNotice(null);
    try {
      if (sheetsWebhookUrl) {
        const res = await fetchWebhookSheetRows(sheetsWebhookUrl);
        onAppsScriptDataLoaded(res.rows, res.financeRows, res.title, res.tab);
        setPanelNotice(
          `Data kewangan Google Sheet disegar semula (${res.financeRows.length} rekod kewangan aktif).`
        );
      } else if (sheetsAccessToken && connectedSheetInfo && sheetSourceMode === 'live-sheet') {
        const res = await fetchSheetAllRows(
          connectedSheetInfo.spreadsheetId,
          connectedSheetInfo.tabTitle,
          sheetsAccessToken
        );
        onLiveDataLoaded(
          res.rows,
          res.financeRows,
          connectedSheetInfo.spreadsheetId,
          connectedSheetInfo.spreadsheetTitle,
          connectedSheetInfo.tabTitle
        );
        setPanelNotice(
          `Data kewangan Google Sheet disegar semula (${res.financeRows.length} rekod kewangan aktif).`
        );
      }
    } catch (err) {
      setPanelError(
        err instanceof Error ? err.message : 'Gagal menyegar semula data Google Sheet.'
      );
    } finally {
      setRefreshingSheet(false);
    }
  };

  const syncFinanceEntryToSheet = async (entry: FinanceEntry) => {
    setSyncingEntryId(entry.id);
    setPanelError(null);
    setNeedsScriptUpgrade(false);
    try {
      if (sheetsWebhookUrl) {
        const res = await appendFinanceToWebhook(sheetsWebhookUrl, {
          date: entry.date,
          entryType: entry.entryType,
          perkara: entry.perkara,
          amount: entry.amount,
        });
        onAppsScriptDataLoaded(res.rows, res.financeRows, res.title, res.tab);
        await updateDoc(doc(db, 'finance_entries', entry.id), {
          syncedToSheet: true,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
        setPanelNotice(
          `Rekod "${entry.perkara}" (${formatMYR(entry.amount)}) telah berjaya disimpan ke Google Sheet.`
        );
      } else if (sheetsAccessToken && connectedSheetInfo && sheetSourceMode === 'live-sheet') {
        await appendFinanceToSheet(
          connectedSheetInfo.spreadsheetId,
          connectedSheetInfo.tabTitle,
          sheetsAccessToken,
          {
            date: entry.date,
            entryType: entry.entryType,
            perkara: entry.perkara,
            amount: entry.amount,
          }
        );
        const refreshed = await fetchSheetAllRows(
          connectedSheetInfo.spreadsheetId,
          connectedSheetInfo.tabTitle,
          sheetsAccessToken
        );
        onLiveDataLoaded(
          refreshed.rows,
          refreshed.financeRows,
          connectedSheetInfo.spreadsheetId,
          connectedSheetInfo.spreadsheetTitle,
          connectedSheetInfo.tabTitle
        );
        await updateDoc(doc(db, 'finance_entries', entry.id), {
          syncedToSheet: true,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
        setPanelNotice(
          `Rekod "${entry.perkara}" (${formatMYR(entry.amount)}) telah berjaya disimpan ke Google Sheet.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghantar rekod ke Google Sheet.';
      if (msg.includes('APPS_SCRIPT_NEEDS_9COL_UPGRADE')) {
        setNeedsScriptUpgrade(true);
        setPanelError(msg.replace('APPS_SCRIPT_NEEDS_9COL_UPGRADE: ', ''));
      } else {
        setPanelError(msg);
      }
    } finally {
      setSyncingEntryId(null);
    }
  };

  const handleSubmitFinanceEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setPanelError(null);
    setPanelNotice(null);
    setNeedsScriptUpgrade(false);

    if (!bookingAccessKey) {
      setPanelError('Sila buka kunci Admin terlebih dahulu.');
      return;
    }

    const cleanPerkara = perkaraInput.trim();
    if (
      cleanPerkara.length < VALIDATION_LIMITS.PERKARA_MIN ||
      cleanPerkara.length > VALIDATION_LIMITS.PERKARA_MAX
    ) {
      setPanelError('Sila masukkan Perkara yang jelas (2 hingga 200 aksara).');
      return;
    }

    const parsedAmount = Number(amountInput.trim());
    if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0 ||
      parsedAmount > VALIDATION_LIMITS.AMOUNT_MAX
    ) {
      setPanelError('Sila masukkan jumlah yang sah (melebihi RM 0).');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
      setPanelError('Sila pilih tarikh transaksi yang sah.');
      return;
    }

    const cleanAmount = Math.round(parsedAmount * 100) / 100;
    const entryId = `fin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const actorId = user?.uid || 'admin_passcode';

    setSavingEntry(true);
    try {
      await setDoc(doc(collection(db, 'finance_entries'), entryId), {
        userId: actorId,
        date: entryDate,
        entryType,
        perkara: cleanPerkara,
        amount: cleanAmount,
        syncedToSheet: false,
        accessKey: bookingAccessKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const createdEntry: FinanceEntry = {
        id: entryId,
        userId: actorId,
        date: entryDate,
        entryType,
        perkara: cleanPerkara,
        amount: cleanAmount,
        syncedToSheet: false,
        accessKey: bookingAccessKey,
      };

      setPerkaraInput('');
      setAmountInput('');

      // Automatically push to Google Sheet if connected
      if (sheetsWebhookUrl || (sheetsAccessToken && connectedSheetInfo && sheetSourceMode === 'live-sheet')) {
        await syncFinanceEntryToSheet(createdEntry);
      } else {
        setPanelNotice(
          `Rekod ${entryType === 'expense' ? 'Wang Keluar' : 'Wang Masuk'} ("${cleanPerkara}") telah disimpan dalam Analisis Kewangan.`
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `finance_entries/${entryId}`);
    } finally {
      setSavingEntry(false);
    }
  };

  const handleDeleteFirestoreEntry = async (entry: FinanceEntry) => {
    setDeletingEntryId(entry.id);
    setPanelError(null);
    try {
      await deleteDoc(doc(db, 'finance_entries', entry.id));
      setPanelNotice(`Rekod "${entry.perkara}" telah dipadam daripada rekod web.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `finance_entries/${entry.id}`);
    } finally {
      setDeletingEntryId(null);
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      setPanelError('Tidak dapat menyalin secara automatik. Sila salin kod pada bahagian Integrasi Google Sheet di bawah.');
    }
  };

  const buildCurrentReportPayload = () => {
    const periodLabel = monthFilter === 'all' ? 'Semua Bulan' : formatMonthLabel(monthFilter);
    return {
      sheetTitle: connectedSheetInfo?.spreadsheetTitle || 'SISTEM BOOKING AI STUDIO',
      periodLabel,
      totalIncome: kpis.totalIncome,
      totalExpense: kpis.totalExpense,
      netBalance: kpis.netBalance,
      items: ledgerWithBalance.map((r) => ({
        date: r.date,
        perkara: r.perkara,
        sourceLabel: r.source === 'google-sheet' ? 'Google Sheet' : 'Rekod Admin',
        wangMasuk: r.wangMasuk,
        wangKeluar: r.wangKeluar,
        runningBalance: r.runningBalance,
      })),
    };
  };

  const handleDownloadPdf = async () => {
    await downloadFinanceReportPdf(buildCurrentReportPayload());
  };

  const handlePrintReport = async () => {
    await printFinanceReport(buildCurrentReportPayload());
  };

  const quickExpenseSuggestions = [
    'Bil Elektrik TNB',
    'Bil Air AKSB',
    'Cuci & Penyelenggaraan Kolam',
    'Upah Kemas Rumah & Dobi',
    'Barangan Asas & Sabun',
  ];

  return (
    <div
      id="analisis-kewangan"
      className="mt-10 bg-white border border-[#DDE2DC] rounded-2xl p-5 sm:p-7 scroll-mt-24"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 pb-6 border-b border-[#DDE2DC]">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-[#14532D]">
              <Wallet className="w-4 h-4" />
              <span>Analisis Kewangan Admin · Pautan Google Sheet</span>
            </div>
            <h3 className="font-display text-2xl sm:text-3xl font-semibold text-[#161B17]">
              Wang Masuk, Wang Keluar, Perkara &amp; Baki
            </h3>
            <p className="text-xs sm:text-sm text-[#525C54] leading-relaxed max-w-2xl">
              Diselaraskan terus dengan helaian{' '}
              <strong className="text-[#161B17]">
                {connectedSheetInfo?.spreadsheetTitle || 'SISTEM BOOKING AI STUDIO'}
              </strong>
              : kolum <strong className="text-[#14532D]">JUMLAH</strong> sebagai Wang Masuk, kolum{' '}
              <strong className="text-[#161B17]">PERKARA</strong> &amp;{' '}
              <strong className="text-[#991B1B]">WANG KELUAR</strong> sebagai perbelanjaan, serta kiraan{' '}
              <strong className="text-[#161B17]">Baki</strong> automatik.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefreshFromSheet}
            disabled={refreshingSheet}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#DDE2DC] bg-[#F8F9F7] text-xs font-semibold text-[#161B17] hover:border-[#14532D] hover:text-[#14532D] transition-colors cursor-pointer disabled:opacity-50 self-start shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingSheet ? 'animate-spin' : ''}`} />
            {refreshingSheet ? 'Menyelaras...' : 'Segar Semula Sheet'}
          </button>
        </div>

        {/* Dedicated Monthly Print & PDF Bar */}
        <div className="p-3.5 rounded-xl bg-[#F8F9F7] border border-[#DDE2DC] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
            <label
              htmlFor="print-month-select"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#161B17] whitespace-nowrap"
            >
              <Calendar className="w-4 h-4 text-[#14532D]" />
              Pilih Bulan Laporan / Cetakan:
            </label>
            <select
              id="print-month-select"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border border-[#C6DEC9] bg-white text-[#161B17] focus:outline-none focus:border-[#14532D] cursor-pointer sm:min-w-[230px]"
            >
              <option value="all">Semua Bulan ({unifiedRows.length} rekod)</option>
              {monthOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                  {opt.count > 0 ? ` (${opt.count} rekod)` : ' (Tiada rekod)'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handlePrintReport()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#14532D] bg-white text-[#14532D] text-xs font-semibold hover:bg-[#F1F7F3] transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak Laporan
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] transition-colors cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              Muat Turun PDF
            </button>
          </div>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-6 border-b border-[#DDE2DC]">
        <div className="p-4 rounded-xl bg-[#F1F7F3] border border-[#C6DEC9]">
          <div className="flex items-center justify-between text-xs font-medium text-[#14532D]">
            <span>Jumlah Wang Masuk</span>
            <ArrowDownLeft className="w-4 h-4" />
          </div>
          <p className="font-mono-tabular text-2xl font-bold text-[#14532D] mt-2">
            {formatMYR(kpis.totalIncome)}
          </p>
          <span className="block text-[11px] text-[#525C54] mt-1">
            Kolum JUMLAH · {kpis.incomeCount} transaksi
          </span>
        </div>

        <div className="p-4 rounded-xl bg-red-50/80 border border-red-200">
          <div className="flex items-center justify-between text-xs font-medium text-[#991B1B]">
            <span>Jumlah Wang Keluar</span>
            <ArrowUpRight className="w-4 h-4" />
          </div>
          <p className="font-mono-tabular text-2xl font-bold text-[#991B1B] mt-2">
            {formatMYR(kpis.totalExpense)}
          </p>
          <span className="block text-[11px] text-[#525C54] mt-1">
            Kolum WANG KELUAR · {kpis.expenseCount} transaksi
          </span>
        </div>

        <div
          className={`p-4 rounded-xl border ${
            kpis.netBalance >= 0
              ? 'bg-[#14532D] border-[#14532D] text-white'
              : 'bg-[#991B1B] border-[#7F1D1D] text-white'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-white/85">
            <span>Baki Semasa</span>
            <Wallet className="w-4 h-4" />
          </div>
          <p className="font-mono-tabular text-2xl font-bold mt-2">
            {formatMYR(kpis.netBalance)}
          </p>
          <span className="block text-[11px] text-white/80 mt-1">
            Wang Masuk − Wang Keluar
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#F8F9F7] border border-[#DDE2DC]">
          <div className="flex items-center justify-between text-xs font-medium text-[#525C54]">
            <span>Margin &amp; Ringkasan</span>
            <BarChart3 className="w-4 h-4 text-[#14532D]" />
          </div>
          <p className="font-mono-tabular text-2xl font-bold text-[#161B17] mt-2">
            {kpis.totalIncome > 0
              ? `${Math.round((kpis.netBalance / kpis.totalIncome) * 100)}%`
              : '—'}
          </p>
          <span className="block text-[11px] text-[#525C54] mt-1">
            {ledgerWithBalance.length} jumlah rekod dipaparkan
          </span>
        </div>
      </div>

      {/* Middle Section: Record Expense/Income Form (5 cols) + Monthly Visual Chart (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 py-6 border-b border-[#DDE2DC]">
        {/* Left: Add Financial Record Form */}
        <div className="lg:col-span-5 bg-[#F8F9F7] border border-[#DDE2DC] rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[#161B17]">
              Rekod Kewangan Baharu
            </h4>
            <div className="inline-flex p-0.5 bg-white rounded-lg border border-[#DDE2DC]">
              <button
                type="button"
                onClick={() => {
                  setEntryType('expense');
                  setPanelError(null);
                }}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                  entryType === 'expense'
                    ? 'bg-[#991B1B] text-white'
                    : 'text-[#525C54] hover:text-[#161B17]'
                }`}
              >
                Wang Keluar
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryType('income');
                  setPanelError(null);
                }}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                  entryType === 'income'
                    ? 'bg-[#14532D] text-white'
                    : 'text-[#525C54] hover:text-[#161B17]'
                }`}
              >
                Wang Masuk
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmitFinanceEntry} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="finance-date"
                  className="block text-xs font-semibold text-[#161B17] mb-1"
                >
                  Tarikh
                </label>
                <input
                  id="finance-date"
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm font-mono-tabular rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div>
                <label
                  htmlFor="finance-amount"
                  className="block text-xs font-semibold text-[#161B17] mb-1"
                >
                  {entryType === 'expense' ? 'Wang Keluar (RM)' : 'Wang Masuk (RM)'}
                </label>
                <input
                  id="finance-amount"
                  type="number"
                  required
                  min={0.01}
                  max={VALIDATION_LIMITS.AMOUNT_MAX}
                  step="any"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="Contoh: 150"
                  className="w-full px-3 py-2 text-xs sm:text-sm font-mono-tabular font-semibold rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] placeholder:text-[#9AA39C] placeholder:font-normal focus:outline-none focus:border-[#14532D]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="finance-perkara"
                className="block text-xs font-semibold text-[#161B17] mb-1"
              >
                Perkara
              </label>
              <input
                id="finance-perkara"
                type="text"
                required
                minLength={VALIDATION_LIMITS.PERKARA_MIN}
                maxLength={VALIDATION_LIMITS.PERKARA_MAX}
                value={perkaraInput}
                onChange={(e) => setPerkaraInput(e.target.value)}
                placeholder={
                  entryType === 'expense'
                    ? 'Contoh: Bil Elektrik TNB / Cuci Kolam / Beli Sabun'
                    : 'Contoh: Bayaran Tambahan / Sewa Tapak'
                }
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] placeholder:text-[#9AA39C] focus:outline-none focus:border-[#14532D]"
              />
            </div>

            {entryType === 'expense' && (
              <div className="flex flex-wrap gap-1.5">
                {quickExpenseSuggestions.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setPerkaraInput(label)}
                    className="px-2 py-1 text-[11px] rounded-md border border-[#DDE2DC] bg-white text-[#525C54] hover:border-[#14532D] hover:text-[#14532D] transition-colors cursor-pointer"
                  >
                    + {label}
                  </button>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={savingEntry}
              className={`w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                entryType === 'expense'
                  ? 'bg-[#991B1B] hover:bg-[#7F1D1D]'
                  : 'bg-[#14532D] hover:bg-[#166534]'
              }`}
            >
              <Plus className="w-4 h-4" />
              {savingEntry
                ? 'Menyimpan...'
                : entryType === 'expense'
                ? 'Rekod Wang Keluar & Hantar ke Sheet'
                : 'Rekod Wang Masuk & Hantar ke Sheet'}
            </button>
          </form>

          {panelNotice && (
            <div className="p-3 rounded-lg bg-[#F1F7F3] border border-[#84B395] flex items-start gap-2 text-xs text-[#14532D]">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{panelNotice}</span>
            </div>
          )}

          {panelError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-amber-50 border border-amber-300 space-y-2 text-xs text-amber-950"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                <span>{panelError}</span>
              </div>
              {needsScriptUpgrade && (
                <div className="pt-2 border-t border-amber-200 space-y-2">
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-amber-950 leading-relaxed">
                    <li>
                      Buka Google Sheet → <strong>Extensions → Apps Script</strong>.
                    </li>
                    <li>
                      Tekan <strong>Ctrl+A</strong> lalu <strong>Delete</strong> (padam <strong>SEMUA</strong> kod lama supaya tiada dua fungsi <code className="font-mono-tabular">doPost</code>).
                    </li>
                    <li>
                      Tampal kod 9-kolum baharu dan tekan <strong>Save (Ctrl+S)</strong>.
                    </li>
                    <li>
                      Klik <strong>Deploy → Manage deployments → ikon Pensel (Edit) → Version: New version → Deploy</strong>.
                    </li>
                  </ol>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyScript}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#161B17] text-white text-[11px] font-semibold hover:bg-black transition-colors cursor-pointer"
                    >
                      {copiedScript ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Kod 9-Kolum Disalin!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Salin Kod Apps Script 9-Kolum
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowScriptCode((v) => !v)}
                      className="text-[11px] font-semibold text-amber-900 underline cursor-pointer"
                    >
                      {showScriptCode ? 'Sembunyi Kod' : 'Lihat Kod Lengkap'}
                    </button>
                  </div>
                  {showScriptCode && (
                    <pre className="p-2.5 rounded-lg bg-white border border-amber-200 text-[10px] font-mono-tabular text-[#161B17] overflow-x-auto max-h-44">
                      {APPS_SCRIPT_TEMPLATE}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Monthly Breakdown Chart */}
        <div className="lg:col-span-7 bg-[#F8F9F7] border border-[#DDE2DC] rounded-xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h4 className="text-sm font-semibold text-[#161B17]">
                  Perbandingan Bulanan · Wang Masuk vs Wang Keluar
                </h4>
                <p className="text-[11px] text-[#525C54]">
                  Ringkasan aliran tunai mengikut bulan daripada rekod Google Sheet &amp; Admin
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-[#525C54]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#14532D] inline-block" />
                  Wang Masuk
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#991B1B] inline-block" />
                  Wang Keluar
                </span>
              </div>
            </div>

            {financeLoading && monthlySummary.list.length === 0 ? (
              <div className="space-y-3 animate-pulse py-4">
                <div className="h-10 rounded-lg bg-[#EBEFEB]" />
                <div className="h-10 rounded-lg bg-[#EBEFEB]" />
              </div>
            ) : monthlySummary.list.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#525C54] bg-white rounded-lg border border-[#DDE2DC]">
                Belum ada rekod jumlah wang masuk atau wang keluar. Isi tempahan atau rekod wang keluar untuk melihat analisis bulanan.
              </div>
            ) : (
              <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                {monthlySummary.list.map((m) => {
                  const inPct = Math.max(m.income > 0 ? 4 : 0, (m.income / monthlySummary.maxVal) * 100);
                  const outPct = Math.max(m.expense > 0 ? 4 : 0, (m.expense / monthlySummary.maxVal) * 100);
                  return (
                    <div
                      key={m.monthKey}
                      className="p-3 rounded-lg bg-white border border-[#DDE2DC] space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#161B17]">
                          {m.monthKey === 'Lain-lain' ? 'Tarikh Tidak Dinyatakan' : formatMonthLabel(m.monthKey)}
                        </span>
                        <span
                          className={`font-mono-tabular font-bold ${
                            m.balance >= 0 ? 'text-[#14532D]' : 'text-[#991B1B]'
                          }`}
                        >
                          Baki: {formatMYR(m.balance)}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="w-16 text-[#525C54] shrink-0">Masuk</span>
                          <div className="flex-1 h-2.5 bg-[#EFF2EE] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#14532D] rounded-full transition-all duration-300"
                              style={{ width: `${inPct}%` }}
                            />
                          </div>
                          <span className="w-24 text-right font-mono-tabular font-semibold text-[#14532D] shrink-0">
                            {formatMYR(m.income)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="w-16 text-[#525C54] shrink-0">Keluar</span>
                          <div className="flex-1 h-2.5 bg-[#EFF2EE] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#991B1B] rounded-full transition-all duration-300"
                              style={{ width: `${outPct}%` }}
                            />
                          </div>
                          <span className="w-24 text-right font-mono-tabular font-semibold text-[#991B1B] shrink-0">
                            {formatMYR(m.expense)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {bookingsWithoutJumlahCount > 0 && (
            <p className="text-[11px] text-[#525C54] mt-3 pt-3 border-t border-[#DDE2DC]">
              Nota: Terdapat <strong className="text-[#161B17]">{bookingsWithoutJumlahCount}</strong> rekod tempahan lama dalam Google Sheet yang tiada nilai pada kolum <strong className="text-[#161B17]">JUMLAH</strong> (tidak dikira dalam Wang Masuk sehingga diisi).
            </p>
          )}
        </div>
      </div>

      {/* Ledger Table Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#525C54] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari perkara atau nama..."
              aria-label="Cari transaksi kewangan"
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#DDE2DC] bg-[#F8F9F7] text-[#161B17] placeholder:text-[#9AA39C] focus:outline-none focus:border-[#14532D]"
            />
          </div>

          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            aria-label="Tapis bulan kewangan"
            className="px-2.5 py-1.5 text-xs rounded-lg border border-[#DDE2DC] bg-[#F8F9F7] text-[#161B17] cursor-pointer"
          >
            <option value="all">Semua Bulan ({unifiedRows.length} rekod)</option>
            {monthOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
                {opt.count > 0 ? ` (${opt.count})` : ''}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | 'income' | 'expense')}
            aria-label="Tapis jenis aliran tunai"
            className="px-2.5 py-1.5 text-xs rounded-lg border border-[#DDE2DC] bg-[#F8F9F7] text-[#161B17] cursor-pointer"
          >
            <option value="all">Semua Aliran (Masuk &amp; Keluar)</option>
            <option value="income">Wang Masuk Sahaja</option>
            <option value="expense">Wang Keluar Sahaja</option>
          </select>
        </div>

        <span className="font-mono-tabular text-xs text-[#525C54]">
          Memaparkan {ledgerWithBalance.length} transaksi
        </span>
      </div>

      {/* Ledger Table */}
      {ledgerWithBalance.length === 0 ? (
        <div className="py-8 text-center text-xs text-[#525C54] bg-[#F8F9F7] rounded-xl border border-[#DDE2DC]">
          Tiada rekod transaksi kewangan yang sepadan dengan penapis pilihan.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-[#DDE2DC] rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#F8F9F7] sticky top-0 z-10 border-b border-[#DDE2DC] text-[#525C54]">
              <tr>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Tarikh</th>
                <th className="py-2.5 px-3 font-semibold">Perkara / Rujukan</th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Sumber</th>
                <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Wang Masuk</th>
                <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Wang Keluar</th>
                <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Baki</th>
                <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBEFEB] bg-white">
              {ledgerWithBalance.map((row) => (
                <tr key={row.id} className="hover:bg-[#F8F9F7] transition-colors">
                  <td className="py-2.5 px-3 font-mono-tabular text-[#525C54] whitespace-nowrap">
                    {row.date ? formatDisplayDate(row.date) : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-[#161B17]">
                    {row.perkara}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {row.source === 'google-sheet' ? (
                      <span className="text-[11px] font-medium text-[#14532D]">
                        Google Sheet
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-amber-800">
                        Admin Web (Belum ke Sheet)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono-tabular font-semibold text-right whitespace-nowrap">
                    {row.wangMasuk > 0 ? (
                      <span className="text-[#14532D]">+ {formatMYR(row.wangMasuk)}</span>
                    ) : (
                      <span className="text-[#9AA39C] font-normal">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono-tabular font-semibold text-right whitespace-nowrap">
                    {row.wangKeluar > 0 ? (
                      <span className="text-[#991B1B]">- {formatMYR(row.wangKeluar)}</span>
                    ) : (
                      <span className="text-[#9AA39C] font-normal">—</span>
                    )}
                  </td>
                  <td
                    className={`py-2.5 px-3 font-mono-tabular font-bold text-right whitespace-nowrap ${
                      row.runningBalance >= 0 ? 'text-[#161B17]' : 'text-[#991B1B]'
                    }`}
                  >
                    {formatMYR(row.runningBalance)}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    {row.firestoreEntry ? (
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={syncingEntryId === row.firestoreEntry.id}
                          onClick={() => void syncFinanceEntryToSheet(row.firestoreEntry!)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#161B17] text-white text-[11px] font-medium hover:bg-black transition-colors cursor-pointer disabled:opacity-50"
                          title="Hantar rekod ini ke Google Sheet"
                        >
                          <Send className="w-3 h-3" />
                          {syncingEntryId === row.firestoreEntry.id ? 'Hantar...' : 'Ke Sheet'}
                        </button>
                        <button
                          type="button"
                          disabled={deletingEntryId === row.firestoreEntry.id}
                          onClick={() => void handleDeleteFirestoreEntry(row.firestoreEntry!)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-200 bg-red-50 text-[11px] font-medium text-red-700 hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50"
                          title="Padam rekod web ini"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[#9AA39C]">Terselaras</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[#F1F7F3] border-t-2 border-[#84B395] sticky bottom-0">
              <tr>
                <td colSpan={3} className="py-3 px-3 font-bold text-[#161B17]">
                  JUMLAH KESELURUHAN
                </td>
                <td className="py-3 px-3 font-mono-tabular font-bold text-right text-[#14532D] whitespace-nowrap">
                  {formatMYR(kpis.totalIncome)}
                </td>
                <td className="py-3 px-3 font-mono-tabular font-bold text-right text-[#991B1B] whitespace-nowrap">
                  {formatMYR(kpis.totalExpense)}
                </td>
                <td
                  className={`py-3 px-3 font-mono-tabular font-bold text-right whitespace-nowrap ${
                    kpis.netBalance >= 0 ? 'text-[#14532D]' : 'text-[#991B1B]'
                  }`}
                >
                  {formatMYR(kpis.netBalance)}
                </td>
                <td className="py-3 px-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
