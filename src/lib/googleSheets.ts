import { SheetBookingRow, SheetFinanceRow, UnitType } from '../types/homestay';

export const ATTACHED_SHEET_CSV_URL = '/assets/aistudio/SISTEM_BOOKING__Responses__d1144951';

export const LEGACY_DEFAULT_APPS_SCRIPT_URLS = [
  'https://script.google.com/macros/s/AKfycbzBgO6lg7Dm9rIyaqyaVHnDcmzDU1N3iBod8sKZxePTH2OUDbJIAvafFj_F2tKchGy1bA/exec',
  'https://script.google.com/macros/s/AKfycbzoS8cGRzzGvn8oapem_PwUSbJSS_6YBvcKR07VMQ2568WnSMmlW83GfRBghoX0f2U/exec',
  'https://script.google.com/macros/s/AKfycbxoWYYDwV0UKfHHQdm_Tw3LYkfOneYsONtQ5qMom-aMR0p5XpvmWMX-jxEVeriIjg/exec',
];

export const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw9N8C6Jq534TZkIBanbXQQgR3HPjVo3G7BsKP64X3RDcaw5HXZVl8o0N78Tb7ID68/exec';

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Parses Google Sheet / Google Forms / Apps Script date formats into YYYY-MM-DD.
 * Supports ISO UTC timestamps (converted to Asia/Kuala_Lumpur UTC+8), M/D/YYYY, and YYYY-MM-DD.
 */
export function parseSheetDate(raw: string): string | null {
  const val = raw.trim();
  if (!val) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return val;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const y = parts.find((p) => p.type === 'year')?.value;
      const m = parts.find((p) => p.type === 'month')?.value;
      const day = parts.find((p) => p.type === 'day')?.value;
      if (y && m && day) {
        return `${y}-${m}-${day}`;
      }
    }
  }

  // Also support date + time strings like "11/19/2026 8:22:31" or "2026-11-19 08:22:31"
  const dateOnlyPart = val.split(/\s+/)[0] || val;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnlyPart)) {
    return dateOnlyPart;
  }

  const slashMatch = dateOnlyPart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const p1 = Number(slashMatch[1]);
    const p2 = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);

    // Standard Google Forms US M/D/YYYY (if p1 > 12, fallback to D/M/YYYY)
    let month = p1;
    let day = p2;
    if (p1 > 12 && p2 <= 12) {
      day = p1;
      month = p2;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

export function parseStayChoice(raw: string): UnitType | null {
  const val = raw.trim().toUpperCase();
  if (!val) return null;
  if (val === 'H' || val.includes('HOMESTAY')) return 'homestay';
  if (val === 'R' || val.includes('ROOMSTAY')) return 'roomstay';
  return null;
}

export function parseSheetAmount(raw: string): number | undefined {
  const cleaned = raw
    .trim()
    .replace(/RM/gi, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '');
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return Math.round(num * 100) / 100;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseSheetValues(
  rows: string[][],
  source: 'csv' | 'live-sheet'
): SheetBookingRow[] {
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toUpperCase());
  const idxTimestamp = header.findIndex((h) => h.includes('TIMESTAMP'));
  const idxName = header.findIndex((h) => h.includes('NAMA') || h.includes('NAME'));
  const idxPhone = header.findIndex((h) => h.includes('TELEFON') || h.includes('PHONE'));
  const idxCheckIn = header.findIndex((h) => h.includes('MASUK') || h.includes('CHECK IN'));
  const idxCheckOut = header.findIndex(
    (h) => (h.includes('TARIKH KELUAR') || h.includes('CHECK OUT') || (h.includes('KELUAR') && !h.includes('WANG')))
  );
  const idxChoice = header.findIndex((h) => h.includes('PILIHAN') || h.includes('MENGINAP') || h.includes('UNIT'));
  const idxTotal = header.findIndex(
    (h) =>
      h.includes('JUMLAH') ||
      h.includes('WANG MASUK') ||
      h.includes('TOTAL') ||
      h.includes('HARGA') ||
      h.includes('BAYARAN') ||
      h.includes('AMOUNT')
  );
  const idxPerkara = header.findIndex(
    (h) =>
      h.includes('PERKARA') ||
      h.includes('CATATAN') ||
      h.includes('KETERANGAN') ||
      h.includes('ITEM') ||
      h.includes('DESCRIPTION')
  );
  const idxExpense = header.findIndex(
    (h) =>
      h.includes('WANG KELUAR') ||
      h.includes('PERBELANJAAN') ||
      h.includes('BELANJA') ||
      h.includes('KOS') ||
      h.includes('EXPENSE')
  );

  const colTs = idxTimestamp >= 0 ? idxTimestamp : 0;
  const colName = idxName >= 0 ? idxName : 1;
  const colPhone = idxPhone >= 0 ? idxPhone : 2;
  const colIn = idxCheckIn >= 0 ? idxCheckIn : 3;
  const colOut = idxCheckOut >= 0 ? idxCheckOut : 4;
  const colChoice = idxChoice >= 0 ? idxChoice : 5;
  const colTotal = idxTotal >= 0 ? idxTotal : 6;
  const colPerkara = idxPerkara >= 0 ? idxPerkara : 7;
  const colExpense = idxExpense >= 0 ? idxExpense : 8;

  const parsed: SheetBookingRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.every((c) => !c.trim())) continue;

    const timestamp = (cols[colTs] || '').trim();
    const name = (cols[colName] || '').trim();
    const phone = (cols[colPhone] || '').trim();
    const checkIn = parseSheetDate(cols[colIn] || '');
    const checkOut = parseSheetDate(cols[colOut] || '');
    const rawChoice = (cols[colChoice] || '').trim();
    const unitType = parseStayChoice(rawChoice);
    const totalAmount = parseSheetAmount(cols[colTotal] || '');
    const perkara = (cols[colPerkara] || '').trim() || undefined;
    const expenseAmount = parseSheetAmount(cols[colExpense] || '');

    if (!name || !checkIn || !checkOut || !unitType || checkOut <= checkIn) {
      continue;
    }

    parsed.push({
      id: `sheet_${source}_${i}_${checkIn}_${unitType}`,
      timestamp: timestamp || '—',
      name,
      phone: phone || '—',
      checkIn,
      checkOut,
      unitType,
      rawChoice: rawChoice.toUpperCase() || (unitType === 'homestay' ? 'H' : 'R'),
      totalAmount,
      perkara,
      expenseAmount,
      source,
    });
  }

  return parsed;
}

