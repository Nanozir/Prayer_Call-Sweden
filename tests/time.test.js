import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDst, stockholmToDate, nowInStockholm } from '../src/time.js';

test('Swedish DST boundaries 2026', () => {
  assert.equal(isDst(2026, 3, 28), false);
  assert.equal(isDst(2026, 3, 29), true);
  assert.equal(isDst(2026, 10, 24), true);
  assert.equal(isDst(2026, 10, 25), false);
});

test('Stockholm wall clock to UTC', () => {
  assert.equal(stockholmToDate(2026, 10, 24, 12 * 60 + 51).toISOString(), '2026-10-24T10:51:00.000Z');
  assert.equal(stockholmToDate(2026, 10, 25, 11 * 60 + 51).toISOString(), '2026-10-25T10:51:00.000Z');
  const n = nowInStockholm(new Date('2026-10-08T06:13:00Z'));
  assert.deepEqual(n, { year: 2026, month: 10, day: 8, minutes: 8 * 60 + 13 });
});
