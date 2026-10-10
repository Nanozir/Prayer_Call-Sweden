import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, step } from '../src/daynav.js';

const oct = { '2026-10': { year: 2026, month: 10, days: Array.from({ length: 31 }, () => [300, 420, 720, 900, 1080, 1200]) } };

test('addDays crosses months and years', () => {
  assert.deepEqual(addDays({ year: 2026, month: 10, day: 31 }, 1), { year: 2026, month: 11, day: 1 });
  assert.deepEqual(addDays({ year: 2027, month: 1, day: 1 }, -1), { year: 2026, month: 12, day: 31 });
});

test('day steps inside a month, month step at the boundary', () => {
  assert.equal(step(oct, { year: 2026, month: 10, day: 8 }, 1).kind, 'day');
  const r = step(oct, { year: 2026, month: 10, day: 31 }, 1);
  assert.deepEqual(r, { to: { year: 2026, month: 11, day: 1 }, kind: 'month' });
});

test('one step into a missing month is allowed, further is not; going back is', () => {
  const nov1 = { year: 2026, month: 11, day: 1 };
  assert.equal(step(oct, nov1, 1), null);
  assert.equal(step(oct, nov1, -1).kind, 'month');
  assert.equal(step(oct, { year: 2026, month: 9, day: 30 }, -1), null);
});

test('continues into the next month when it has a schedule', () => {
  const both = { ...oct, '2026-11': { year: 2026, month: 11, days: Array.from({ length: 30 }, () => [310, 440, 715, 860, 1000, 1150]) } };
  const r = step(both, { year: 2026, month: 10, day: 31 }, 1);
  assert.equal(r.kind, 'month');
  assert.equal(step(both, r.to, 1).kind, 'day');
});