export function parseSheetFinanceValues(
  rows: string[][],
  source: 'csv' | 'live-sheet'
): SheetFinanceRow[] {
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toUpperCase());
  const idxTimestamp = header.findIndex((h) => h.includes('TIMESTAMP'));
  const idxName = header.findIndex((h) => h.includes('NAMA') || h.includes('NAME'));
  const idxCheckIn = header.findIndex((h) => h.includes('MASUK') || h.includes('CHECK IN') || h === 'TARIKH');
  const idxCheckOut = header.findIndex(
    (h) => (h.includes('TARIKH KELUAR') || h.includes('CHECK OUT') || (h.includes('KELUAR') && !h.includes('WANG')))
  );
  const idxChoice = header.findIndex((h) => h.includes('PILIHAN') || h.includes('MENGINAP') || h.includes('UNIT'));
  const idxTotal = header.findIndex(
    (h) =>
      h.includes('JUMLAH') ||
      h.includes('WANG MASUK') ||
      h.includes('TOTAL') ||
      h.includes('HARGA') ||
      h.includes('BAYARAN') ||
      h.includes('AMOUNT')
  );
  const idxPerkara = header.findIndex(
    (h) =>
      h.includes('PERKARA') ||
      h.includes('CATATAN') ||
      h.includes('KETERANGAN') ||
      h.includes('ITEM') ||
      h.includes('DESCRIPTION')
  );
  const idxExpense = header.findIndex(
    (h) =>
      h.includes('WANG KELUAR') ||
      h.includes('PERBELANJAAN') ||
      h.includes('BELANJA') ||
      h.includes('KOS') ||
      h.includes('EXPENSE')
  );

  const colTs = idxTimestamp >= 0 ? idxTimestamp : 0;
  const colName = idxName >= 0 ? idxName : 1;
  const colIn = idxCheckIn >= 0 ? idxCheckIn : 3;
  const colOut = idxCheckOut >= 0 ? idxCheckOut : 4;
  const colChoice = idxChoice >= 0 ? idxChoice : 5;
  const colTotal = idxTotal >= 0 ? idxTotal : 6;
  const colPerkara = idxPerkara >= 0 ? idxPerkara : 7;
  const colExpense = idxExpense >= 0 ? idxExpense : 8;

  const parsed: SheetFinanceRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.every((c) => !c.trim())) continue;

    const timestamp = (cols[colTs] || '').trim();
    const name = (cols[colName] || '').trim();
    const checkIn = parseSheetDate(cols[colIn] || '');
    const checkOut = parseSheetDate(cols[colOut] || '');
    const rawChoice = (cols[colChoice] || '').trim();
    const unitType = parseStayChoice(rawChoice);
    const wangMasuk = parseSheetAmount(cols[colTotal] || '') ?? 0;
    const perkaraRaw = (cols[colPerkara] || '').trim();
    const wangKeluar = parseSheetAmount(cols[colExpense] || '') ?? 0;

    if (wangMasuk <= 0 && wangKeluar <= 0 && !perkaraRaw) {
      continue;
    }

    const derivedDate = checkIn || parseSheetDate(timestamp) || '';
    const unitLabel =
      unitType === 'homestay' ? 'Ss Homestay' : unitType === 'roomstay' ? 'Ss Roomstay' : '';

    let perkara = perkaraRaw;
    if (!perkara) {
      if (name && unitLabel) {
        perkara = `Tempahan ${unitLabel} · ${name}`;
      } else if (name) {
        perkara = `Tempahan · ${name}`;
      } else if (wangKeluar > 0) {
        perkara = `Perbelanjaan #${i}`;
      } else {
        perkara = `Bayaran Masuk #${i}`;
      }
    } else if (name && wangMasuk > 0 && wangKeluar === 0 && !perkara.toLowerCase().includes(name.toLowerCase())) {
      perkara = `${perkara} (${name})`;
    }

    // Append stay dates context cleanly if booking row without custom perkara
    if (!perkaraRaw && name && checkIn && checkOut) {
      perkara = `${unitLabel ? `Tempahan ${unitLabel}` : 'Tempahan'} · ${name}`;
    }

    parsed.push({
      id: `fin_${source}_${i}_${derivedDate || 'nodate'}`,
      rowIndex: i + 1,
      timestamp: timestamp || '—',
      date: derivedDate,
      name,
      unitType,
      rawChoice: rawChoice.toUpperCase(),
      perkara,
      wangMasuk,
      wangKeluar,
      source,
    });
  }

  return parsed;
}

