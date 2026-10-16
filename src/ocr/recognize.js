// Browser side of the import: loads the photo, finds the table grid and reads
// each cell separately with Tesseract (digits only), all offline.

import { createWorker } from 'tesseract.js';
import { detectGrid, otsu } from './grid.js';
import { sauvola, isDarkBackground, cellScale, stretchContrast } from './binarize.js';
import { correctTable, detectMonthYear, digitsOf } from './correct.js';

const MAX_SIDE = 2400;

const INIT_TIMEOUT_MS = 120_000;
const STATUS_SV = {
  'loading tesseract core': 'Laddar textigenkänningen…',
  'initializing tesseract': 'Startar textigenkänningen…',
  'loading language traineddata': 'Laddar språkdata…',
  'initializing api': 'Gör klart…',
};

function assetUrl(path) {
  return new URL(`tesseract/${path}`, document.baseURI).href;
}

async function fetchAsset(path, as) {
  let resp;
  try {
    resp = await fetch(assetUrl(path));
  } catch (e) {
    throw new Error(`kunde inte läsa ${path} (${e.message ?? e})`);
  }
  if (!resp.ok) throw new Error(`kunde inte läsa ${path} (HTTP ${resp.status})`);
  return as === 'text' ? resp.text() : new Uint8Array(await resp.arrayBuffer());
}

// Same check as wasm-feature-detect's simd().
function hasWasmSimd() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3,
      2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch { return false; }
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

let workerSourceUrl = null;

// Builds one self-contained worker script: language data + wasm core + Tesseract
// worker. Inside the Android app, network requests made *from* a web worker
// are not reliably served from the app bundle and can hang forever, so the
// worker must never fetch anything itself — the main thread does all loading.
async function buildWorkerSource(onProgress) {
  if (workerSourceUrl) return workerSourceUrl;
  onProgress(0.03, 'Laddar textigenkänningen…');
  const coreFile = hasWasmSimd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js';
  const [lang, core, worker] = await Promise.all([
    fetchAsset('lang/eng.traineddata.bin'),
    fetchAsset(`core/${coreFile}`, 'text'),
    fetchAsset('worker.min.js', 'text'),
  ]);
  const preamble = `
    const __lang = Uint8Array.from(atob("${toBase64(lang)}"), (c) => c.charCodeAt(0));
    const __fetch = self.fetch ? self.fetch.bind(self) : null;
    self.fetch = (url, ...rest) => (String(url).endsWith('eng.traineddata.gz')
      ? Promise.resolve(new Response(__lang))
      : __fetch(url, ...rest));
  `;
  workerSourceUrl = URL.createObjectURL(new Blob(
    [preamble, '\n', core, '\n;\n', worker],
    { type: 'application/javascript' },
  ));
  return workerSourceUrl;
}

async function newWorker(onProgress) {
  const workerPath = await buildWorkerSource(onProgress);
  let lastStatus = 'start';
  const workerPromise = createWorker('eng', 1, {
    workerPath,
    workerBlobURL: false,
    langPath: 'bundled',
    cacheMethod: 'none',
    gzip: true,
    logger: (m) => {
      if (m.workerId == null && !m.status) return;
      lastStatus = m.status;
      if (STATUS_SV[m.status]) onProgress(0.05, STATUS_SV[m.status]);
    },
    errorHandler: (e) => console.error('tesseract', e),
  });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(
      `textigenkänningen startade inte inom ${INIT_TIMEOUT_MS / 1000} s (steg: ${lastStatus}).`,
    )), INIT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([workerPromise, timeout]);
  } finally {
    clearTimeout(timer);
  }
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

// Inverts the canvas in place (dark-mode screenshots: light text on dark background).
function invertCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 255 - img.data[i];
    img.data[i + 1] = 255 - img.data[i + 1];
    img.data[i + 2] = 255 - img.data[i + 2];
  }
  ctx.putImageData(img, 0, 0);
}

