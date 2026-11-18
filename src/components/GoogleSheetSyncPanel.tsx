import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  Link2,
  RefreshCw,
  Search,
  Send,
  X,
} from 'lucide-react';
import { Booking, SheetBookingRow, UNIT_RATES, UnitType } from '../types/homestay';
import { formatDisplayDate, MALAY_MONTHS } from '../lib/dateUtils';
import { downloadSheetBookingPdf } from '../lib/bookingPdf';
import {
  appendBookingToSheet,
  extractSpreadsheetId,
  fetchSheetBookingRows,
  fetchSpreadsheetMetadata,
} from '../lib/googleSheets';
import { signInWithGoogleSheets } from '../lib/firebase';

interface GoogleSheetSyncPanelProps {
  sheetRows: SheetBookingRow[];
  sheetSourceMode: 'csv' | 'live-sheet';
  sheetLoading: boolean;
  sheetsAccessToken: string | null;
  onSheetsTokenObtained: (token: string) => void;
  onLiveRowsLoaded: (
    rows: SheetBookingRow[],
    spreadsheetId: string,
    spreadsheetTitle: string,
    tabTitle: string
  ) => void;
  onResetToCsv: () => void;
  onJumpToCalendarDate: (dateStr: string, unit: UnitType) => void;
  latestCreatedBooking: Booking | null;
  connectedSheetInfo: {
    spreadsheetId: string;
    spreadsheetTitle: string;
    tabTitle: string;
  } | null;
}

