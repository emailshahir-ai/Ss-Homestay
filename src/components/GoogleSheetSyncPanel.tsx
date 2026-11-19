import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  Copy,
  FileDown,
  FileSpreadsheet,
  Info,
  Link2,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { Booking, SheetBookingRow, SheetFinanceRow, UNIT_RATES, UnitType } from '../types/homestay';
import { formatDisplayDate, formatMYR, MALAY_MONTHS } from '../lib/dateUtils';
import { downloadSheetBookingPdf } from '../lib/bookingPdf';
import {
  APPS_SCRIPT_TEMPLATE,
  appendBookingToSheet,
  appendBookingToWebhook,
  extractSpreadsheetId,
  fetchSheetAllRows,
  fetchSpreadsheetMetadata,
  fetchWebhookSheetRows,
  isValidAppsScriptUrl,
} from '../lib/googleSheets';
import { signInWithGoogleSheets } from '../lib/firebase';

const STORAGE_SHEET_URL_KEY = 'ss_homestay_google_sheet_url';
const STORAGE_SHEET_TAB_KEY = 'ss_homestay_google_sheet_tab';

type ConnectionModeTab = 'apps-script' | 'oauth';

interface GoogleSheetSyncPanelProps {
  sheetRows: SheetBookingRow[];
  sheetSourceMode: 'csv' | 'live-sheet' | 'apps-script';
  sheetLoading: boolean;
  sheetsAccessToken: string | null;
  sheetsWebhookUrl: string | null;
  onSheetsTokenObtained: (token: string) => void;
  onLiveRowsLoaded: (
    rows: SheetBookingRow[],
    financeRows: SheetFinanceRow[],
    spreadsheetId: string,
    spreadsheetTitle: string,
    tabTitle: string
  ) => void;
  onAppsScriptRowsLoaded: (
    rows: SheetBookingRow[],
    financeRows: SheetFinanceRow[],
    spreadsheetTitle: string,
    tabTitle: string
  ) => void;
  onSaveWebhookUrl: (webhookUrl: string, sheetLabel: string) => Promise<void>;
  onClearWebhookUrl: () => Promise<void>;
  onResetToCsv: () => void;
  onJumpToCalendarDate: (dateStr: string, unit: UnitType) => void;
  latestCreatedBooking: Booking | null;
  connectedSheetInfo: {
    spreadsheetId: string;
    spreadsheetTitle: string;
    tabTitle: string;
  } | null;
  externalPendingAppendBooking?: Booking | null;
  onClearExternalPendingAppend?: () => void;
  onBookingSyncedToSheet?: (bookingId: string) => void;
  sheetGuideNotice?: string | null;
  openScriptGuideSignal?: number;
}

