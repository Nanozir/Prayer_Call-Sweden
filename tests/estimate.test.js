import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calibrate, estimateMonth, withEstimates } from '../src/estimate.js';
import { parseTime } from '../src/time.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/karlstad-oktober-2026.json', import.meta.url)));
const days = fx.truth.map((r) => r.map(parseTime));

test('calibrated sun model reproduces the mosque schedule within a minute', () => {
  const cal = calibrate({ '2026-10': { year: 2026, month: 10, days } });
  cal.meanError.forEach((e) => assert.ok(e < 1, `mean error ${e}`));
});

test('predicts unseen days (incl. DST change) from the first half of the month', () => {
  const half = { '2026-10': { year: 2026, month: 10, days: days.slice(0, 15) } };
  const est = estimateMonth({}, 2026, 10, half);
  for (let i = 15; i < 31; i++) {
    for (let c = 0; c < 6; c++) assert.ok(Math.abs(est.days[i][c] - days[i][c]) <= 2, `day ${i + 1} col ${c}`);
  }
});

test('prefers the same month of the previous year, adjusted for DST dates', () => {
  const prev = { '2025-10': { year: 2025, month: 10, days } }; // DST ended 26 Oct 2025
  const est = estimateMonth(prev, 2026, 10);
  assert.equal(est.method, 'previous-year');
  // 25 Oct was still summer time in 2025 but winter time in 2026: one hour earlier.
  assert.equal(est.days[24][2], days[24][2] - 60);
  assert.equal(est.days[10][2], days[10][2]); // both summer time
});

test('estimates only fill gaps and only when the mode is on', () => {
  const real = { '2026-10': { year: 2026, month: 10, days } };
  const today = { year: 2026, month: 10, day: 20, minutes: 600 };
  assert.deepEqual(Object.keys(withEstimates(real, { estimate: false }, today)), ['2026-10']);
  const all = withEstimates(real, { estimate: true }, today);
  assert.equal(all['2026-10'], real['2026-10']);
  assert.equal(all['2026-11'].estimated, true);
  assert.equal(all['2026-11'].days.length, 30);
});
