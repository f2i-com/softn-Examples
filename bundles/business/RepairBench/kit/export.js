// kit/export.js: CSV and standalone printable HTML document exports with sandbox-safe copy fallbacks.
import { esc } from './dom.js';
import { saveFile, copyText, toast } from './ui.js';

function csvCell(value) {
  const s = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  if (safe.includes(',') || safe.includes('\n') || safe.includes('\r') || safe.includes('"')) {
    return '"' + safe.replaceAll('"', '""') + '"';
  }
  return safe;
}

/** Build a UTF-8 CSV string from columns [{ key, label }] and rows. */
export function toCsv(columns, rows) {
  const header = columns.map((c) => csvCell(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => csvCell(typeof c.get === 'function' ? c.get(row) : row[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}

/** Download a CSV file and notify the user (with FormLogic Save bar guidance). */
export function downloadCsv(filename, columns, rows) {
  const csv = toCsv(columns, rows);
  saveFile(filename, '\uFEFF' + csv, 'text/csv;charset=utf-8');
  toast.success(`${filename} is ready — choose Save in the bar if prompted.`);
  return csv;
}

/** Copy tabular rows as clean tab-separated text (always works even when file saving is disabled). */
export function copyTableText(title, columns, rows) {
  const header = columns.map((c) => c.label).join('\t');
  const lines = rows.map((row) => columns.map((c) => String(typeof c.get === 'function' ? c.get(row) : (row[c.key] ?? '')).replaceAll('\n', ' ')).join('\t'));
  return copyText([header, ...lines].join('\n'), { title });
}

/** Download a self-contained printable HTML document (for invoices, reports, job cards, dockets). */
export function downloadHtmlDoc(filename, { title, businessName = '', subtitle = '', accent = '#1e3a5f', bodyHtml = '' }) {
  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #18181b; margin: 0; padding: 32px; background: #fff; line-height: 1.5; }
  .doc { max-width: 820px; margin: 0 auto; }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 3px solid ${esc(accent)}; padding-bottom: 16px; margin-bottom: 24px; }
  .doc-brand { font-size: 22px; font-weight: 800; color: ${esc(accent)}; }
  .doc-title { font-size: 24px; font-weight: 700; margin: 0; }
  .doc-sub { color: #52525b; font-size: 14px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #e4e4e7; font-size: 14px; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #52525b; background: #f8fafc; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .total-row td { font-weight: 700; border-top: 2px solid #18181b; border-bottom: 3px double #18181b; font-size: 15px; }
  .box { padding: 14px 16px; border: 1px solid #e4e4e7; border-radius: 8px; background: #fafafa; margin: 14px 0; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="doc">
    <div class="doc-head">
      <div><div class="doc-brand">${esc(businessName)}</div>${subtitle ? `<div class="doc-sub">${esc(subtitle)}</div>` : ''}</div>
      <h1 class="doc-title">${esc(title)}</h1>
    </div>
    ${bodyHtml}
  </div>
</body>
</html>`;
  saveFile(filename, doc, 'text/html;charset=utf-8');
  toast.success(`${filename} is ready — open it to print or save as PDF.`);
  return doc;
}