export function parseCsvText(csvText: string): SheetBookingRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const matrix = lines.map(splitCsvLine);
  return parseSheetValues(matrix, 'csv');
}

export function parseCsvFinanceText(csvText: string): SheetFinanceRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const matrix = lines.map(splitCsvLine);
  return parseSheetFinanceValues(matrix, 'csv');
}

export interface SpreadsheetMetadata {
  title: string;
  sheets: Array<{ sheetId: number; title: string }>;
}

export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMetadata> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=properties.title,sheets.properties(sheetId,title)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Sesi kebenaran Google Sheets telah tamat. Sila klik "Sign in with Google" semula.');
    }
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Ralat HTTP ${res.status} semasa membaca Google Sheet.`;
    throw new Error(msg);
  }

  const json = await res.json();
  return {
    title: json?.properties?.title || 'Google Sheet Tempahan',
    sheets: Array.isArray(json?.sheets)
      ? json.sheets.map((s: { properties?: { sheetId?: number; title?: string } }) => ({
          sheetId: Number(s?.properties?.sheetId || 0),
          title: String(s?.properties?.title || 'Form Responses 1'),
        }))
      : [],
  };
}

function formatA1SheetTitle(sheetTitle: string): string {
  return `'${sheetTitle.replace(/'/g, "''")}'`;
}

export async function fetchSheetAllRows(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<{ rows: SheetBookingRow[]; financeRows: SheetFinanceRow[] }> {
  const range = `${formatA1SheetTitle(sheetTitle)}!A1:Z1000`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Sesi kebenaran Google Sheets telah tamat. Sila klik "Sign in with Google" semula.');
    }
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Ralat HTTP ${res.status} semasa memuatkan baris Google Sheet.`;
    throw new Error(msg);
  }

  const json = await res.json();
  const values: string[][] = Array.isArray(json?.values) ? json.values : [];
  return {
    rows: parseSheetValues(values, 'live-sheet'),
    financeRows: parseSheetFinanceValues(values, 'live-sheet'),
  };
}

export async function fetchSheetBookingRows(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<SheetBookingRow[]> {
  const res = await fetchSheetAllRows(spreadsheetId, sheetTitle, accessToken);
  return res.rows;
}

function toSheetSlashDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return `${m}/${d}/${y}`;
}

function formatNowSheetTimestamp(): string {
  const d = new Date();
  const datePart = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const timePart = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds()
  ).padStart(2, '0')}`;
  return `${datePart} ${timePart}`;
}