export function GoogleSheetSyncPanel({
  sheetRows,
  sheetSourceMode,
  sheetLoading,
  sheetsAccessToken,
  sheetsWebhookUrl,
  onSheetsTokenObtained,
  onLiveRowsLoaded,
  onAppsScriptRowsLoaded,
  onSaveWebhookUrl,
  onClearWebhookUrl,
  onResetToCsv,
  onJumpToCalendarDate,
  latestCreatedBooking,
  connectedSheetInfo,
  externalPendingAppendBooking = null,
  onClearExternalPendingAppend,
  onBookingSyncedToSheet,
  sheetGuideNotice = null,
  openScriptGuideSignal = 0,
}: GoogleSheetSyncPanelProps) {
  const [connectionTab, setConnectionTab] = useState<ConnectionModeTab>(
    sheetsAccessToken && sheetSourceMode === 'live-sheet' ? 'oauth' : 'apps-script'
  );
  const [webhookInput, setWebhookInput] = useState<string>(sheetsWebhookUrl || '');
  const [webhookBusy, setWebhookBusy] = useState<boolean>(false);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [showScriptGuide, setShowScriptGuide] = useState<boolean>(!sheetsWebhookUrl);

  const [sheetUrlInput, setSheetUrlInput] = useState<string>(() => {
    try {
      return window.localStorage.getItem(STORAGE_SHEET_URL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [availableTabs, setAvailableTabs] = useState<Array<{ sheetId: number; title: string }>>([]);
  const [selectedTab, setSelectedTab] = useState<string>(() => {
    try {
      return window.localStorage.getItem(STORAGE_SHEET_TAB_KEY) || '';
    } catch {
      return '';
    }
  });
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [authPending, setAuthPending] = useState<boolean>(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheetSuccess, setSheetSuccess] = useState<string | null>(null);

  // Table search & filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [unitFilter, setUnitFilter] = useState<'all' | UnitType>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');

  // Confirmation dialog state before mutating/appending to user's Google Sheet
  const [pendingAppendBooking, setPendingAppendBooking] = useState<Booking | null>(null);
  const [isAppending, setIsAppending] = useState<boolean>(false);

  const activePendingBooking = pendingAppendBooking || externalPendingAppendBooking;

  const closePendingModal = () => {
    setPendingAppendBooking(null);
    onClearExternalPendingAppend?.();
  };

  useEffect(() => {
    if (sheetsWebhookUrl) {
      setWebhookInput(sheetsWebhookUrl);
      setShowScriptGuide(false);
    }
  }, [sheetsWebhookUrl]);

  useEffect(() => {
    if (openScriptGuideSignal > 0) {
      setConnectionTab('apps-script');
      setShowScriptGuide(true);
    }
  }, [openScriptGuideSignal]);

  useEffect(() => {
    try {
      if (sheetUrlInput.trim()) {
        window.localStorage.setItem(STORAGE_SHEET_URL_KEY, sheetUrlInput.trim());
      } else {
        window.localStorage.removeItem(STORAGE_SHEET_URL_KEY);
      }
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }, [sheetUrlInput]);

  useEffect(() => {
    try {
      if (selectedTab.trim()) {
        window.localStorage.setItem(STORAGE_SHEET_TAB_KEY, selectedTab.trim());
      }
    } catch {
      // Ignore storage errors
    }
  }, [selectedTab]);

  const monthFilterOptions = useMemo(() => {
    const keys = new Set<string>();
    sheetRows.forEach((row) => {
      keys.add(row.checkIn.slice(0, 7));
    });
    return Array.from(keys).sort();
  }, [sheetRows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sheetRows
      .filter((row) => {
        if (unitFilter !== 'all' && row.unitType !== unitFilter) return false;
        if (monthFilter !== 'all' && !row.checkIn.startsWith(monthFilter)) return false;
        if (q) {
          const totalStr = row.totalAmount !== undefined ? String(row.totalAmount) : '';
          const hay = `${row.name} ${row.phone} ${row.checkIn} ${row.checkOut} ${row.rawChoice} ${totalStr}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  }, [sheetRows, unitFilter, monthFilter, searchQuery]);

  const loadSpreadsheetWithToken = async (spreadsheetId: string, token: string) => {
    setIsConnecting(true);
    setSheetError(null);
    setSheetSuccess(null);
    try {
      const meta = await fetchSpreadsheetMetadata(spreadsheetId, token);
      if (meta.sheets.length === 0) {
        throw new Error('Tiada helaian (sheet tab) ditemui dalam Google Sheet ini.');
      }

      setSpreadsheetTitle(meta.title);
      setAvailableTabs(meta.sheets);
      const targetTab =
        selectedTab && meta.sheets.some((s) => s.title === selectedTab)
          ? selectedTab
          : meta.sheets[0].title;
      setSelectedTab(targetTab);

      const { rows, financeRows } = await fetchSheetAllRows(spreadsheetId, targetTab, token);
      onLiveRowsLoaded(rows, financeRows, spreadsheetId, meta.title, targetTab);
      setSheetSuccess(
        `Berjaya menyambung "${meta.title}" (${targetTab}) — ${rows.length} rekod dimuatkan. Anda kini boleh menghantar tempahan terus ke Google Sheet ini.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membaca data daripada Google Sheet.';
      setSheetError(msg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleGoogleSheetsSignIn = async () => {
    setAuthPending(true);
    setSheetError(null);
    try {
      const { accessToken } = await signInWithGoogleSheets();
      onSheetsTokenObtained(accessToken);

      const existingId = extractSpreadsheetId(sheetUrlInput);
      if (existingId) {
        await loadSpreadsheetWithToken(existingId, accessToken);
      } else {
        setSheetSuccess(
          'Akaun Google Sheets disahkan. Seterusnya tampal pautan URL Google Sheet (https://docs.google.com/spreadsheets/d/...) dan klik "Muat Google Sheet".'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyambung akaun Google.';
      if (!msg.includes('popup-closed-by-user')) {
        setSheetError(msg);
      }
    } finally {
      setAuthPending(false);
    }
  };

  const handleLoadLiveSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    setSheetError(null);
    setSheetSuccess(null);

    const spreadsheetId = extractSpreadsheetId(sheetUrlInput);
    if (!spreadsheetId) {
      setSheetError(
        'Pautan atau ID Google Sheet tidak sah. Pastikan ia mengandungi "/spreadsheets/d/..." daripada pelayar Google Sheets.'
      );
      return;
    }

    if (!sheetsAccessToken) {
      setSheetError(
        'Sila klik "Sign in with Google" pada Langkah 1 terlebih dahulu untuk memberi kebenaran akses Google Sheets.'
      );
      return;
    }

    await loadSpreadsheetWithToken(spreadsheetId, sheetsAccessToken);
  };

  const handleSwitchTab = async (newTab: string) => {
    setSelectedTab(newTab);
    const spreadsheetId = extractSpreadsheetId(sheetUrlInput) || connectedSheetInfo?.spreadsheetId;
    if (!spreadsheetId || !sheetsAccessToken) return;

    setIsConnecting(true);
    setSheetError(null);
    try {
      const { rows, financeRows } = await fetchSheetAllRows(spreadsheetId, newTab, sheetsAccessToken);
      onLiveRowsLoaded(
        rows,
        financeRows,
        spreadsheetId,
        spreadsheetTitle || connectedSheetInfo?.spreadsheetTitle || 'Google Sheet',
        newTab
      );
      setSheetSuccess(`Helaian "${newTab}" dimuatkan (${rows.length} rekod).`);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Gagal menukar helaian.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConfirmAppendToSheet = async () => {
    if (!activePendingBooking || !connectedSheetInfo || !sheetsAccessToken) return;
    setIsAppending(true);
    setSheetError(null);
    setSheetSuccess(null);

    try {
      await appendBookingToSheet(
        connectedSheetInfo.spreadsheetId,
        connectedSheetInfo.tabTitle,
        sheetsAccessToken,
        {
          name: activePendingBooking.guestName,
          phone: activePendingBooking.phone || '-',
          checkIn: activePendingBooking.checkIn,
          checkOut: activePendingBooking.checkOut,
          unitType: activePendingBooking.unitType,
          totalAmount: activePendingBooking.totalAmount,
        }
      );

      // Refresh live sheet rows right after append
      const { rows: updatedRows, financeRows: updatedFinanceRows } = await fetchSheetAllRows(
        connectedSheetInfo.spreadsheetId,
        connectedSheetInfo.tabTitle,
        sheetsAccessToken
      );
      onLiveRowsLoaded(
        updatedRows,
        updatedFinanceRows,
        connectedSheetInfo.spreadsheetId,
        connectedSheetInfo.spreadsheetTitle,
        connectedSheetInfo.tabTitle
      );

      onBookingSyncedToSheet?.(activePendingBooking.id);
      setSheetSuccess(
        `Rekod tempahan atas nama ${activePendingBooking.guestName} telah berjaya disimpan ke Google Sheet "${connectedSheetInfo.spreadsheetTitle}" (${connectedSheetInfo.tabTitle}).`
      );
      closePendingModal();
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Gagal menulis rekod ke Google Sheet.');
    } finally {
      setIsAppending(false);
    }
  };

  const handleSaveAndConnectWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSheetError(null);
    setSheetSuccess(null);

    const trimmed = webhookInput.trim();
    if (!trimmed) {
      setSheetError('Sila masukkan pautan Apps Script Web App anda (https://script.google.com/macros/s/.../exec).');
      return;
    }

    if (trimmed.includes('docs.google.com/spreadsheets')) {
      setSheetError(
        'Ini ialah pautan paparan Google Sheet biasa yang memerlukan Log Masuk Google. Untuk sambungan tanpa log masuk Google, cipta Web App Apps Script (pautan bermula dengan https://script.google.com/macros/s/.../exec) mengikut 3 langkah di bawah, atau tukar ke tab "Log Masuk Google".'
      );
      return;
    }

    if (trimmed.includes('script.google.com/macros/library')) {
      setSheetError(
        'Ini ialah pautan "Library", bukan pautan "Web app". Di Google Apps Script, klik Deploy → New deployment → pilih jenis "Web app" (ikon gear di sebelah Select type) → Execute as: Me → Who has access: Anyone → Deploy, dan salin pautan Web app yang berakhir dengan /exec.'
      );
      return;
    }

    if (!isValidAppsScriptUrl(trimmed)) {
      setSheetError(
        'Format pautan tidak sah. Pautan Web App Apps Script mestilah dalam format: https://script.google.com/macros/s/.../exec'
      );
      return;
    }

    setWebhookBusy(true);
    try {
      const res = await fetchWebhookSheetRows(trimmed);
      await onSaveWebhookUrl(trimmed, res.title || 'Google Sheet Tempahan');
      onAppsScriptRowsLoaded(res.rows, res.financeRows, res.title, res.tab);
      setShowScriptGuide(false);
      setSheetSuccess(
        `Berjaya disambungkan tanpa log masuk Google! "${res.title}" (${res.tab}) · ${res.rows.length} rekod dimuatkan. Tempahan baharu akan disimpan terus ke Google Sheet ini.`
      );
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Gagal menyambung ke Google Apps Script Web App.');
    } finally {
      setWebhookBusy(false);
    }
  };

  const handleRefreshWebhook = async () => {
    if (!sheetsWebhookUrl) return;
    setWebhookBusy(true);
    setSheetError(null);
    setSheetSuccess(null);
    try {
      const res = await fetchWebhookSheetRows(sheetsWebhookUrl);
      onAppsScriptRowsLoaded(res.rows, res.financeRows, res.title, res.tab);
      setSheetSuccess(`Data Google Sheet disegar semula (${res.rows.length} rekod).`);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Gagal memuatkan data terkini.');
    } finally {
      setWebhookBusy(false);
    }
  };

  const handleDisconnectWebhook = async () => {
    setWebhookBusy(true);
    setSheetError(null);
    setSheetSuccess(null);
    try {
      await onClearWebhookUrl();
      setWebhookInput('');
      setShowScriptGuide(true);
      setSheetSuccess('Sambungan Apps Script telah diputuskan.');
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Gagal memutuskan sambungan.');
    } finally {
      setWebhookBusy(false);
    }
  };

  const handleSendBookingViaWebhook = async (booking: Booking) => {
    if (!sheetsWebhookUrl) return;
    setWebhookBusy(true);
    setSheetError(null);
    setSheetSuccess(null);
    try {
      const res = await appendBookingToWebhook(sheetsWebhookUrl, {
        name: booking.guestName,
        phone: booking.phone || '-',
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        unitType: booking.unitType,
        totalAmount: booking.totalAmount,
      });
      onAppsScriptRowsLoaded(res.rows, res.financeRows, res.title, res.tab);
      onBookingSyncedToSheet?.(booking.id);
      setSheetSuccess(
        `Rekod tempahan atas nama ${booking.guestName} telah disahkan masuk ke Google Sheet "${res.title}".`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghantar tempahan ke Google Sheet.';
      setSheetError(msg);
      if (msg.includes('doPost') || msg.includes('New deployment')) {
        setShowScriptGuide(true);
      }
    } finally {
      setWebhookBusy(false);
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      setSheetError('Tidak dapat menyalin secara automatik. Sila tandakan dan salin kod secara manual.');
    }
  };

  const formatMonthOptionLabel = (yyyyMm: string) => {
    const [y, m] = yyyyMm.split('-').map(Number);
    if (!y || !m) return yyyyMm;
    return `${MALAY_MONTHS[m - 1]} ${y}`;
  };

  return (
    <div id="integrasi-google-sheet" className="mt-10 bg-white border border-[#DDE2DC] rounded-2xl p-5 sm:p-7 scroll-mt-24">
      {/* Header & Live Google Sheet Connection Bar */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 pb-6 border-b border-[#DDE2DC]">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2 text-xs font-medium text-[#14532D]">
            <FileSpreadsheet className="w-4 h-4" />
            <span>Integrasi Google Sheet Tempahan</span>
          </div>
          <h3 className="font-display text-2xl font-semibold text-[#161B17]">
            Senarai Rekod Google Sheet
          </h3>
          <p className="text-xs sm:text-sm text-[#525C54] leading-relaxed">
            Sumber semasa:{' '}
            <strong className="text-[#161B17]">
              {(sheetSourceMode === 'apps-script' || sheetSourceMode === 'live-sheet') && connectedSheetInfo
                ? `${connectedSheetInfo.spreadsheetTitle} (${connectedSheetInfo.tabTitle})`
                : 'SISTEM BOOKING (Responses) · Fail CSV Baca Sahaja'}
            </strong>
            . Semua tarikh masuk dan keluar daripada helaian ini diselaraskan terus ke paparan kalendar kekosongan di atas.
          </p>

          {sheetSourceMode === 'apps-script' && sheetsWebhookUrl && (
            <div className="p-3 rounded-xl bg-[#F1F7F3] border border-[#84B395] flex items-start gap-2 text-xs text-[#14532D] leading-relaxed">
              <Zap className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Sambungan Automatik Aktif (Tanpa Log Masuk Google):</strong> Setiap tempahan baharu yang disahkan oleh Admin akan terus direkodkan ke Google Sheet anda.
              </span>
            </div>
          )}

          {sheetSourceMode === 'csv' && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-xs text-amber-950 leading-relaxed">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <span>
                Fail CSV lampiran hanya untuk paparan kalendar (baca sahaja). Untuk menyimpan tempahan baharu ke Google Sheet <strong>tanpa perlu log masuk atau kebenaran akses Google setiap kali</strong>, tampal pautan <strong>Apps Script Web App</strong> Google Sheet anda di sebelah kanan.
              </span>
            </div>
          )}
        </div>

        {/* Connection Mode Switcher + Config Panel */}
        <div className="w-full lg:w-[560px] space-y-3">
          {sheetGuideNotice && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 flex items-start gap-2 text-xs text-amber-950">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <span>{sheetGuideNotice}</span>
            </div>
          )}

          <div
            className="inline-flex p-1 bg-[#EFF2EE] rounded-lg border border-[#DDE2DC]"
            role="tablist"
            aria-label="Kaedah Sambungan Google Sheet"
          >
            <button
              type="button"
              role="tab"
              aria-selected={connectionTab === 'apps-script'}
              onClick={() => {
                setConnectionTab('apps-script');
                setSheetError(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                connectionTab === 'apps-script'
                  ? 'bg-white text-[#161B17] shadow-xs'
                  : 'text-[#525C54] hover:text-[#161B17]'
              }`}
            >
              Tanpa Log Masuk (Apps Script)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={connectionTab === 'oauth'}
              onClick={() => {
                setConnectionTab('oauth');
                setSheetError(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                connectionTab === 'oauth'
                  ? 'bg-white text-[#161B17] shadow-xs'
                  : 'text-[#525C54] hover:text-[#161B17]'
              }`}
            >
              Log Masuk Google (OAuth API)
            </button>
          </div>

          {connectionTab === 'apps-script' ? (
            <div className="space-y-3">
              <form
                onSubmit={handleSaveAndConnectWebhook}
                className="space-y-2.5 p-3.5 rounded-xl bg-[#F8F9F7] border border-[#DDE2DC]"
              >
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="apps-script-webhook-input"
                    className="block text-[11px] font-semibold text-[#14532D] uppercase tracking-wide"
                  >
                    Pautan Apps Script Web App (Kekal Aktif)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowScriptGuide((v) => !v)}
                    className="text-[11px] font-medium text-[#14532D] hover:underline cursor-pointer"
                  >
                    {showScriptGuide ? 'Tutup Panduan' : 'Lihat Panduan 3 Langkah'}
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Link2 className="w-4 h-4 text-[#525C54] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="apps-script-webhook-input"
                      type="url"
                      value={webhookInput}
                      onChange={(e) => setWebhookInput(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      aria-label="Pautan Apps Script Web App"
                      className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] placeholder:text-[#9AA39C] focus:outline-none focus:border-[#14532D]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={webhookBusy}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {webhookBusy ? 'Menyambung...' : 'Simpan & Sambung'}
                  </button>
                </div>

                {sheetsWebhookUrl && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleRefreshWebhook}
                        disabled={webhookBusy}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#14532D] hover:underline cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${webhookBusy ? 'animate-spin' : ''}`} />
                        Segar Semula Sheet
                      </button>

                      <button
                        type="button"
                        onClick={handleDisconnectWebhook}
                        disabled={webhookBusy}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Putuskan
                      </button>
                    </div>

                    {latestCreatedBooking && (
                      <button
                        type="button"
                        onClick={() => handleSendBookingViaWebhook(latestCreatedBooking)}
                        disabled={webhookBusy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161B17] text-white text-xs font-medium hover:bg-black transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Hantar Tempahan Terkini ke Sheet
                      </button>
                    )}
                  </div>
                )}
              </form>

              {showScriptGuide && (
                <div className="p-4 rounded-xl bg-white border border-[#DDE2DC] space-y-2.5 text-xs text-[#525C54]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#161B17]">
                      Cara Sambung Sekali Sahaja (30 Saat — Tanpa Kebenaran Akses Setiap Kali):
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyScript}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#14532D] bg-[#F1F7F3] text-[#14532D] text-[11px] font-semibold hover:bg-[#E4EFE8] transition-colors cursor-pointer shrink-0"
                    >
                      {copiedScript ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Disalin!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Salin Kod Script
                        </>
                      )}
                    </button>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 leading-relaxed text-[#161B17]">
                    <li>
                      Buka Google Sheet anda (<strong>SISTEM BOOKING (Responses)</strong>) → klik menu{' '}
                      <strong>Extensions → Apps Script</strong>.
                    </li>
                    <li>
                      Padam kod sedia ada, tampal kod Apps Script di bawah, dan tekan ikon <strong>Save</strong>.
                    </li>
                    <li>
                      Klik <strong>Deploy → New deployment → Web app</strong> → set{' '}
                      <em>Execute as:</em> <strong>Me</strong> &amp; <em>Who has access:</em>{' '}
                      <strong>Anyone</strong> → klik <strong>Deploy</strong>, salin <strong>Web app URL</strong>{' '}
                      (<code className="font-mono-tabular">.../exec</code>) dan tampal di atas.
                    </li>
                  </ol>
                  <pre className="p-2.5 rounded-lg bg-[#F8F9F7] border border-[#DDE2DC] text-[10.5px] font-mono-tabular text-[#161B17] overflow-x-auto max-h-36">
                    {APPS_SCRIPT_TEMPLATE}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Step 1: Google OAuth Authorization */}
              <div className="p-3.5 rounded-xl bg-[#F8F9F7] border border-[#DDE2DC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="block text-[11px] font-semibold text-[#14532D] uppercase tracking-wide">
                    Langkah 1 · Kebenaran Akaun Google
                  </span>
                  <p className="text-xs text-[#525C54] leading-relaxed">
                    {sheetsAccessToken
                      ? 'Akaun Google Sheets disahkan untuk sesi ini.'
                      : 'Diperlukan jika menggunakan pautan docs.google.com terus.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleSheetsSignIn}
                  disabled={authPending}
                  className="inline-flex items-center justify-center gap-2.5 px-3.5 py-2 rounded-lg bg-white border border-[#747775] text-[#1F1F1F] text-xs font-medium hover:bg-[#F8F9F7] transition-colors shrink-0 cursor-pointer shadow-2xs"
                >
                  <svg
                    className="w-4 h-4 shrink-0"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>
                    {authPending
                      ? 'Menyambung...'
                      : sheetsAccessToken
                      ? 'Tukar / Segar Semula'
                      : 'Sign in with Google'}
                  </span>
                </button>
              </div>

              {/* Step 2: Paste Live Google Sheet URL */}
              <form onSubmit={handleLoadLiveSheet} className="space-y-2.5 p-3.5 rounded-xl bg-[#F8F9F7] border border-[#DDE2DC]">
                <label
                  htmlFor="google-sheet-url-input"
                  className="block text-[11px] font-semibold text-[#14532D] uppercase tracking-wide"
                >
                  Langkah 2 · Pautan URL Google Sheet Sebenar
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Link2 className="w-4 h-4 text-[#525C54] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="google-sheet-url-input"
                      type="text"
                      value={sheetUrlInput}
                      onChange={(e) => setSheetUrlInput(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      aria-label="Pautan atau ID Google Sheet"
                      className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-[#DDE2DC] bg-white text-[#161B17] placeholder:text-[#9AA39C] focus:outline-none focus:border-[#14532D]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isConnecting}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
                    {isConnecting ? 'Memuatkan...' : 'Muat Google Sheet'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {availableTabs.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <label htmlFor="sheet-tab-select" className="text-[#525C54]">
                        Helaian:
                      </label>
                      <select
                        id="sheet-tab-select"
                        value={selectedTab}
                        onChange={(e) => handleSwitchTab(e.target.value)}
                        className="px-2.5 py-1 rounded-md border border-[#DDE2DC] bg-white text-[#161B17] text-xs cursor-pointer"
                      >
                        {availableTabs.map((t) => (
                          <option key={t.sheetId} value={t.title}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-3 ml-auto">
                    {sheetSourceMode === 'live-sheet' && (
                      <button
                        type="button"
                        onClick={() => {
                          onResetToCsv();
                          setSheetSuccess('Paparan dikembalikan kepada fail CSV yang dilampirkan.');
                        }}
                        className="text-xs font-medium text-[#525C54] hover:text-[#161B17] underline underline-offset-2 cursor-pointer"
                      >
                        Guna Data CSV Asal
                      </button>
                    )}

                    {latestCreatedBooking && connectedSheetInfo && sheetsAccessToken && (
                      <button
                        type="button"
                        onClick={() => setPendingAppendBooking(latestCreatedBooking)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161B17] text-white text-xs font-medium hover:bg-black transition-colors cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Hantar Tempahan Terkini ke Sheet
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
          )}

          {sheetError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-800"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{sheetError}</span>
            </div>
          )}

          {sheetSuccess && (
            <div className="p-3 rounded-xl bg-[#F1F7F3] border border-[#84B395] flex items-start gap-2 text-xs text-[#14532D]">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{sheetSuccess}</span>
            </div>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#525C54] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama atau no. telefon..."
              aria-label="Cari rekod Google Sheet"
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#DDE2DC] bg-[#F8F9F7] text-[#161B17] placeholder:text-[#9AA39C] focus:outline-none focus:border-[#14532D]"
            />
          </div>

          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value as 'all' | UnitType)}
            aria-label="Tapis pilihan menginap"
            className="px-2.5 py-1.5 text-xs rounded-lg border border-[#DDE2DC] bg-[#F8F9F7] text-[#161B17] cursor-pointer"
          >
            <option value="all">Semua Pilihan (H & R)</option>
            <option value="homestay">H · Ss Homestay</option>
            <option value="roomstay">R · Ss Roomstay</option>
          </select>

          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            aria-label="Tapis bulan masuk"
            className="px-2.5 py-1.5 text-xs rounded-lg border border-[#DDE2DC] bg-[#F8F9F7] text-[#161B17] cursor-pointer"
          >
            <option value="all">Semua Bulan ({sheetRows.length} rekod)</option>
            {monthFilterOptions.map((key) => (
              <option key={key} value={key}>
                {formatMonthOptionLabel(key)}
              </option>
            ))}
          </select>
        </div>

        <span className="font-mono-tabular text-xs text-[#525C54]">
          Memaparkan {filteredRows.length} daripada {sheetRows.length} rekod
        </span>
      </div>

      {/* 7-Column Spreadsheet Table */}
      {sheetLoading ? (
        <div className="space-y-2 animate-pulse py-4">
          <div className="h-10 rounded-lg bg-[#EFF2EE]" />
          <div className="h-10 rounded-lg bg-[#EFF2EE]" />
          <div className="h-10 rounded-lg bg-[#EFF2EE]" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="py-8 text-center text-xs text-[#525C54] bg-[#F8F9F7] rounded-xl border border-[#DDE2DC]">
          Tiada rekod tempahan yang sepadan dengan carian anda.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[380px] overflow-y-auto border border-[#DDE2DC] rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#F8F9F7] sticky top-0 z-10 border-b border-[#DDE2DC] text-[#525C54]">
              <tr>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Timestamp</th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Nama</th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">No. Telefon</th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Tarikh Masuk</th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Tarikh Keluar</th>
                <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Pilihan Menginap</th>
                <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Jumlah</th>
                <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBEFEB] bg-white">
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-[#F8F9F7] transition-colors">
                  <td className="py-2.5 px-3 font-mono-tabular text-[#525C54] whitespace-nowrap">
                    {row.timestamp}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-[#161B17] whitespace-nowrap">
                    {row.name}
                  </td>
                  <td className="py-2.5 px-3 font-mono-tabular text-[#161B17] whitespace-nowrap">
                    {row.phone}
                  </td>
                  <td className="py-2.5 px-3 font-mono-tabular font-medium text-[#161B17] whitespace-nowrap">
                    {formatDisplayDate(row.checkIn)}
                  </td>
                  <td className="py-2.5 px-3 font-mono-tabular font-medium text-[#161B17] whitespace-nowrap">
                    {formatDisplayDate(row.checkOut)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className="font-medium text-[#14532D]">
                      {row.rawChoice} · {UNIT_RATES[row.unitType].label}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono-tabular font-semibold text-right whitespace-nowrap">
                    {typeof row.totalAmount === 'number' ? (
                      <span className="text-[#161B17]">{formatMYR(row.totalAmount)}</span>
                    ) : (
                      <span className="text-[#9AA39C] font-normal">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => downloadSheetBookingPdf(row)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#DDE2DC] bg-[#F8F9F7] text-xs font-medium text-[#14532D] hover:bg-[#F1F7F3] hover:border-[#14532D] transition-colors cursor-pointer"
                        title="Muat turun PDF slip tempahan"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => onJumpToCalendarDate(row.checkIn, row.unitType)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#14532D] hover:underline cursor-pointer"
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        Lihat Bulan
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mandatory Explicit User Confirmation Modal Before Mutating Google Sheet */}
      {activePendingBooking && connectedSheetInfo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-sheet-title"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div className="max-w-md w-full bg-white border border-[#DDE2DC] rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h4 id="confirm-sheet-title" className="font-display text-xl font-semibold text-[#161B17]">
                Sahkan Penghantaran ke Google Sheet
              </h4>
              <button
                type="button"
                onClick={closePendingModal}
                aria-label="Tutup dialog pengesahan"
                className="p-1 rounded-lg text-[#525C54] hover:bg-[#EFF2EE] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#525C54] leading-relaxed">
              Adakah anda pasti mahu menambah baris rekod tempahan berikut ke dalam helaian{' '}
              <strong className="text-[#161B17]">
                {connectedSheetInfo.spreadsheetTitle} ({connectedSheetInfo.tabTitle})
              </strong>
              ?
            </p>

            <div className="p-3.5 rounded-xl bg-[#F8F9F7] border border-[#DDE2DC] text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#525C54]">Nama:</span>
                <span className="font-semibold text-[#161B17]">{activePendingBooking.guestName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525C54]">No. Telefon:</span>
                <span className="font-mono-tabular text-[#161B17]">
                  {activePendingBooking.phone || '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525C54]">Tarikh Masuk:</span>
                <span className="font-mono-tabular text-[#161B17]">
                  {formatDisplayDate(activePendingBooking.checkIn)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525C54]">Tarikh Keluar:</span>
                <span className="font-mono-tabular text-[#161B17]">
                  {formatDisplayDate(activePendingBooking.checkOut)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525C54]">Pilihan Menginap:</span>
                <span className="font-semibold text-[#14532D]">
                  {activePendingBooking.unitType === 'homestay' ? 'H (Ss Homestay)' : 'R (Ss Roomstay)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525C54]">Jumlah:</span>
                <span className="font-mono-tabular font-semibold text-[#14532D]">
                  {formatMYR(activePendingBooking.totalAmount)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={closePendingModal}
                disabled={isAppending}
                className="px-4 py-2 rounded-lg border border-[#DDE2DC] text-xs font-medium text-[#161B17] hover:bg-[#EFF2EE] transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmAppendToSheet}
                disabled={isAppending}
                className="px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] transition-colors cursor-pointer disabled:opacity-50"
              >
                {isAppending ? 'Menghantar...' : 'Sahkan & Tambah Baris'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
