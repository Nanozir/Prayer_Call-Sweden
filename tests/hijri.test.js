import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hijriDate } from '../src/hijri.js';

test('Umm al-Qura date for a known day', () => {
  assert.equal(hijriDate({ year: 2026, month: 10, day: 8 }), '27 Rabi’ al-akhir 1448');
});

test('offset shifts the Hijri date by whole days', () => {
  assert.equal(hijriDate({ year: 2026, month: 10, day: 8 }, 1), '28 Rabi’ al-akhir 1448');
  assert.equal(hijriDate({ year: 2026, month: 10, day: 8 }, -1), '26 Rabi’ al-akhir 1448');
});