export async function appendBookingToSheet(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string,
  payload: {
    name: string;
    phone: string;
    checkIn: string;
    checkOut: string;
    unitType: UnitType;
    totalAmount?: number;
  }
): Promise<void> {
  const range = `${formatA1SheetTitle(sheetTitle)}!A:G`;
  const totalCell =
    typeof payload.totalAmount === 'number' && Number.isFinite(payload.totalAmount)
      ? Number(payload.totalAmount.toFixed(2))
      : '';
  const values = [
    [
      formatNowSheetTimestamp(),
      payload.name,
      payload.phone || '-',
      toSheetSlashDate(payload.checkIn),
      toSheetSlashDate(payload.checkOut),
      payload.unitType === 'homestay' ? 'H' : 'R',
      totalCell,
    ],
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Sesi kebenaran Google Sheets telah tamat. Sila klik "Sign in with Google" semula.');
    }
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Gagal menambah baris ke Google Sheet (HTTP ${res.status}).`;
    throw new Error(msg);
  }
}

export async function appendFinanceToSheet(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string,
  payload: {
    date: string;
    entryType: 'expense' | 'income';
    perkara: string;
    amount: number;
  }
): Promise<void> {
  const range = `${formatA1SheetTitle(sheetTitle)}!A:I`;
  const cleanAmount = Number(payload.amount.toFixed(2));
  const values = [
    [
      formatNowSheetTimestamp(),
      '',
      '',
      payload.date ? toSheetSlashDate(payload.date) : '',
      '',
      '',
      payload.entryType === 'income' ? cleanAmount : '',
      payload.perkara.trim(),
      payload.entryType === 'expense' ? cleanAmount : '',
    ],
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Sesi kebenaran Google Sheets telah tamat. Sila klik "Sign in with Google" semula.');
    }
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Gagal menambah rekod kewangan ke Google Sheet (HTTP ${res.status}).`;
    throw new Error(msg);
  }
}

export const APPS_SCRIPT_REGEX =
  /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/;

export function isValidAppsScriptUrl(input: string): boolean {
  return APPS_SCRIPT_REGEX.test(input.trim());
}

