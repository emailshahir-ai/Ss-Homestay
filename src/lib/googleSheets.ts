import { SheetBookingRow, UnitType } from '../types/homestay';

export const ATTACHED_SHEET_CSV_URL = '/assets/aistudio/SISTEM_BOOKING__Responses__b39c7d1f';

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Parses Google Sheet / Google Forms date formats into YYYY-MM-DD.
 * Supports M/D/YYYY (e.g. 1/2/2026, 10/12/2026) and YYYY-MM-DD.
 */
export function parseSheetDate(raw: string): string | null {
  const val = raw.trim();
  if (!val) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return val;
  }

  const slashMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
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
  const idxCheckOut = header.findIndex((h) => h.includes('KELUAR') || h.includes('CHECK OUT'));
  const idxChoice = header.findIndex((h) => h.includes('PILIHAN') || h.includes('MENGINAP') || h.includes('UNIT'));

  const colTs = idxTimestamp >= 0 ? idxTimestamp : 0;
  const colName = idxName >= 0 ? idxName : 1;
  const colPhone = idxPhone >= 0 ? idxPhone : 2;
  const colIn = idxCheckIn >= 0 ? idxCheckIn : 3;
  const colOut = idxCheckOut >= 0 ? idxCheckOut : 4;
  const colChoice = idxChoice >= 0 ? idxChoice : 5;

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

export async function fetchSheetBookingRows(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<SheetBookingRow[]> {
  const range = `${sheetTitle}!A1:Z1000`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Ralat HTTP ${res.status} semasa memuatkan baris Google Sheet.`;
    throw new Error(msg);
  }

  const json = await res.json();
  const values: string[][] = Array.isArray(json?.values) ? json.values : [];
  return parseSheetValues(values, 'live-sheet');
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
  }
): Promise<void> {
  const range = `${sheetTitle}!A:F`;
  const values = [
    [
      formatNowSheetTimestamp(),
      payload.name,
      payload.phone || '-',
      toSheetSlashDate(payload.checkIn),
      toSheetSlashDate(payload.checkOut),
      payload.unitType === 'homestay' ? 'H' : 'R',
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
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Gagal menambah baris ke Google Sheet (HTTP ${res.status}).`;
    throw new Error(msg);
  }
}
