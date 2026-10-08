// Finds the ruled table in a grayscale image: thin, long dark lines.
// Works on a plain Uint8 array so it runs the same in the browser and in tests.

export function otsu(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = gray.length - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const diff = sumB / wB - (sum - sumB) / wF;
    const v = wB * wF * diff * diff;
    if (v > best) { best = v; thr = t; }
  }
  return thr;
}

// Longest run of dark pixels along a line; returns {len, start, end}.
function longestRun(isDark, n) {
  let best = { len: 0, start: 0, end: 0 }, start = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && isDark(i)) { if (start < 0) start = i; }
    else if (start >= 0) {
      if (i - start > best.len) best = { len: i - start, start, end: i - 1 };
      start = -1;
    }
  }
  return best;
}

// Collapses consecutive flagged indices into line centres, dropping thick bands
// (black backgrounds, photo borders) that are not grid lines.
function lineCentres(flags, maxThick) {
  const out = [];
  let s = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) { if (s < 0) s = i; }
    else if (s >= 0) {
      if (i - s <= maxThick) out.push({ pos: Math.round((s + i - 1) / 2), from: s, to: i - 1 });
      s = -1;
    }
  }
  return out;
}

// Keeps the longest sequence of lines whose gaps are similar (the data rows).
function regularRun(lines) {
  if (lines.length < 3) return lines;
  const gaps = lines.slice(1).map((l, i) => l.pos - lines[i].pos);
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let best = [0, 0], start = 0;
  for (let i = 0; i <= gaps.length; i++) {
    const ok = i < gaps.length && gaps[i] > median * 0.6 && gaps[i] < median * 1.6;
    if (!ok) {
      if (i - start > best[1] - best[0]) best = [start, i];
      start = i + 1;
    }
  }
  return lines.slice(best[0], best[1] + 1);
}

export function detectGrid(gray, w, h) {
  const thr = Math.min(otsu(gray), 170);
  const dark = (x, y) => gray[y * w + x] < thr;

  const rowRuns = [];
  const hFlags = [];
  for (let y = 0; y < h; y++) {
    const run = longestRun((x) => dark(x, y), w);
    rowRuns.push(run);
    hFlags.push(run.len > w * 0.4);
  }
  let rows = lineCentres(hFlags, Math.max(4, Math.round(h * 0.004)));
  rows = regularRun(rows);
  if (rows.length < 10) return null;

  const top = rows[0].pos, bottom = rows[rows.length - 1].pos;
  const left = Math.min(...rows.map((r) => rowRuns[r.pos].start));
  const right = Math.max(...rows.map((r) => rowRuns[r.pos].end));
  const span = bottom - top;
  const vFlags = [];
  for (let x = 0; x < w; x++) {
    vFlags.push(longestRun((i) => dark(x, top + i), span + 1).len > span * 0.8);
  }
  const cols = lineCentres(vFlags, Math.max(4, Math.round(w * 0.006)))
    .filter((c) => c.pos >= left - 4 && c.pos <= right + 4);
  if (cols.length < 7) return null;

  return { rows: rows.map((r) => r.pos), cols: cols.map((c) => c.pos), threshold: thr };
}
