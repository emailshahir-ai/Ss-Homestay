import { jsPDF } from 'jspdf';
import { formatDisplayDate, formatMYR } from './dateUtils';

export interface FinancePdfLedgerItem {
  date: string;
  perkara: string;
  sourceLabel: string;
  wangMasuk: number;
  wangKeluar: number;
  runningBalance: number;
}

export interface FinanceReportPdfPayload {
  sheetTitle: string;
  periodLabel: string;
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  items: FinancePdfLedgerItem[];
}

const PDF_LOGO_URL = '/assets/aistudio/logo_hs_dn_rs_0f215409.png';
const PDF_LOGO_ASPECT = 2480 / 1002;
let cachedFinanceLogoDataUrl: string | null = null;

async function loadLogoDataUrl(): Promise<string | null> {
  if (cachedFinanceLogoDataUrl) return cachedFinanceLogoDataUrl;
  try {
    const res = await fetch(PDF_LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Invalid Data URL'));
      };
      reader.onerror = () => reject(reader.error || new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
    cachedFinanceLogoDataUrl = dataUrl;
    return dataUrl;
  } catch {
    return null;
  }
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

function truncateText(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1)}...`;
}

export async function downloadFinanceReportPdf(payload: FinanceReportPdfPayload): Promise<void> {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Top accent bar
  doc.setFillColor(20, 83, 45);
  doc.rect(0, 0, pageWidth, 4, 'F');

  if (logoDataUrl) {
    const logoH = 20;
    const logoW = logoH * PDF_LOGO_ASPECT;
    doc.addImage(logoDataUrl, 'PNG', margin, 8, logoW, logoH, undefined, 'FAST');
  } else {
    doc.setTextColor(20, 83, 45);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('SS HOMESTAY & ROOMSTAY', margin, 17);
  }

  doc.setTextColor(20, 83, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('LAPORAN ANALISIS KEWANGAN', pageWidth - margin, 14.5, { align: 'right' });

  doc.setTextColor(82, 92, 84);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  doc.text(`Tempoh: ${payload.periodLabel}`, pageWidth - margin, 20, { align: 'right' });
  doc.text(`Sumber: ${payload.sheetTitle}`, pageWidth - margin, 24.8, { align: 'right' });
  doc.text(`Dicetak: ${formatPrintedTimestamp()}`, pageWidth - margin, 29.6, { align: 'right' });

  doc.setDrawColor(20, 83, 45);
  doc.setLineWidth(0.5);
  doc.line(margin, 34, pageWidth - margin, 34);
  doc.setLineWidth(0.2);

  // Summary KPI Strip (3 cards)
  let y = 40;
  const cardGap = 4;
  const cardW = (contentWidth - cardGap * 2) / 3;
  const cardH = 20;

  // Card 1: Wang Masuk
  doc.setFillColor(241, 247, 243);
  doc.setDrawColor(132, 179, 149);
  doc.roundedRect(margin, y, cardW, cardH, 2.5, 2.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(82, 92, 84);
  doc.text('JUMLAH WANG MASUK', margin + 4, y + 6.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20, 83, 45);
  doc.text(formatMYR(payload.totalIncome), margin + 4, y + 14.5);

  // Card 2: Wang Keluar
  const card2X = margin + cardW + cardGap;
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(239, 154, 154);
  doc.roundedRect(card2X, y, cardW, cardH, 2.5, 2.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(82, 92, 84);
  doc.text('JUMLAH WANG KELUAR', card2X + 4, y + 6.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(153, 27, 27);
  doc.text(formatMYR(payload.totalExpense), card2X + 4, y + 14.5);

  // Card 3: Baki Bersih
  const card3X = card2X + cardW + cardGap;
  const isPositive = payload.netBalance >= 0;
  doc.setFillColor(isPositive ? 20 : 153, isPositive ? 83 : 27, isPositive ? 45 : 27);
  doc.setDrawColor(isPositive ? 20 : 153, isPositive ? 83 : 27, isPositive ? 45 : 27);
  doc.roundedRect(card3X, y, cardW, cardH, 2.5, 2.5, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(235, 245, 238);
  doc.text('BAKI BERSIH', card3X + 4, y + 6.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(formatMYR(payload.netBalance), card3X + 4, y + 14.5);

  y += cardH + 9;

  // Table Title
  doc.setTextColor(22, 27, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`Lejar Transaksi Kewangan (${payload.items.length} rekod)`, margin, y);
  y += 4;

  // Column X positions
  const colDateX = margin + 3;
  const colPerkaraX = margin + 27;
  const colMasukRightX = margin + 123;
  const colKeluarRightX = margin + 151;
  const colBakiRightX = pageWidth - margin - 3;

  const drawTableHeader = (startY: number): number => {
    doc.setFillColor(240, 243, 240);
    doc.setDrawColor(210, 217, 211);
    doc.rect(margin, startY, contentWidth, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(58, 66, 60);
    doc.text('Tarikh', colDateX, startY + 5.3);
    doc.text('Perkara / Rujukan', colPerkaraX, startY + 5.3);
    doc.text('Wang Masuk', colMasukRightX, startY + 5.3, { align: 'right' });
    doc.text('Wang Keluar', colKeluarRightX, startY + 5.3, { align: 'right' });
    doc.text('Baki', colBakiRightX, startY + 5.3, { align: 'right' });
    return startY + 8;
  };

  y = drawTableHeader(y);

  const rowH = 7.5;
  const bottomLimit = pageHeight - 24;

  if (payload.items.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(82, 92, 84);
    doc.text('Tiada transaksi kewangan bagi tempoh yang dipilih.', margin + 4, y + 7);
    y += 12;
  } else {
    payload.items.forEach((item, idx) => {
      if (y + rowH > bottomLimit) {
        doc.addPage();
        doc.setFillColor(20, 83, 45);
        doc.rect(0, 0, pageWidth, 3, 'F');
        y = 14;
        y = drawTableHeader(y);
      }

      if (idx % 2 === 1) {
        doc.setFillColor(249, 250, 249);
        doc.rect(margin, y, contentWidth, rowH, 'F');
      }

      doc.setDrawColor(232, 236, 232);
      doc.line(margin, y + rowH, margin + contentWidth, y + rowH);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(65, 73, 67);
      doc.text(item.date ? formatDisplayDate(item.date) : '-', colDateX, y + 5);

      doc.setTextColor(22, 27, 23);
      doc.text(truncateText(item.perkara, 42), colPerkaraX, y + 5);

      if (item.wangMasuk > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(20, 83, 45);
        doc.text(formatMYR(item.wangMasuk), colMasukRightX, y + 5, { align: 'right' });
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(154, 163, 156);
        doc.text('-', colMasukRightX, y + 5, { align: 'right' });
      }

      if (item.wangKeluar > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(153, 27, 27);
        doc.text(formatMYR(item.wangKeluar), colKeluarRightX, y + 5, { align: 'right' });
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(154, 163, 156);
        doc.text('-', colKeluarRightX, y + 5, { align: 'right' });
      }

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(item.runningBalance >= 0 ? 22 : 153, item.runningBalance >= 0 ? 27 : 27, item.runningBalance >= 0 ? 23 : 27);
      doc.text(formatMYR(item.runningBalance), colBakiRightX, y + 5, { align: 'right' });

      y += rowH;
    });
  }

  // Totals Footer Row
  if (y + 10 > bottomLimit) {
    doc.addPage();
    y = 18;
  }
  doc.setFillColor(241, 247, 243);
  doc.setDrawColor(132, 179, 149);
  doc.rect(margin, y + 1, contentWidth, 9, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(22, 27, 23);
  doc.text('JUMLAH KESELURUHAN', colDateX, y + 6.8);
  doc.setTextColor(20, 83, 45);
  doc.text(formatMYR(payload.totalIncome), colMasukRightX, y + 6.8, { align: 'right' });
  doc.setTextColor(153, 27, 27);
  doc.text(formatMYR(payload.totalExpense), colKeluarRightX, y + 6.8, { align: 'right' });
  doc.setTextColor(isPositive ? 20 : 153, isPositive ? 83 : 27, isPositive ? 45 : 27);
  doc.text(formatMYR(payload.netBalance), colBakiRightX, y + 6.8, { align: 'right' });

  // Page footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(221, 226, 220);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 118, 112);
    doc.text(
      'Laporan Analisis Kewangan Rasmi · Ss Homestay & Roomstay (Admin)',
      margin,
      pageHeight - 9.5
    );
    doc.text(`Muka ${p} / ${totalPages}`, pageWidth - margin, pageHeight - 9.5, { align: 'right' });
  }

  const safePeriod = payload.periodLabel.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 30);
  doc.save(`Laporan-Kewangan-SsHomestay-${safePeriod || 'Semua'}.pdf`);
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function printFinanceReport(payload: FinanceReportPdfPayload): Promise<void> {
  const logoDataUrl = await loadLogoDataUrl();
  const printedAt = formatPrintedTimestamp();
  const isPositive = payload.netBalance >= 0;

  const rowsHtml =
    payload.items.length === 0
      ? `<tr><td colspan="5" style="text-align:center;padding:18px;color:#525C54;">Tiada transaksi kewangan bagi tempoh ${escapeHtml(payload.periodLabel)}.</td></tr>`
      : payload.items
          .map(
            (item, idx) => `
          <tr style="background:${idx % 2 === 1 ? '#F9FAF9' : '#FFFFFF'};">
            <td style="padding:7px 8px;border-bottom:1px solid #E4E8E4;white-space:nowrap;font-family:monospace;color:#414943;">${
              item.date ? escapeHtml(formatDisplayDate(item.date)) : '—'
            }</td>
            <td style="padding:7px 8px;border-bottom:1px solid #E4E8E4;color:#161B17;">${escapeHtml(item.perkara)}</td>
            <td style="padding:7px 8px;border-bottom:1px solid #E4E8E4;text-align:right;white-space:nowrap;font-family:monospace;font-weight:${
              item.wangMasuk > 0 ? '700' : '400'
            };color:${item.wangMasuk > 0 ? '#14532D' : '#9AA39C'};">${
              item.wangMasuk > 0 ? escapeHtml(formatMYR(item.wangMasuk)) : '—'
            }</td>
            <td style="padding:7px 8px;border-bottom:1px solid #E4E8E4;text-align:right;white-space:nowrap;font-family:monospace;font-weight:${
              item.wangKeluar > 0 ? '700' : '400'
            };color:${item.wangKeluar > 0 ? '#991B1B' : '#9AA39C'};">${
              item.wangKeluar > 0 ? escapeHtml(formatMYR(item.wangKeluar)) : '—'
            }</td>
            <td style="padding:7px 8px;border-bottom:1px solid #E4E8E4;text-align:right;white-space:nowrap;font-family:monospace;font-weight:700;color:${
              item.runningBalance >= 0 ? '#161B17' : '#991B1B'
            };">${escapeHtml(formatMYR(item.runningBalance))}</td>
          </tr>`
          )
          .join('');

  const html = `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="utf-8" />
  <title>Laporan Kewangan · ${escapeHtml(payload.periodLabel)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #161B17;
      background: #FFFFFF;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .top-bar { height: 5px; background: #14532D; margin-bottom: 14px; border-radius: 2px; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid #14532D;
    }
    .logo { height: 54px; width: auto; display: block; }
    .title-block { text-align: right; }
    .title-block h1 { margin: 0 0 4px; font-size: 16px; color: #14532D; letter-spacing: 0.3px; }
    .title-block p { margin: 2px 0; font-size: 11px; color: #525C54; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin: 16px 0 18px;
    }
    .kpi-card {
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #DDE2DC;
    }
    .kpi-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
    .kpi-val { font-size: 16px; font-weight: 700; font-family: monospace; margin-top: 4px; }
    .section-title { font-size: 13px; font-weight: 700; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead th {
      background: #F0F3F0;
      color: #3A423C;
      text-align: left;
      padding: 8px;
      border-top: 1px solid #D2D9D3;
      border-bottom: 1px solid #D2D9D3;
      font-weight: 700;
    }
    tfoot td {
      background: #F1F7F3;
      border-top: 2px solid #84B395;
      border-bottom: 1px solid #84B395;
      padding: 9px 8px;
      font-weight: 700;
    }
    .footer-note {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #DDE2DC;
      font-size: 10px;
      color: #6E7670;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="top-bar"></div>
  <div class="header">
    <div>
      ${
        logoDataUrl
          ? `<img src="${logoDataUrl}" alt="Ss Homestay &amp; Roomstay" class="logo" />`
          : `<div style="font-size:18px;font-weight:700;color:#14532D;">SS HOMESTAY &amp; ROOMSTAY</div>`
      }
    </div>
    <div class="title-block">
      <h1>LAPORAN ANALISIS KEWANGAN</h1>
      <p><strong>Bulan / Tempoh:</strong> ${escapeHtml(payload.periodLabel)}</p>
      <p><strong>Sumber:</strong> ${escapeHtml(payload.sheetTitle)}</p>
      <p>Dicetak pada: ${escapeHtml(printedAt)}</p>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card" style="background:#F1F7F3;border-color:#84B395;">
      <div class="kpi-label" style="color:#525C54;">Jumlah Wang Masuk</div>
      <div class="kpi-val" style="color:#14532D;">${escapeHtml(formatMYR(payload.totalIncome))}</div>
    </div>
    <div class="kpi-card" style="background:#FEF2F2;border-color:#EF9A9A;">
      <div class="kpi-label" style="color:#525C54;">Jumlah Wang Keluar</div>
      <div class="kpi-val" style="color:#991B1B;">${escapeHtml(formatMYR(payload.totalExpense))}</div>
    </div>
    <div class="kpi-card" style="background:${isPositive ? '#14532D' : '#991B1B'};border-color:${
      isPositive ? '#14532D' : '#991B1B'
    };color:#FFFFFF;">
      <div class="kpi-label" style="color:#EBF5EE;">Baki Bersih</div>
      <div class="kpi-val" style="color:#FFFFFF;">${escapeHtml(formatMYR(payload.netBalance))}</div>
    </div>
  </div>

  <h2 class="section-title">Lejar Transaksi Kewangan (${payload.items.length} rekod)</h2>
  <table>
    <thead>
      <tr>
        <th>Tarikh</th>
        <th>Perkara / Rujukan</th>
        <th style="text-align:right;">Wang Masuk</th>
        <th style="text-align:right;">Wang Keluar</th>
        <th style="text-align:right;">Baki</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">JUMLAH KESELURUHAN (${escapeHtml(payload.periodLabel)})</td>
        <td style="text-align:right;font-family:monospace;color:#14532D;">${escapeHtml(
          formatMYR(payload.totalIncome)
        )}</td>
        <td style="text-align:right;font-family:monospace;color:#991B1B;">${escapeHtml(
          formatMYR(payload.totalExpense)
        )}</td>
        <td style="text-align:right;font-family:monospace;color:${
          isPositive ? '#14532D' : '#991B1B'
        };">${escapeHtml(formatMYR(payload.netBalance))}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer-note">
    <span>Laporan Analisis Kewangan Rasmi · Ss Homestay &amp; Roomstay (Admin)</span>
    <span>Tempoh: ${escapeHtml(payload.periodLabel)}</span>
  </div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 1000);
  };

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      cleanup();
    }
  };

  iframe.srcdoc = html;
}

