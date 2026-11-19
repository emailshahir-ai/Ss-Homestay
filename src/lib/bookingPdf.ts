import { jsPDF } from 'jspdf';
import {
  AvailabilitySlot,
  Booking,
  SheetBookingRow,
  UNIT_RATES,
  UnitType,
} from '../types/homestay';
import { calculateNights, formatDisplayDate, formatMYR } from './dateUtils';
import { HOMESTAY_DETAILS, LOCATION_INFO } from '../data/propertyData';

export interface BookingPdfPayload {
  referenceId: string;
  unitType: UnitType;
  guestName: string;
  phone?: string;
  state?: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  discountAmount?: number;
  totalAmount: number;
  accountNumber?: string;
  status: 'confirmed' | 'cancelled';
  sourceLabel: string;
}

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'Tetamu';
}

function formatPrintedTimestamp(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

const PDF_LOGO_URL = '/assets/aistudio/logo_hs_dn_rs_0f215409.png';
const PDF_LOGO_ASPECT = 2480 / 1002;
let cachedLogoDataUrl: string | null = null;

async function loadLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const res = await fetch(PDF_LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Invalid Data URL'));
        }
      };
      reader.onerror = () => reject(reader.error || new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
    cachedLogoDataUrl = dataUrl;
    return dataUrl;
  } catch {
    return null;
  }
}

