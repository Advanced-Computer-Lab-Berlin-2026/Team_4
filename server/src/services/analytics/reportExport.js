const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const ApiError = require('../../utils/ApiError');

const USAGE_COLUMNS = [
  ['month', 'Month', 58], ['itemTitle', 'Item', 153], ['category', 'Category', 126],
  ['totalReservations', 'Reservations', 84], ['completedCount', 'Completed', 72],
  ['activeOrConfirmedCount', 'Active / Confirmed', 100], ['cancelledOrRejectedCount', 'Cancelled / Rejected', 104],
  ['totalDepositVolume', 'Deposits (EGP)', 87],
];
const DAMAGE_COLUMNS = [
  ['createdAt', 'Date', 70], ['itemTitle', 'Item', 125], ['borrowerName', 'Borrower', 94], ['lenderName', 'Lender', 94],
  ['status', 'Status', 63], ['isDisputed', 'Disputed', 57], ['resolution', 'Resolution', 111],
  ['heldDeposit', 'Deposit (EGP)', 70], ['forfeitedAmount', 'Forfeited (EGP)', 71], ['refundedAmount', 'Refunded (EGP)', 71],
];

function value(raw) {
  return raw == null ? '' : typeof raw === 'boolean' ? (raw ? 'Yes' : 'No') : String(raw);
}

function csvCell(raw) {
  let str = value(raw);
  if (typeof raw === 'string' && (/^[\t\r\n]/.test(str) || /^[\s\uFEFF]*[=+@-]/.test(str))) str = "'" + str;
  return /[",\r\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}

function csv(columns, rows) {
  return Buffer.from([
    columns.map(([, label]) => csvCell(label)).join(','),
    ...rows.map((row) => columns.map(([key]) => csvCell(row[key])).join(',')),
  ].join('\r\n'), 'utf8');
}

function wrap(raw, font, size, width) {
  const safe = Array.from(value(raw).replace(/\s+/g, ' '), (char) => {
    try { font.encodeText(char); return char; } catch { return '?'; }
  }).join('');
  const lines = [];
  let line = '';
  for (const char of safe) {
    if (line && font.widthOfTextAtSize(line + char, size) > width) {
      lines.push(line.trimEnd());
      line = '';
    }
    line += char;
  }
  return [...lines, line.trim()];
}

async function pdf(title, columns, rows) {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const size = 9;
  const margin = 28;
  const pageWidth = columns.reduce((sum, [, , width]) => sum + width, margin * 2);
  let page;
  let y;

  function nextPage() {
    page = doc.addPage([pageWidth, 595]);
    page.drawText(title, { x: margin, y: 558, font: bold, size: 16 });
    y = 530;
    let x = margin;
    for (const [, label, width] of columns) {
      page.drawText(label, { x, y, font: bold, size });
      x += width;
    }
    page.drawLine({ start: { x: margin, y: y - 5 }, end: { x: pageWidth - margin, y: y - 5 }, color: rgb(0.7, 0.7, 0.7) });
    y -= 24;
  }

  nextPage();
  if (!rows.length) page.drawText('No records match the selected filters.', { x: margin, y, font: normal, size });
  for (const row of rows) {
    const cells = columns.map(([key, , width]) => wrap(row[key], normal, size, width - 8));
    const height = Math.max(...cells.map((lines) => lines.length)) * 13 + 6;
    if (y - height < margin) nextPage();
    let x = margin;
    for (const [index, lines] of cells.entries()) {
      for (const [lineIndex, line] of lines.entries()) page.drawText(line, { x, y: y - lineIndex * 13, font: normal, size });
      x += columns[index][2];
    }
    y -= height;
  }
  return Buffer.from(await doc.save());
}

async function exportReport({ format = 'csv', reportData }, columns, name, title) {
  if (!['csv', 'pdf'].includes(format)) throw ApiError.badRequest('Export format must be csv or pdf');
  return {
    buffer: format === 'pdf' ? await pdf(title, columns, reportData.items) : csv(columns, reportData.items),
    mimeType: format === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8',
    filename: name + '.' + format,
  };
}

const exportUsageReport = (input) => exportReport(input, USAGE_COLUMNS, 'usage-report', 'ShareShed - Usage Report');
const exportDamageReport = (input) => exportReport(input, DAMAGE_COLUMNS, 'damage-report', 'ShareShed - Damage and Dispute Report');

module.exports = { exportUsageReport, exportDamageReport };
