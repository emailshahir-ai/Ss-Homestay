export const MALAY_MONTHS = [
  'Januari',
  'Februari',
  'Mac',
  'April',
  'Mei',
  'Jun',
  'Julai',
  'Ogos',
  'September',
  'Oktober',
  'November',
  'Disember',
] as const;

export const MALAY_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mac',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Ogos',
  'Sep',
  'Okt',
  'Nov',
  'Dis',
] as const;

export const MALAY_WEEKDAYS_SHORT = [
  'Isn',
  'Sel',
  'Rab',
  'Kha',
  'Jum',
  'Sab',
  'Ahd',
] as const;

export function toDateString(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function getTodayString(): string {
  const now = new Date();
  return toDateString(now.getFullYear(), now.getMonth(), now.getDate());
}

export function parseDateString(dateStr: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

export function formatDisplayDate(dateStr: string): string {
  const parsed = parseDateString(dateStr);
  if (!parsed) return '—';
  return `${parsed.day} ${MALAY_MONTHS_SHORT[parsed.month]} ${parsed.year}`;
}

export function formatLongDate(dateStr: string): string {
  const parsed = parseDateString(dateStr);
  if (!parsed) return '—';
  return `${parsed.day} ${MALAY_MONTHS[parsed.month]} ${parsed.year}`;
}

export function calculateNights(checkIn: string, checkOut: string): number {
  const start = parseDateString(checkIn);
  const end = parseDateString(checkOut);
  if (!start || !end) return 0;
  const utcStart = Date.UTC(start.year, start.month, start.day);
  const utcEnd = Date.UTC(end.year, end.month, end.day);
  const diff = Math.round((utcEnd - utcStart) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

/**
 * Checks if a given calendar day (YYYY-MM-DD) is occupied by a booking [checkIn, checkOut).
 * Standard hospitality logic: check-in night through night before check-out is occupied;
 * check-out day itself is available for a new guest to check in.
 */
export function isNightOccupied(dayStr: string, checkIn: string, checkOut: string): boolean {
  return dayStr >= checkIn && dayStr < checkOut;
}

/**
 * Checks if two half-open stay intervals [startA, endA) and [startB, endB) overlap.
 */
export function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && endA > startB;
}

export function getMonthCalendarDays(year: number, monthIndex: number): Array<{ dateStr: string; day: number } | null> {
  const firstDay = new Date(year, monthIndex, 1);
  // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: Array<{ dateStr: string; day: number } | null> = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      dateStr: toDateString(year, monthIndex, day),
      day,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function formatMYR(amount: number): string {
  return `RM ${amount.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