export const APPS_SCRIPT_TEMPLATE = `function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheets()[0];
  var values = sheet.getDataRange().getDisplayValues();
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      scriptVersion: 9,
      title: ss.getName(),
      tab: sheet.getName(),
      values: values
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        data = {};
      }
    }
    var params = (e && e.parameter) ? e.parameter : {};
    var action = String(data.action || params.action || 'booking').toLowerCase();
    var ts = data.timestamp || params.timestamp || Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'M/d/yyyy HH:mm:ss');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheets()[0];
    if (String(sheet.getRange(1, 7).getValue()).trim() === '') sheet.getRange(1, 7).setValue('JUMLAH');
    if (String(sheet.getRange(1, 8).getValue()).trim() === '') sheet.getRange(1, 8).setValue('PERKARA');
    if (String(sheet.getRange(1, 9).getValue()).trim() === '') sheet.getRange(1, 9).setValue('WANG KELUAR');

    var perkara = String(data.perkara || params.perkara || '').trim();
    var wangKeluarRaw = (data.wangKeluar !== undefined && data.wangKeluar !== '')
      ? data.wangKeluar
      : (params.wangKeluar !== undefined ? params.wangKeluar : '');
    var wangKeluar = wangKeluarRaw === '' ? '' : Number(wangKeluarRaw);
    if (wangKeluar !== '' && isNaN(wangKeluar)) wangKeluar = wangKeluarRaw;

    var jumlahRaw = (data.jumlah !== undefined && data.jumlah !== '')
      ? data.jumlah
      : (data.totalAmount !== undefined && data.totalAmount !== '')
      ? data.totalAmount
      : (params.jumlah !== undefined && params.jumlah !== '')
      ? params.jumlah
      : (params.totalAmount !== undefined ? params.totalAmount : '');
    var jumlah = jumlahRaw === '' ? '' : Number(jumlahRaw);
    if (jumlah !== '' && isNaN(jumlah)) jumlah = jumlahRaw;

    // Mode 1: Rekod Kewangan (Wang Keluar / Wang Masuk Lain-lain)
    if (action === 'finance' || action === 'expense' || (perkara && (wangKeluar !== '' || jumlah !== '') && !(data.keluar || params.keluar))) {
      var tarikh = data.tarikh || data.date || data.masuk || params.tarikh || params.date || params.masuk || '';
      if (!perkara || (wangKeluar === '' && jumlah === '')) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: false, error: 'Maklumat perkara atau jumlah kewangan tidak lengkap.' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      sheet.appendRow([ts, '', '', tarikh, '', '', jumlah, perkara, wangKeluar]);
      var finRow = sheet.getLastRow();
      if (jumlah !== '') sheet.getRange(finRow, 7).setValue(jumlah);
      if (perkara !== '') sheet.getRange(finRow, 8).setValue(perkara);
      if (wangKeluar !== '') sheet.getRange(finRow, 9).setValue(wangKeluar);
      SpreadsheetApp.flush();
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, scriptVersion: 9, row: finRow, perkara: perkara, jumlah: jumlah, wangKeluar: wangKeluar }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Mode 2: Rekod Tempahan (Homestay / Roomstay)
    var nama = data.nama || data.name || params.nama || params.name || '';
    var telefon = data.telefon || data.phone || params.telefon || params.phone || '-';
    var masuk = data.masuk || data.checkIn || params.masuk || params.checkIn || '';
    var keluar = data.keluar || data.checkOut || params.keluar || params.checkOut || '';
    var pilihan = data.pilihan || data.choice || params.pilihan || params.choice || 'H';

    if (!nama || !masuk || !keluar) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'Data tempahan tidak lengkap.' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    sheet.appendRow([ts, nama, telefon, masuk, keluar, pilihan, jumlah, perkara, wangKeluar]);
    var writtenRow = sheet.getLastRow();
    if (jumlah !== '' && String(sheet.getRange(writtenRow, 7).getValue()).trim() === '') {
      sheet.getRange(writtenRow, 7).setValue(jumlah);
    }
    SpreadsheetApp.flush();

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, row: writtenRow, jumlah: jumlah }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

function parseWebhookObjectRows(items: Array<Record<string, unknown>>): SheetBookingRow[] {
  const parsed: SheetBookingRow[] = [];

  items.forEach((item, idx) => {
    const timestamp = String(item.timestamp ?? item.Timestamp ?? '—').trim();
    const name = String(item.nama ?? item.NAMA ?? item.name ?? item.Name ?? '').trim();
    const phoneRaw = item.telefon ?? item.TELEFON ?? item['no. telefon'] ?? item.phone ?? '';
    const phone = String(phoneRaw).trim();
    const rawIn = String(item.masuk ?? item.MASUK ?? item['tarikh masuk'] ?? item.checkIn ?? '').trim();
    const rawOut = String(item.keluar ?? item.KELUAR ?? item['tarikh keluar'] ?? item.checkOut ?? '').trim();
    const rawChoice = String(
      item.pilihan ?? item.PILIHAN ?? item['pilihan menginap'] ?? item.choice ?? item.unitType ?? ''
    ).trim();
    const rawTotal = String(
      item.jumlah ?? item.JUMLAH ?? item['jumlah (rm)'] ?? item.totalAmount ?? item.total ?? item.amount ?? ''
    ).trim();
    const perkara = String(item.perkara ?? item.PERKARA ?? item.catatan ?? '').trim() || undefined;
    const rawExpense = String(item.wangKeluar ?? item['WANG KELUAR'] ?? item['wang keluar'] ?? '').trim();

    const checkIn = parseSheetDate(rawIn);
    const checkOut = parseSheetDate(rawOut);
    const unitType = parseStayChoice(rawChoice);
    const totalAmount = parseSheetAmount(rawTotal);
    const expenseAmount = parseSheetAmount(rawExpense);

    if (!name || !checkIn || !checkOut || !unitType || checkOut <= checkIn) {
      return;
    }

    parsed.push({
      id: `sheet_live_${idx + 1}_${checkIn}_${unitType}`,
      timestamp: timestamp || '—',
      name,
      phone: phone || '—',
      checkIn,
      checkOut,
      unitType,
      rawChoice: rawChoice.toUpperCase() || (unitType === 'homestay' ? 'H' : 'R'),
      totalAmount,
      perkara,
      expenseAmount,
      source: 'live-sheet',
    });
  });

  return parsed;
}

function parseWebhookObjectFinanceRows(items: Array<Record<string, unknown>>): SheetFinanceRow[] {
  const parsed: SheetFinanceRow[] = [];

  items.forEach((item, idx) => {
    const timestamp = String(item.timestamp ?? item.Timestamp ?? '—').trim();
    const name = String(item.nama ?? item.NAMA ?? item.name ?? item.Name ?? '').trim();
    const rawIn = String(item.masuk ?? item.MASUK ?? item['tarikh masuk'] ?? item.tarikh ?? item.checkIn ?? '').trim();
    const rawChoice = String(
      item.pilihan ?? item.PILIHAN ?? item['pilihan menginap'] ?? item.choice ?? item.unitType ?? ''
    ).trim();
    const rawTotal = String(
      item.jumlah ?? item.JUMLAH ?? item['jumlah (rm)'] ?? item.totalAmount ?? item.total ?? item.amount ?? ''
    ).trim();
    const perkaraRaw = String(item.perkara ?? item.PERKARA ?? item.catatan ?? '').trim();
    const rawExpense = String(item.wangKeluar ?? item['WANG KELUAR'] ?? item['wang keluar'] ?? '').trim();

    const wangMasuk = parseSheetAmount(rawTotal) ?? 0;
    const wangKeluar = parseSheetAmount(rawExpense) ?? 0;
    if (wangMasuk <= 0 && wangKeluar <= 0 && !perkaraRaw) {
      return;
    }

    const unitType = parseStayChoice(rawChoice);
    const derivedDate = parseSheetDate(rawIn) || parseSheetDate(timestamp) || '';
    const unitLabel =
      unitType === 'homestay' ? 'Ss Homestay' : unitType === 'roomstay' ? 'Ss Roomstay' : '';
    const perkara =
      perkaraRaw ||
      (name && unitLabel
        ? `Tempahan ${unitLabel} · ${name}`
        : name
        ? `Tempahan · ${name}`
        : wangKeluar > 0
        ? `Perbelanjaan #${idx + 1}`
        : `Bayaran Masuk #${idx + 1}`);

    parsed.push({
      id: `fin_live_${idx + 1}_${derivedDate || 'nodate'}`,
      rowIndex: idx + 2,
      timestamp: timestamp || '—',
      date: derivedDate,
      name,
      unitType,
      rawChoice: rawChoice.toUpperCase(),
      perkara,
      wangMasuk,
      wangKeluar,
      source: 'live-sheet',
    });
  });

  return parsed;
}

