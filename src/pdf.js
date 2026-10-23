// Reads schedules from PDF files offline with the bundled pdf.js. A PDF with a
// text layer (e.g. from islam.nu) is read exactly; a scanned PDF is rendered to
// an image and goes through the normal OCR.

import { parseScheduleText } from './schedule-text.js';

export const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');

async function openPdf(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.min.mjs');
  // Run pdf.js in this thread: loading the module sets globalThis.pdfjsWorker,
  // which pdf.js uses instead of starting a worker (no extra loading or fetches).
  await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  // No scripting (pdf.js never runs a PDF's JavaScript here) and no font loading.
  return pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    enableScripting: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
  });
}

// Text of a page as lines, rebuilt from the positions of the text pieces.
async function pageLines(page) {
  const { items } = await page.getTextContent();
  const rows = [];
  for (const it of items) {
    if (!it.str?.trim()) continue;
    const [x, y] = [it.transform[4], it.transform[5]];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push({ x, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' '));
}

async function firstPageImage(doc) {
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(4, 2400 / Math.max(base.width, base.height)) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Returns { kind: 'text', result, image } when the PDF has a readable table, else
 * { kind: 'image', image } – a PNG of page 1 to run through OCR.
 */
export async function readPdf(file) {
  const task = await openPdf(file);
  try {
    const doc = await task.promise;
    const lines = [];
    for (let p = 1; p <= Math.min(doc.numPages, 3); p++) lines.push(...await pageLines(await doc.getPage(p)));
    const result = parseScheduleText(lines.join('\n'));
    const image = await firstPageImage(doc);
    return result ? { kind: 'text', result, image } : { kind: 'image', image };
  } finally {
    task.destroy();
  }
}
