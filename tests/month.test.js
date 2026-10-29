import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthRows, shiftMonth } from '../src/month.js';

const nov = { year: 2026, month: 11, estimated: true, days: Array.from({ length: 30 }, (_, i) => (i === 4 ? [300, null, 720, 900, 1080] : [300, 420, 720, 900, 1080, 1200])) };

test('one row per day with weekday, today, past and Friday flags', () => {
  const rows = monthRows(nov, { year: 2026, month: 11, day: 6 });
  assert.equal(rows.length, 30);
  assert.equal(rows[0].wd, 'Sön');
  assert.equal(rows[5].today, true);
  assert.equal(rows[4].past, true);
  assert.equal(rows[6].past, false);
  assert.deepEqual(rows.filter((r) => r.friday).map((r) => r.day), [6, 13, 20, 27]);
});

test('missing values become null and rows always have six times', () => {
  const r = monthRows(nov, { year: 2026, month: 11, day: 1 })[4];
  assert.deepEqual(r.times, [300, null, 720, 900, 1080, null]);
});

test('other months are entirely past or future; no schedule gives no rows', () => {
  assert.ok(monthRows(nov, { year: 2026, month: 12, day: 1 }).every((r) => r.past && !r.today));
  assert.ok(monthRows(nov, { year: 2026, month: 10, day: 31 }).every((r) => !r.past && !r.today));
  assert.deepEqual(monthRows(null, { year: 2026, month: 11, day: 1 }), []);
});

test('shiftMonth crosses year boundaries', () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
});