// Crops a region, enlarges it (cells to ~110 px tall) and binarises it – Tesseract
// needs big, crisp, dark-on-light digits. 'sauvola' (adaptive, per neighbourhood)
// copes with shadows and blur; 'otsu' (one global threshold) is cheaper for big areas.
function cropCell(src, x, y, w, h, { scale = cellScale(h), method = 'sauvola', stretch = false, pad = 20 } = {}) {
  const sw = Math.max(1, Math.round(w * scale)), sh = Math.max(1, Math.round(h * scale));
  const cell = document.createElement('canvas');
  cell.width = sw;
  cell.height = sh;
  const cctx = cell.getContext('2d');
  cctx.imageSmoothingEnabled = true;
  cctx.imageSmoothingQuality = 'high';
  cctx.drawImage(src, x, y, w, h, 0, 0, sw, sh);
  const img = cctx.getImageData(0, 0, sw, sh);
  let gray = new Uint8Array(sw * sh);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (img.data[i * 4] * 299 + img.data[i * 4 + 1] * 587 + img.data[i * 4 + 2] * 114) / 1000;
  }
  let bin;
  if (method === 'sauvola') {
    if (stretch) gray = stretchContrast(gray);
    bin = sauvola(gray, sw, sh, Math.max(15, Math.round(sh * 0.6)) | 1);
  } else {
    const thr = otsu(gray);
    bin = gray.map((v) => (v < thr ? 0 : 255));
  }
  for (let i = 0; i < bin.length; i++) img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = bin[i];
  cctx.putImageData(img, 0, 0);
  // White margin around the digits helps Tesseract's line finder.
  const out = document.createElement('canvas');
  out.width = sw + pad * 2;
  out.height = sh + pad * 2;
  const octx = out.getContext('2d');
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(cell, pad, pad);
  return out;
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
  // A ruled table has dark lines on a light background. If none is found, try the
  // inverted image (dark-mode screenshot: light text on dark) before giving up.
  let gray = toGray(canvas);
  let grid = detectGrid(gray, canvas.width, canvas.height);
  if (!grid) {
    const inverted = gray.map((v) => 255 - v);
    const invGrid = detectGrid(inverted, canvas.width, canvas.height);
    if (invGrid || isDarkBackground(gray)) {
      invertCanvas(canvas);
      gray = inverted;
      grid = invGrid;
    }
  }

  const worker = await newWorker(onProgress);
  try {
    // Header text above the table (month + year).
    const headerBottom = grid ? grid.rows[0] : Math.round(canvas.height * 0.35);
    await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' });
    const headerCanvas = cropCell(canvas, 0, 0, canvas.width, Math.max(10, headerBottom), { scale: 2 });
    const header = (await worker.recognize(headerCanvas)).data.text;
    const { year, month } = detectMonthYear(header);

    const y = year ?? new Date().getFullYear();
    const m = month ?? new Date().getMonth() + 1;
    let rawRows;
    let method;
    if (grid) {
      method = 'grid';
      const cells = await readGridCells(worker, canvas, grid, onProgress);
      const first = correctTable(cells.map((row) => row.map((cell) => cell.text)), y, m);
      rawRows = await rereadFlagged(worker, canvas, cells, first.flags, onProgress);
    } else {
      method = 'fulltext';
      rawRows = await readFullText(worker, canvas, onProgress);
    }

    onProgress(1, 'Klar');
    const { days, flags } = correctTable(rawRows, y, m);
    // The review shows what was read: the primary reading of each cell.
    const shownRaw = rawRows.map((row) => row.map((cell) => (Array.isArray(cell) ? cell[0] : cell)));
    return { year, month, rawRows: shownRaw, days, flags, method, header };
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
    // Stay clear of the ruling lines: remnants of them read as stray digits.
    const rowH = rows[r + 1] - rows[r], insetY = Math.max(3, Math.round(rowH * 0.12));
    const top = rows[r] + insetY, height = rowH - 2 * insetY;
    const cells = [];
    for (let c = 0; c < 6; c++) {
      const colW = timeCols[c + 1] - timeCols[c], insetX = Math.max(3, Math.round(colW * 0.06));
      const box = [timeCols[c] + insetX, top, colW - 2 * insetX, height];
      const res = await worker.recognize(cropCell(canvas, ...box));
      cells.push({ text: res.data.text.trim(), box });
    }
    rowsOut.push(cells);
    onProgress(0.1 + (0.8 * (r + 1)) / bands, `Läser rad ${r + 1} av ${bands}…`);
  }
  // Drop header/footer bands that do not contain times.
  return rowsOut.filter((cells) => cells.filter((cell) => looksLikeTime(cell.text)).length >= 3);
}

// Cells the first pass could not trust are read again with other clean-ups
// (contrast stretch helps tiny/low-quality images, Otsu helps some blurry ones).
const ALTERNATIVES = [{ stretch: true }, { method: 'otsu', stretch: true }];

async function rereadFlagged(worker, canvas, cells, flags, onProgress) {
  const todo = [];
  flags.forEach((row, i) => row.forEach((f, c) => { if (f !== 'ok' && cells[i]?.[c]) todo.push([i, c]); }));
  const rawRows = cells.map((row) => row.map((cell) => [cell.text]));
  for (let k = 0; k < todo.length; k++) {
    const [i, c] = todo[k];
    for (const opts of ALTERNATIVES) {
      const res = await worker.recognize(cropCell(canvas, ...cells[i][c].box, opts));
      rawRows[i][c].push(res.data.text.trim());
    }
    onProgress(0.9 + (0.1 * (k + 1)) / todo.length, `Dubbelkollar osäkra tider (${k + 1} av ${todo.length})…`);
  }
  return rawRows;
}

async function readFullText(worker, canvas, onProgress) {
  onProgress(0.2, 'Hittade ingen tydlig tabell, läser hela bilden…');
  await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '0123456789:| ' });
  const big = cropCell(canvas, 0, 0, canvas.width, canvas.height, { scale: 2, method: 'otsu' });
  const text = (await worker.recognize(big)).data.text;
  return text.split('\n')
    .map((line) => line.match(/\d{1,2}[:.]?\d{2}/g) ?? [])
    .filter((times) => times.length >= 6)
    .map((times) => times.slice(-6));
}
