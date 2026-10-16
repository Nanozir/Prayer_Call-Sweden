import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sauvola, isDarkBackground, cellScale, stretchContrast } from '../src/ocr/binarize.js';

// A dark "digit" stroke on a background that fades from bright to dark (a shadow).
function shadowedStroke(w = 60, h = 30) {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bg = 230 - x * 2.5; // 230 → ~80 across the image
      g[y * w + x] = x % 15 >= 6 && x % 15 <= 8 && y > 5 && y < 25 ? bg * 0.45 : bg;
    }
  }
  return g;
}

test('Sauvola keeps strokes black and background white even in shadow', () => {
  const w = 60, h = 30, g = shadowedStroke(w, h);
  const out = sauvola(g, w, h, 15);
  for (const x of [7, 52]) assert.equal(out[15 * w + x], 0, `stroke at x=${x}`);
  for (const x of [2, 50]) assert.equal(out[15 * w + x], 255, `background at x=${x}`);
});

test('detects dark-mode images', () => {
  assert.equal(isDarkBackground(new Uint8Array(1000).fill(30)), true);
  assert.equal(isDarkBackground(new Uint8Array(1000).fill(220)), false);
});

test('cells are scaled to about 110 px, within 2x–8x', () => {
  assert.equal(cellScale(22), 5);
  assert.equal(cellScale(5), 8);
  assert.equal(cellScale(200), 2);
});

test('contrast stretch spreads a narrow range to full black/white', () => {
  const g = Uint8Array.from({ length: 200 }, (_, i) => 100 + (i % 21));
  const s = stretchContrast(g);
  assert.ok(Math.min(...s) <= 5 && Math.max(...s) >= 250);
});
