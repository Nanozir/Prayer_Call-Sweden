import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { correctTable, detectMonthYear, validateSchedule } from '../src/ocr/correct.js';
import { fmt } from '../src/time.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/karlstad-oktober-2026.json', import.meta.url)));

test('repairs real OCR output of the Karlstad October 2026 table', () => {
  const raw = fx.ocrSample.map((l) => l.split(' '));
  const { days, flags } = correctTable(raw, fx.year, fx.month);
  assert.deepEqual(days.map((r) => r.map(fmt)), fx.truth);
  // The four broken cells are reported as corrected, nothing else is touched.
  const changed = flags.flat().filter((f) => f !== 'ok').length;
  assert.equal(changed, 4);
  assert.deepEqual(validateSchedule({ year: 2026, month: 10, days }), []);
});

test('unreadable cell gets an estimate and is marked uncertain', () => {
  const raw = fx.ocrSample.map((l) => l.split(' '));
  raw[10][2] = '';
  const { days, flags } = correctTable(raw, fx.year, fx.month);
  assert.equal(flags[10][2], 'uncertain');
  assert.ok(Math.abs(days[10][2] - (12 * 60 + 53)) <= 1);
});

test('detects month and year from noisy header', () => {
  assert.deepEqual(detectMonthYear('KARLSTAD MOSKE BONETIDER FOR\noktober 2026'), { year: 2026, month: 10 });
  assert.deepEqual(detectMonthYear('B0NETIDER FÖR novmber 2025'), { year: 2025, month: 11 });
  assert.deepEqual(detectMonthYear('nothing here'), { year: null, month: null });
});
