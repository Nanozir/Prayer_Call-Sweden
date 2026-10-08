// Browser side of the import: loads the photo, finds the table grid and reads
// each cell separately with Tesseract (digits only), all offline.

import { createWorker } from 'tesseract.js';
import { detectGrid, otsu } from './grid.js';
import { correctTable, detectMonthYear, digitsOf } from './correct.js';

const MAX_SIDE = 2400;

function assetUrl(path) {
  return new URL(`tesseract/${path}`, document.baseURI).href;
}

async function newWorker() {
  return createWorker('eng', 1, {
    workerPath: assetUrl('worker.min.js'),
    corePath: assetUrl('core'),
    langPath: assetUrl('lang'),
    gzip: true,
  });
}

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toGray(canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
  }
  return gray;
}

// Crops a region, enlarges it 4x and binarises it — Tesseract needs big, crisp digits.
function cropCell(src, x, y, w, h, scale = 4, pad = 20) {
  const c = document.createElement('canvas');
  c.width = w * scale + pad * 2;
  c.height = h * scale + pad * 2;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x, y, w, h, pad, pad, w * scale, h * scale);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const gray = new Uint8Array(c.width * c.height);
  for (let i = 0; i < gray.length; i++) gray[i] = img.data[i * 4 + 1];
  const thr = otsu(gray);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i] < thr ? 0 : 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function looksLikeTime(text) {
  const d = digitsOf(text);
  return d.length >= 3 && d.length <= 5;
}

/**
 * Reads a schedule photo. onProgress(fraction, message) reports progress.
 * Returns {year, month, rawRows, days, flags, method}.
 */
export async function readSchedule(file, onProgress = () => {}) {
  onProgress(0, 'Läser bilden…');
  const canvas = await loadImage(file);
  const gray = toGray(canvas);
  const grid = detectGrid(gray, canvas.width, canvas.height);

  onProgress(0.05, 'Startar textigenkänning…');
  const worker = await newWorker();
  try {
    // Header text above the table (month + year).
    const headerBottom = grid ? grid.rows[0] : Math.round(canvas.height * 0.35);
    await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' });
    const headerCanvas = cropCell(canvas, 0, 0, canvas.width, Math.max(10, headerBottom), 2);
    const header = (await worker.recognize(headerCanvas)).data.text;
    const { year, month } = detectMonthYear(header);

    let rawRows;
    let method;
    if (grid) {
      method = 'grid';
      rawRows = await readGridCells(worker, canvas, grid, onProgress);
    } else {
      method = 'fulltext';
      rawRows = await readFullText(worker, canvas, onProgress);
    }

    onProgress(1, 'Klar');
    const y = year ?? new Date().getFullYear();
    const m = month ?? new Date().getMonth() + 1;
    const { days, flags } = correctTable(rawRows, y, m);
    return { year, month, rawRows, days, flags, method, header };
  } finally {
    await worker.terminate();
  }
}

async function readGridCells(worker, canvas, grid, onProgress) {
  await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789:' });
  const { rows, cols } = grid;
  const timeCols = cols.slice(-7); // last 6 columns hold Fajr..Isha
  const rowsOut = [];
  const bands = rows.length - 1;
  for (let r = 0; r < bands; r++) {
    const top = rows[r] + 3, height = rows[r + 1] - rows[r] - 6;
    const cells = [];
    for (let c = 0; c < 6; c++) {
      const left = timeCols[c] + 3, width = timeCols[c + 1] - timeCols[c] - 6;
      const res = await worker.recognize(cropCell(canvas, left, top, width, height));
      cells.push(res.data.text.trim());
    }
    rowsOut.push(cells);
    onProgress(0.1 + (0.9 * (r + 1)) / bands, `Läser rad ${r + 1} av ${bands}…`);
  }
  // Drop header/footer bands that do not contain times.
  return rowsOut.filter((cells) => cells.filter(looksLikeTime).length >= 3);
}

async function readFullText(worker, canvas, onProgress) {
  onProgress(0.2, 'Hittade ingen tydlig tabell, läser hela bilden…');
  await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '0123456789:| ' });
  const big = cropCell(canvas, 0, 0, canvas.width, canvas.height, 2);
  const text = (await worker.recognize(big)).data.text;
  return text.split('\n')
    .map((line) => line.match(/\d{1,2}[:.]?\d{2}/g) ?? [])
    .filter((times) => times.length >= 6)
    .map((times) => times.slice(-6));
}