export async function fetchWebhookSheetRows(
  webhookUrl: string
): Promise<{
  title: string;
  tab: string;
  rows: SheetBookingRow[];
  financeRows: SheetFinanceRow[];
  scriptVersion?: number;
}> {
  const cleanUrl = webhookUrl.trim();
  if (!isValidAppsScriptUrl(cleanUrl)) {
    throw new Error('Pautan Apps Script Web App tidak sah. Mesti bermula dengan https://script.google.com/macros/s/.../exec');
  }

  const separator = cleanUrl.includes('?') ? '&' : '?';
  const bustUrl = `${cleanUrl}${separator}_ts=${Date.now()}`;
  const res = await fetch(bustUrl, { method: 'GET', cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Gagal membaca data Apps Script (HTTP ${res.status}). Pastikan akses Web App ditetapkan kepada "Anyone".`);
  }

  const json = await res.json().catch(() => null);
  if (!json) {
    throw new Error('Format respons Apps Script tidak sah (bukan JSON).');
  }

  const scriptVersion =
    typeof json?.scriptVersion === 'number' ? json.scriptVersion : undefined;

  // Case 1: { values: [[...], [...]] } or [[...], [...]]
  if (Array.isArray(json?.values) || (Array.isArray(json) && Array.isArray(json[0]))) {
    const values: string[][] = Array.isArray(json?.values) ? json.values : json;
    return {
      title: typeof json?.title === 'string' && json.title ? json.title : 'SISTEM BOOKING (Responses)',
      tab: typeof json?.tab === 'string' && json.tab ? json.tab : 'Form Responses 1',
      rows: parseSheetValues(values, 'live-sheet'),
      financeRows: parseSheetFinanceValues(values, 'live-sheet'),
      scriptVersion,
    };
  }

  // Case 2: Array of row objects [{ nama, telefon, masuk, keluar, pilihan }, ...]
  const objectItems: Array<Record<string, unknown>> | null = Array.isArray(json)
    ? json
    : Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.rows)
    ? json.rows
    : null;

  if (objectItems) {
    return {
      title: typeof json?.title === 'string' && json.title ? json.title : 'SISTEM BOOKING (Responses)',
      tab: typeof json?.tab === 'string' && json.tab ? json.tab : 'Form Responses 1',
      rows: parseWebhookObjectRows(objectItems),
      financeRows: parseWebhookObjectFinanceRows(objectItems),
      scriptVersion,
    };
  }

  throw new Error('Format respons Apps Script tidak dikenali.');
}

function findMatchingBookingRow(
  rows: SheetBookingRow[],
  payload: {
    name: string;
    checkIn: string;
    checkOut: string;
    unitType: UnitType;
  }
): SheetBookingRow | undefined {
  const targetName = payload.name.trim().toLowerCase();
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (
      r.unitType === payload.unitType &&
      r.checkIn === payload.checkIn &&
      r.checkOut === payload.checkOut &&
      r.name.trim().toLowerCase() === targetName
    ) {
      return r;
    }
  }
  return undefined;
}

export interface WebhookAppendResult {
  verified: boolean;
  missingTotalColumn?: boolean;
  title: string;
  tab: string;
  rows: SheetBookingRow[];
  financeRows: SheetFinanceRow[];
}

export async function appendBookingToWebhook(
  webhookUrl: string,
  payload: {
    name: string;
    phone: string;
    checkIn: string;
    checkOut: string;
    unitType: UnitType;
    totalAmount?: number;
  }
): Promise<WebhookAppendResult> {
  const cleanUrl = webhookUrl.trim();
  if (!isValidAppsScriptUrl(cleanUrl)) {
    throw new Error('Pautan Apps Script Web App tidak sah.');
  }

  const timestamp = formatNowSheetTimestamp();
  const slashCheckIn = toSheetSlashDate(payload.checkIn);
  const slashCheckOut = toSheetSlashDate(payload.checkOut);
  const choiceCode = payload.unitType === 'homestay' ? 'H' : 'R';
  const cleanPhone = payload.phone || '-';
  const formattedTotal =
    typeof payload.totalAmount === 'number' && Number.isFinite(payload.totalAmount)
      ? String(Math.round(payload.totalAmount * 100) / 100)
      : '';

  const bodyFields = {
    action: 'booking',
    timestamp,
    nama: payload.name,
    telefon: cleanPhone,
    masuk: slashCheckIn,
    keluar: slashCheckOut,
    pilihan: choiceCode,
    jumlah: formattedTotal,
    name: payload.name,
    phone: cleanPhone,
    checkIn: slashCheckIn,
    checkOut: slashCheckOut,
    choice: choiceCode,
    totalAmount: formattedTotal,
  };

  // Send fields both as URL query parameters (e.parameter) and JSON text/plain body (e.postData.contents)
  const queryParams = new URLSearchParams(bodyFields);
  const separator = cleanUrl.includes('?') ? '&' : '?';
  const postUrl = `${cleanUrl}${separator}${queryParams.toString()}`;

  let postNetworkOrCorsError: Error | null = null;
  let postErrorMessage: string | null = null;
  let missingDoPostDetected = false;

  try {
    const res = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(bodyFields),
    });

    const rawText = await res.text().catch(() => '');
    if (rawText.includes('Script function not found: doPost')) {
      missingDoPostDetected = true;
    } else if (!res.ok) {
      postErrorMessage = `Gagal menghantar tempahan ke Apps Script (HTTP ${res.status}).`;
    } else if (rawText.trim().startsWith('{')) {
      const parsed = JSON.parse(rawText) as { ok?: boolean; error?: string; status?: string };
      if (parsed.ok === false || parsed.status === 'error') {
        postErrorMessage = parsed.error || 'Apps Script memulangkan ralat semasa menambah baris.';
      }
    }
  } catch (err) {
    postNetworkOrCorsError = err instanceof Error ? err : new Error('Gagal berhubung dengan Apps Script (POST).');
    // Brief wait in case Apps Script wrote the row before an opaque redirect lacked CORS headers
    await new Promise((resolve) => setTimeout(resolve, 650));
  }

  // Verify ground truth by reading live rows back from the Google Sheet
  let refreshed: { title: string; tab: string; rows: SheetBookingRow[]; financeRows: SheetFinanceRow[] } | null = null;
  try {
    refreshed = await fetchWebhookSheetRows(cleanUrl);
  } catch {
    refreshed = null;
  }

  const matchedRow = refreshed ? findMatchingBookingRow(refreshed.rows, payload) : undefined;
  if (refreshed && matchedRow) {
    const expectedTotal =
      typeof payload.totalAmount === 'number' && Number.isFinite(payload.totalAmount)
        ? Math.round(payload.totalAmount * 100) / 100
        : undefined;
    const missingTotalColumn =
      expectedTotal !== undefined && matchedRow.totalAmount === undefined;

    return {
      verified: true,
      missingTotalColumn,
      title: refreshed.title,
      tab: refreshed.tab,
      rows: refreshed.rows,
      financeRows: refreshed.financeRows,
    };
  }

  if (missingDoPostDetected) {
    throw new Error(
      'Web App Apps Script ini belum mempunyai fungsi doPost(e) untuk menulis baris baharu. Buka kod panduan di bawah, salin fungsi doGet + doPost, dan klik Deploy → New deployment (Anyone).'
    );
  }

  if (postErrorMessage) {
    throw new Error(postErrorMessage);
  }

  if (postNetworkOrCorsError && refreshed) {
    throw new Error(
      'Rekod tidak dapat disimpan ke Google Sheet. Pautan Apps Script semasa berjaya dibaca (GET), tetapi permintaan menulis (POST / doPost) disekat atau fungsi doPost(e) tiada dalam deployment ini. Sila salin kod lengkap (doGet + doPost) di panel bawah dan klik Deploy → New deployment.'
    );
  }

  if (postNetworkOrCorsError) {
    throw new Error(
      'Gagal menyambung ke Apps Script Web App untuk menyimpan data. Pastikan akses Web App ditetapkan kepada "Anyone" dan mengandungi fungsi doPost(e).'
    );
  }

  throw new Error(
    'Permintaan dihantar, tetapi baris baharu tidak kelihatan dalam Google Sheet selepas semakan semula. Pastikan fungsi doPost(e) dalam Apps Script menulis ke helaian pertama (getSheets()[0]) dengan susunan lajur yang betul dan sudah dibuat New deployment.'
  );
}

function findMatchingFinanceRow(
  financeRows: SheetFinanceRow[],
  payload: {
    perkara: string;
    entryType: 'expense' | 'income';
    amount: number;
  }
): SheetFinanceRow | undefined {
  const targetPerkara = payload.perkara.trim().toLowerCase();
  const targetAmount = Math.round(payload.amount * 100) / 100;

  for (let i = financeRows.length - 1; i >= 0; i--) {
    const r = financeRows[i];
    const rowAmount = payload.entryType === 'expense' ? r.wangKeluar : r.wangMasuk;
    if (
      r.perkara.trim().toLowerCase() === targetPerkara &&
      Math.abs(rowAmount - targetAmount) < 0.01
    ) {
      return r;
    }
  }
  return undefined;
}

export async function appendFinanceToWebhook(
  webhookUrl: string,
  payload: {
    date: string;
    entryType: 'expense' | 'income';
    perkara: string;
    amount: number;
  }
): Promise<WebhookAppendResult> {
  const cleanUrl = webhookUrl.trim();
  if (!isValidAppsScriptUrl(cleanUrl)) {
    throw new Error('Pautan Apps Script Web App tidak sah.');
  }

  const timestamp = formatNowSheetTimestamp();
  const slashDate = payload.date ? toSheetSlashDate(payload.date) : '';
  const formattedAmount = String(Math.round(payload.amount * 100) / 100);
  const cleanPerkara = payload.perkara.trim();

  const bodyFields = {
    action: 'finance',
    timestamp,
    tarikh: slashDate,
    date: slashDate,
    perkara: cleanPerkara,
    jumlah: payload.entryType === 'income' ? formattedAmount : '',
    wangKeluar: payload.entryType === 'expense' ? formattedAmount : '',
  };

  const queryParams = new URLSearchParams(bodyFields);
  const separator = cleanUrl.includes('?') ? '&' : '?';
  const postUrl = `${cleanUrl}${separator}${queryParams.toString()}`;

  let postErrorMessage: string | null = null;
  let needsScriptUpgrade = false;

  try {
    const res = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(bodyFields),
    });

    const rawText = await res.text().catch(() => '');
    if (rawText.includes('Script function not found: doPost')) {
      needsScriptUpgrade = true;
    } else if (rawText.trim().startsWith('{')) {
      const parsed = JSON.parse(rawText) as { ok?: boolean; error?: string };
      if (parsed.ok === false) {
        postErrorMessage = parsed.error || '';
        if (postErrorMessage.toLowerCase().includes('tempahan tidak lengkap')) {
          needsScriptUpgrade = true;
        }
      }
    }
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 650));
  }

  let refreshed: { title: string; tab: string; rows: SheetBookingRow[]; financeRows: SheetFinanceRow[] } | null = null;
  try {
    refreshed = await fetchWebhookSheetRows(cleanUrl);
  } catch {
    refreshed = null;
  }

  const matched = refreshed ? findMatchingFinanceRow(refreshed.financeRows, payload) : undefined;
  if (refreshed && matched) {
    return {
      verified: true,
      title: refreshed.title,
      tab: refreshed.tab,
      rows: refreshed.rows,
      financeRows: refreshed.financeRows,
    };
  }

  if (needsScriptUpgrade) {
    throw new Error(
      'APPS_SCRIPT_NEEDS_9COL_UPGRADE: Rekod telah disimpan dalam sistem Admin, tetapi Apps Script semasa belum menyokong lajur PERKARA & WANG KELUAR. Sila salin kod Apps Script 9-kolum dan kemas kini deployment (Manage deployments → New version).'
    );
  }

  if (postErrorMessage) {
    throw new Error(postErrorMessage);
  }

  throw new Error(
    'APPS_SCRIPT_NEEDS_9COL_UPGRADE: Rekod disimpan dalam sistem Admin, tetapi belum muncul dalam Google Sheet (kolum PERKARA & WANG KELUAR). Sila kemas kini Apps Script kepada versi 9-kolum.'
  );
}

