// Image clean-up before OCR. Plain arrays so it runs in the browser and in tests.

/**
 * Sauvola adaptive threshold: each pixel is compared with the mean and spread of
 * its own neighbourhood instead of one global value, so shadows, uneven light
 * and blurry edges still give crisp black digits on white.
 * gray: Uint8Array (w*h), win: odd window size in px. Returns Uint8Array of 0/255.
 */
export function sauvola(gray, w, h, win, k = 0.25) {
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  const sq = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0, rq = 0;
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x];
      rs += v; rq += v * v;
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + rs;
      sq[(y + 1) * W + x + 1] = sq[y * W + x + 1] + rq;
    }
  }
  const r = win >> 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const n = (x1 - x0) * (y1 - y0);
      const s = sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0];
      const q = sq[y1 * W + x1] - sq[y0 * W + x1] - sq[y1 * W + x0] + sq[y0 * W + x0];
      const mean = s / n;
      const sd = Math.sqrt(Math.max(0, q / n - mean * mean));
      out[y * w + x] = gray[y * w + x] > mean * (1 + k * (sd / 128 - 1)) ? 255 : 0;
    }
  }
  return out;
}

/** True when the image is mostly dark, e.g. a dark-mode screenshot (light text on dark). */
export function isDarkBackground(gray) {
  const hist = new Uint32Array(256);
  const stepPx = Math.max(1, Math.floor(gray.length / 200000));
  let n = 0;
  for (let i = 0; i < gray.length; i += stepPx) { hist[gray[i]]++; n++; }
  let acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n / 2) return v < 110; }
  return false;
}

/** Scale that makes a table cell about 110 px tall – a good size for Tesseract. */
export const cellScale = (cellHeight) => Math.min(8, Math.max(2, 110 / Math.max(1, cellHeight)));

/** Stretches contrast so the darkest 1 % become black and the brightest 1 % white. */
export function stretchContrast(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const cut = gray.length * 0.01;
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > cut) break; }
  acc = 0;
  for (; hi > 0; hi--) { acc += hist[hi]; if (acc > cut) break; }
  if (hi - lo < 8) return gray;
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(((gray[i] - lo) * 255) / (hi - lo))));
  return out;
}