export function GoogleSheetSyncPanel({
  sheetRows,
  sheetSourceMode,
  sheetLoading,
  sheetsAccessToken,
  onSheetsTokenObtained,
  onLiveRowsLoaded,
  onResetToCsv,
  onJumpToCalendarDate,
  latestCreatedBooking,
  connectedSheetInfo,
}: GoogleSheetSyncPanelProps) {
  const [sheetUrlInput, setSheetUrlInput] = useState<string>('');
  const [availableTabs, setAvailableTabs] = useState<Array<{ sheetId: number; title: string }>>([]);
  const [selectedTab, setSelectedTab] = useState<string>('');
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
          const hay = `${row.name} ${row.phone} ${row.checkIn} ${row.checkOut} ${row.rawChoice}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  }, [sheetRows, unitFilter, monthFilter, searchQuery]);

  const handleGoogleSheetsSignIn = async () => {
    setAuthPending(true);
    setSheetError(null);
    try {
      const { accessToken } = await signInWithGoogleSheets();
      onSheetsTokenObtained(accessToken);
      setSheetSuccess('Akaun Google Sheets disahkan. Anda kini boleh memuatkan pautan Google Sheet anda.');
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
      setSheetError('Pautan atau ID Google Sheet tidak sah. Contoh: https://docs.google.com/spreadsheets/d/...');
      return;
    }

    if (!sheetsAccessToken) {
      setSheetError('Sila klik "Sign in with Google" terlebih dahulu untuk memberi kebenaran akses Google Sheets.');
      return;
    }

    setIsConnecting(true);
    try {
      const meta = await fetchSpreadsheetMetadata(spreadsheetId, sheetsAccessToken);
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

      const rows = await fetchSheetBookingRows(spreadsheetId, targetTab, sheetsAccessToken);
      onLiveRowsLoaded(rows, spreadsheetId, meta.title, targetTab);
      setSheetSuccess(
        `Berjaya menyambung "${meta.title}" (${targetTab}) — ${rows.length} rekod tempahan dimuatkan ke kalendar.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membaca data daripada Google Sheet.';
      setSheetError(msg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSwitchTab = async (newTab: string) => {
    setSelectedTab(newTab);
    const spreadsheetId = extractSpreadsheetId(sheetUrlInput) || connectedSheetInfo?.spreadsheetId;
    if (!spreadsheetId || !sheetsAccessToken) return;

    setIsConnecting(true);
    setSheetError(null);
    try {
      const rows = await fetchSheetBookingRows(spreadsheetId, newTab, sheetsAccessToken);
      onLiveRowsLoaded(rows, spreadsheetId, spreadsheetTitle || connectedSheetInfo?.spreadsheetTitle || 'Google Sheet', newTab);
      setSheetSuccess(`Helaian "${newTab}" dimuatkan (${rows.length} rekod).`);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Gagal menukar helaian.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConfirmAppendToSheet = async () => {
    if (!pendingAppendBooking || !connectedSheetInfo || !sheetsAccessToken) return;
    setIsAppending(true);
    setSheetError(null);
    setSheetSuccess(null);

    try {
      await appendBookingToSheet(
        connectedSheetInfo.spreadsheetId,
        connectedSheetInfo.tabTitle,
        sheetsAccessToken,
        {
          name: pendingAppendBooking.guestName,
          phone: pendingAppendBooking.phone || '-',
          checkIn: pendingAppendBooking.checkIn,
          checkOut: pendingAppendBooking.checkOut,
          unitType: pendingAppendBooking.unitType,
        }
      );

      // Refresh live sheet rows right after append
      const updatedRows = await fetchSheetBookingRows(
        connectedSheetInfo.spreadsheetId,
        connectedSheetInfo.tabTitle,
        sheetsAccessToken
      );
      onLiveRowsLoaded(
        updatedRows,
        connectedSheetInfo.spreadsheetId,
        connectedSheetInfo.spreadsheetTitle,
        connectedSheetInfo.tabTitle
      );

      setSheetSuccess(
        `Rekod tempahan atas nama ${pendingAppendBooking.guestName} telah ditambah ke Google Sheet "${connectedSheetInfo.spreadsheetTitle}".`
      );
      setPendingAppendBooking(null);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Gagal menulis rekod ke Google Sheet.');
    } finally {
      setIsAppending(false);
    }
  };

  const formatMonthOptionLabel = (yyyyMm: string) => {
    const [y, m] = yyyyMm.split('-').map(Number);
    if (!y || !m) return yyyyMm;
    return `${MALAY_MONTHS[m - 1]} ${y}`;
  };

  return (
    <div className="mt-10 bg-white border border-[#DDE2DC] rounded-2xl p-5 sm:p-7">
      {/* Header & Live Google Sheet Connection Bar */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 pb-6 border-b border-[#DDE2DC]">
        <div className="space-y-1.5 max-w-xl">
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
              {sheetSourceMode === 'live-sheet' && connectedSheetInfo
                ? `${connectedSheetInfo.spreadsheetTitle} (${connectedSheetInfo.tabTitle})`
                : 'SISTEM BOOKING (Responses) · CSV Dilampirkan'}
            </strong>
            . Semua tarikh masuk dan keluar daripada helaian ini diselaraskan terus ke paparan kalendar kekosongan di atas.
          </p>
        </div>

        {/* Live Google Sheet URL Connector */}
        <div className="w-full lg:w-[540px] space-y-3">
          {!sheetsAccessToken ? (
            <div className="p-4 rounded-xl bg-[#F8F9F7] border border-[#DDE2DC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-[#525C54] leading-relaxed">
                Log masuk dengan kebenaran Google Sheets untuk membaca atau mengemas kini pautan Google Sheet secara langsung.
              </p>
              <button
                type="button"
                onClick={handleGoogleSheetsSignIn}
                disabled={authPending}
                className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-white border border-[#747775] text-[#1F1F1F] text-xs font-medium hover:bg-[#F8F9F7] transition-colors shrink-0 cursor-pointer shadow-2xs"
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
                <span>{authPending ? 'Menyambung...' : 'Sign in with Google'}</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleLoadLiveSheet} className="space-y-2.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Link2 className="w-4 h-4 text-[#525C54] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={sheetUrlInput}
                    onChange={(e) => setSheetUrlInput(e.target.value)}
                    placeholder="Tampal pautan Google Sheet (https://docs.google.com/spreadsheets/d/...)"
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
                      className="px-2.5 py-1 rounded-md border border-[#DDE2DC] bg-[#F8F9F7] text-[#161B17] text-xs cursor-pointer"
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

                  {latestCreatedBooking && connectedSheetInfo && (
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

      {/* 6-Column Spreadsheet Table */}
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
      {pendingAppendBooking && connectedSheetInfo && (
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
                onClick={() => setPendingAppendBooking(null)}
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
                <span className="font-semibold text-[#161B17]">{pendingAppendBooking.guestName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525C54]">No. Telefon:</span>
                <span className="font-mono-tabular text-[#161B17]">
                  {pendingAppendBooking.phone || '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525C54]">Tarikh Masuk:</span>
                <span className="font-mono-tabular text-[#161B17]">
                  {formatDisplayDate(pendingAppendBooking.checkIn)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525C54]">Tarikh Keluar:</span>
                <span className="font-mono-tabular text-[#161B17]">
                  {formatDisplayDate(pendingAppendBooking.checkOut)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525C54]">Pilihan Menginap:</span>
                <span className="font-semibold text-[#14532D]">
                  {pendingAppendBooking.unitType === 'homestay' ? 'H (Ss Homestay)' : 'R (Ss Roomstay)'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPendingAppendBooking(null)}
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
