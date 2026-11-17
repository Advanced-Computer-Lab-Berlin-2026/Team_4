// Generates RFC-4180 CSV and valid self-contained PDF 1.4 buffers from shared query rows.

function escapeCsvCell(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (/[",\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function buildCsvBuffer(columns, rows) {
    const header = columns.map((c) => escapeCsvCell(c.label)).join(',');
    const lines = rows.map((row) =>
        columns.map((c) => escapeCsvCell(row[c.key])).join(',')
    );
    const content = [header, ...lines].join('\r\n');
    return Buffer.from(content, 'utf8');
}

function sanitizePdfText(text) {
    return String(text ?? '')
        .replace(/[^\x20-\x7E]/g, '?')
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
}

/**
 * Build a multi-page valid PDF 1.4 binary buffer using standard Helvetica font
 */
function buildPdfBuffer(title, subtitle, columns, rows) {
    const pageWidth = 612;
    const pageHeight = 792;
    const marginLeft = 36;
    const startY = 740;
    const lineHeight = 15;
    const rowsPerPage = 40;

    const formattedLines = [];
    formattedLines.push({ text: title, font: 'F2', size: 14 });
    formattedLines.push({ text: subtitle, font: 'F1', size: 9 });
    formattedLines.push({ text: '-'.repeat(95), font: 'F1', size: 8 });

    const headerLine = columns.map((c) => c.label.slice(0, c.width || 16).padEnd(c.width || 16)).join(' ');
    formattedLines.push({ text: headerLine, font: 'F2', size: 8 });
    formattedLines.push({ text: '-'.repeat(95), font: 'F1', size: 8 });

    if (rows.length === 0) {
        formattedLines.push({ text: 'No records match the selected filters.', font: 'F1', size: 9 });
    } else {
        for (const row of rows) {
            const line = columns
                .map((c) => String(row[c.key] ?? '').slice(0, c.width || 16).padEnd(c.width || 16))
                .join(' ');
            formattedLines.push({ text: line, font: 'F1', size: 8 });
        }
    }

    // Chunk into pages
    const pages = [];
    for (let i = 0; i < formattedLines.length; i += rowsPerPage) {
        pages.push(formattedLines.slice(i, i + rowsPerPage));
    }

    const objects = [];
    const addObject = (body) => {
        objects.push(body);
        return objects.length; // 1-based object number
    };

    const catalogObj = addObject('<< /Type /Catalog /Pages 2 0 R >>');
    const pagesObj = addObject('<< /Type /Pages /Kids [] /Count 0 >>'); // placeholder
    const fontRegularObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const fontBoldObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

    const pageObjectNums = [];

    for (const pageLines of pages) {
        let stream = 'BT\n';
        let y = startY;
        for (const item of pageLines) {
            stream += `/${item.font} ${item.size} Tf\n`;
            stream += `1 0 0 1 ${marginLeft} ${y} Tm\n`;
            stream += `(${sanitizePdfText(item.text)}) Tj\n`;
            y -= lineHeight;
        }
        stream += 'ET\n';

        const contentObj = addObject(
            `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream`
        );

        const pageObj = addObject(
            `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
            `/Resources << /Font << /F1 ${fontRegularObj} 0 R /F2 ${fontBoldObj} 0 R >> >> ` +
            `/Contents ${contentObj} 0 R >>`
        );
        pageObjectNums.push(pageObj);
    }

    // Update Pages object
    objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageObjectNums
        .map((n) => `${n} 0 R`)
        .join(' ')}] /Count ${pageObjectNums.length} >>`;

    // Serialize PDF with xref
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (let i = 0; i < objects.length; i++) {
        offsets.push(Buffer.byteLength(pdf, 'utf8'));
        pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i++) {
        pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObj} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'utf8');
}

const USAGE_COLUMNS = [
    { key: 'month', label: 'Month', width: 9 },
    { key: 'itemTitle', label: 'Item', width: 22 },
    { key: 'category', label: 'Category', width: 15 },
    { key: 'totalReservations', label: 'Total', width: 7 },
    { key: 'completedCount', label: 'Done', width: 7 },
    { key: 'cancelledOrRejectedCount', label: 'Canc/Rej', width: 9 },
    { key: 'totalDepositVolume', label: 'Deposit(EGP)', width: 13 },
];

const DAMAGE_COLUMNS = [
    { key: 'createdAt', label: 'Date', width: 11 },
    { key: 'itemTitle', label: 'Item', width: 18 },
    { key: 'borrowerName', label: 'Borrower', width: 14 },
    { key: 'status', label: 'Status', width: 10 },
    { key: 'resolution', label: 'Resolution', width: 15 },
    { key: 'heldDeposit', label: 'Held', width: 8 },
    { key: 'forfeitedAmount', label: 'Forfeit', width: 8 },
];

function exportUsageReport({ format = 'csv', reportData, filters = {} }) {
    const fmt = String(format).toLowerCase();
    if (fmt === 'pdf') {
        const subtitle = `Generated: ${new Date().toISOString()} | Total Reservations: ${
            reportData.summary.totalReservations
        } | Filters: ${JSON.stringify(filters)}`;
        return {
            buffer: buildPdfBuffer('ShareShed - Usage Report', subtitle, USAGE_COLUMNS, reportData.items),
            mimeType: 'application/pdf',
            filename: `usage-report-${Date.now()}.pdf`,
        };
    }
    return {
        buffer: buildCsvBuffer(USAGE_COLUMNS, reportData.items),
        mimeType: 'text/csv; charset=utf-8',
        filename: `usage-report-${Date.now()}.csv`,
    };
}

function exportDamageReport({ format = 'csv', reportData, filters = {} }) {
    const fmt = String(format).toLowerCase();
    if (fmt === 'pdf') {
        const subtitle = `Generated: ${new Date().toISOString()} | Total Cases: ${
            reportData.summary.totalCases
        } | Disputed: ${reportData.summary.disputedCases} | Filters: ${JSON.stringify(filters)}`;
        return {
            buffer: buildPdfBuffer(
                'ShareShed - Damage & Dispute Resolution Report',
                subtitle,
                DAMAGE_COLUMNS,
                reportData.items
            ),
            mimeType: 'application/pdf',
            filename: `damage-report-${Date.now()}.pdf`,
        };
    }
    return {
        buffer: buildCsvBuffer(DAMAGE_COLUMNS, reportData.items),
        mimeType: 'text/csv; charset=utf-8',
        filename: `damage-report-${Date.now()}.csv`,
    };
}

module.exports = {
    exportUsageReport,
    exportDamageReport,
};