export async function generateBookingPdf(payload: BookingPdfPayload): Promise<void> {
  const logoDataUrl = await loadLogoDataUrl();

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const unitConfig = UNIT_RATES[payload.unitType];
  const computedNights =
    payload.nights > 0 ? payload.nights : Math.max(1, calculateNights(payload.checkIn, payload.checkOut));
  const baseSubtotal = computedNights * unitConfig.ratePerNight;
  const discountVal = Math.max(0, Number(payload.discountAmount || 0));
  const computedTotal =
    Number.isFinite(payload.totalAmount) && payload.totalAmount >= 0
      ? payload.totalAmount
      : Math.max(0, baseSubtotal - discountVal);

  // 1. Header Banner (Top Forest Green Accent Bar + Clean White Header with Brand Logo)
  doc.setFillColor(20, 83, 45);
  doc.rect(0, 0, pageWidth, 4, 'F');

  if (logoDataUrl) {
    const logoHeight = 23;
    const logoWidth = logoHeight * PDF_LOGO_ASPECT;
    doc.addImage(logoDataUrl, 'PNG', margin, 8, logoWidth, logoHeight, undefined, 'FAST');
    doc.setTextColor(82, 92, 84);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.text(
      'Lot 13085, Kg. Padang Enggang · Tel / WhatsApp: 016-9867367 / 016-9863776',
      margin,
      37
    );
  } else {
    doc.setTextColor(20, 83, 45);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('SS HOMESTAY & ROOMSTAY', margin, 16);

    doc.setTextColor(82, 92, 84);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(LOCATION_INFO.address, margin, 22.5);
    doc.text('Tel / WhatsApp: 016-9867367 (Hjh. Sarina) | 016-9863776 (Hj. Shahir)', margin, 28);
  }

  doc.setTextColor(20, 83, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('SLIP PENGESAHAN TEMPAHAN', pageWidth - margin, 16, { align: 'right' });

  doc.setTextColor(82, 92, 84);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`No. Rujukan: ${payload.referenceId}`, pageWidth - margin, 22.5, { align: 'right' });
  doc.text(`Dicetak: ${formatPrintedTimestamp()}`, pageWidth - margin, 28, { align: 'right' });

  doc.setDrawColor(20, 83, 45);
  doc.setLineWidth(0.5);
  doc.line(margin, 42, pageWidth - margin, 42);
  doc.setLineWidth(0.2);

  let y = 49;

  // 2. Unit & Status Highlight Box
  doc.setFillColor(248, 249, 247);
  doc.setDrawColor(221, 226, 220);
  doc.roundedRect(margin, y, contentWidth, 20, 3, 3, 'FD');

  doc.setTextColor(82, 92, 84);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('JENIS PENGINAPAN', margin + 5, y + 6.5);

  doc.setTextColor(22, 27, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`${unitConfig.label} (RM ${unitConfig.ratePerNight} / malam)`, margin + 5, y + 14);

  const isConfirmed = payload.status === 'confirmed';
  const badgeText = isConfirmed ? 'DISAHKAN' : 'DIBATALKAN';
  const badgeW = 32;
  const badgeX = pageWidth - margin - badgeW - 5;
  doc.setFillColor(isConfirmed ? 20 : 185, isConfirmed ? 83 : 28, isConfirmed ? 45 : 28);
  doc.roundedRect(badgeX, y + 5, badgeW, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(badgeText, badgeX + badgeW / 2, y + 11.3, { align: 'center' });

  y += 28;

  // 3. Guest & Stay Details Table
  doc.setTextColor(22, 27, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Maklumat Tetamu & Penginapan', margin, y);
  y += 4;

  const detailRows: Array<[string, string]> = [
    ['Nama Penuh Tetamu', payload.guestName || 'Tetamu Berdaftar'],
    ['No. Telefon', payload.phone?.trim() || '-'],
    ['Negeri Asal', payload.state?.trim() || '-'],
    ['Tarikh Masuk (Check-In)', `${formatDisplayDate(payload.checkIn)} (03:00 PM)`],
    ['Tarikh Keluar (Check-Out)', `${formatDisplayDate(payload.checkOut)} (12:00 PM)`],
    ['Tempoh Penginapan', `${computedNights} Malam`],
    ['No. Akaun / Rujukan', payload.accountNumber?.trim() || payload.sourceLabel],
  ];

  const rowHeight = 9.5;
  const tableHeight = detailRows.length * rowHeight;
  doc.setDrawColor(221, 226, 220);
  doc.roundedRect(margin, y, contentWidth, tableHeight, 2.5, 2.5, 'S');

  detailRows.forEach(([label, value], index) => {
    const rowY = y + index * rowHeight;
    if (index % 2 === 0) {
      doc.setFillColor(248, 249, 247);
      doc.rect(margin + 0.3, rowY + 0.3, contentWidth - 0.6, rowHeight - 0.6, 'F');
    }
    if (index > 0) {
      doc.setDrawColor(235, 239, 235);
      doc.line(margin, rowY, margin + contentWidth, rowY);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(82, 92, 84);
    doc.text(label, margin + 5, rowY + 6.3);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 27, 23);
    doc.text(value, margin + 65, rowY + 6.3);
  });

  y += tableHeight + 10;

  // 4. Payment Summary Box
  doc.setTextColor(22, 27, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Ringkasan Bayaran', margin, y);
  y += 4;

  const hasDiscount = discountVal > 0;
  const summaryBoxHeight = hasDiscount ? 42 : 34;

  doc.setFillColor(241, 247, 243);
  doc.setDrawColor(132, 179, 149);
  doc.roundedRect(margin, y, contentWidth, summaryBoxHeight, 3, 3, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(82, 92, 84);
  doc.text(`Kadar Penginapan (${computedNights} malam x RM ${unitConfig.ratePerNight})`, margin + 5, y + 8);
  doc.setTextColor(22, 27, 23);
  doc.setFont('helvetica', 'bold');
  doc.text(formatMYR(baseSubtotal), pageWidth - margin - 5, y + 8, { align: 'right' });

  let nextLineY = y + 16;
  if (hasDiscount) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 83, 45);
    doc.text('Diskaun Harga', margin + 5, nextLineY);
    doc.setFont('helvetica', 'bold');
    doc.text(`- ${formatMYR(discountVal)}`, pageWidth - margin - 5, nextLineY, { align: 'right' });
    nextLineY += 8;
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(82, 92, 84);
  doc.text('Deposit Keselamatan (Semasa Check-In)', margin + 5, nextLineY);
  doc.setTextColor(22, 27, 23);
  doc.text(`RM ${HOMESTAY_DETAILS.deposit}.00 (Dipulangkan selepas check-out)`, pageWidth - margin - 5, nextLineY, {
    align: 'right',
  });

  const dividerY = nextLineY + 4.5;
  doc.setDrawColor(198, 222, 201);
  doc.line(margin + 5, dividerY, pageWidth - margin - 5, dividerY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 83, 45);
  doc.text('JUMLAH PENGINAPAN', margin + 5, dividerY + 8);
  doc.setFontSize(13);
  doc.text(formatMYR(computedTotal), pageWidth - margin - 5, dividerY + 8, { align: 'right' });

  y += summaryBoxHeight + 10;

  // 5. House Rules & Guest Policy Box
  doc.setTextColor(22, 27, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Panduan & Polisi Penginapan', margin, y);
  y += 4;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(221, 226, 220);
  doc.roundedRect(margin, y, contentWidth, 44, 3, 3, 'FD');

  const guidelines = [
    '1. Waktu Check-In: 03:00 PM | Waktu Check-Out: 12:00 PM.',
    '2. Muslim Homestay: Untuk keluarga diutamakan, sama jantina dan pasangan berkahwin sahaja.',
    '3. Dilarang merokok di dalam kawasan rumah dan dilarang membawa durian ke dalam penginapan.',
    '4. Sila jaga kebersihan rumah, kolam renang dan kemudahan yang disediakan sepanjang menginap.',
    '5. Sebarang pertanyaan atau pemakluman ketibaan, sila WhatsApp: 016-9867367 / 016-9863776.',
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(58, 66, 60);
  guidelines.forEach((line, idx) => {
    doc.text(line, margin + 5, y + 8 + idx * 7.2);
  });

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(221, 226, 220);
  doc.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 118, 112);
  doc.text(
    'Slip ini dijana secara rasmi oleh Sistem Pengurusan Tempahan Ss Homestay & Roomstay.',
    margin,
    pageHeight - 13
  );
  doc.text('Padang Enggang, Kota Bharu, Kelantan', pageWidth - margin, pageHeight - 13, {
    align: 'right',
  });

  const unitTag = payload.unitType === 'homestay' ? 'SsHomestay' : 'SsRoomstay';
  const guestTag = sanitizeFilenamePart(payload.guestName);
  const filename = `Slip-Tempahan-${unitTag}-${guestTag}-${payload.checkIn}.pdf`;
  doc.save(filename);
}

export async function downloadBookingPdf(booking: Booking): Promise<void> {
  await generateBookingPdf({
    referenceId: booking.id,
    unitType: booking.unitType,
    guestName: booking.guestName,
    phone: booking.phone,
    state: booking.state,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    nights: booking.nights,
    discountAmount: booking.discountAmount,
    totalAmount: booking.totalAmount,
    accountNumber: booking.accountNumber,
    status: booking.status,
    sourceLabel: 'Rekod Sistem Admin',
  });
}

export async function downloadSheetBookingPdf(row: SheetBookingRow): Promise<void> {
  const nights = Math.max(1, calculateNights(row.checkIn, row.checkOut));
  const baseSubtotal = nights * UNIT_RATES[row.unitType].ratePerNight;
  const hasRecordedTotal = typeof row.totalAmount === 'number' && Number.isFinite(row.totalAmount) && row.totalAmount >= 0;
  const totalAmount = hasRecordedTotal ? row.totalAmount! : baseSubtotal;
  const derivedDiscount = hasRecordedTotal && baseSubtotal > totalAmount ? Math.round((baseSubtotal - totalAmount) * 100) / 100 : 0;

  await generateBookingPdf({
    referenceId: `GS-${row.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 14)}`,
    unitType: row.unitType,
    guestName: row.name,
    phone: row.phone,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    nights,
    discountAmount: derivedDiscount,
    totalAmount,
    accountNumber: row.timestamp ? `Google Sheet (${row.timestamp})` : 'Rekod Google Sheet',
    status: 'confirmed',
    sourceLabel: 'Rekod Google Sheet',
  });
}

export async function downloadCalendarSlotPdf(
  slot: AvailabilitySlot,
  matchedBooking?: Booking,
  matchedSheet?: SheetBookingRow
): Promise<void> {
  if (matchedBooking) {
    await downloadBookingPdf(matchedBooking);
    return;
  }
  if (matchedSheet) {
    await downloadSheetBookingPdf(matchedSheet);
    return;
  }

  const nights = Math.max(1, calculateNights(slot.checkIn, slot.checkOut));
  const totalAmount = nights * UNIT_RATES[slot.unitType].ratePerNight;
  await generateBookingPdf({
    referenceId: slot.bookingId || slot.id,
    unitType: slot.unitType,
    guestName: slot.guestName || 'Tetamu Berdaftar',
    checkIn: slot.checkIn,
    checkOut: slot.checkOut,
    nights,
    totalAmount,
    status: slot.status,
    sourceLabel: slot.source === 'sheet' ? 'Rekod Google Sheet' : 'Rekod Kalendar',
  });
}
