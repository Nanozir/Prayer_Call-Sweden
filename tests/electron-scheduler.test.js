import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { Scheduler, GRACE_MS, MAX_WAIT_MS, SNOOZE_MS } = createRequire(import.meta.url)('../electron/scheduler.cjs');

const it = (id, at, extra = {}) => ({ id, at, kind: 'prayer', title: 'Fajr', body: 'Dags', sound: 'adhan', ...extra });
const T = 1_800_000_000_000;

test('items are kept sorted by time', () => {
  const s = new Scheduler([it(2, T + 200), it(1, T + 100), it(3, T + 50)]);
  assert.deepEqual(s.items.map((x) => x.id), [3, 1, 2]);
});

test('invalid items are dropped, unknown kind/sound are normalised', () => {
  const s = new Scheduler([null, { id: 1 }, { id: 2, at: 'x' }, { id: 3, at: T, kind: 'zzz', sound: 'zzz' }]);
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].kind, 'info');
  assert.equal(s.items[0].sound, 'off');
  assert.equal(new Scheduler('nope').items.length, 0);
});

test('due returns items at or before now and removes them', () => {
  const s = new Scheduler([it(1, T), it(2, T + 1000), it(3, T + 5000)]);
  assert.deepEqual(s.due(T - 1), []);
  assert.deepEqual(s.due(T + 1000).map((x) => x.id), [1, 2]);
  assert.deepEqual(s.items.map((x) => x.id), [3]);
});

test('missed by more than 2 minutes is dropped silently, recent still fires', () => {
  const now = T + GRACE_MS + 30_000;
  const s = new Scheduler([it(1, T), it(2, T + 60_000), it(3, T + GRACE_MS + 10_000)]);
  assert.deepEqual(s.due(now).map((x) => x.id), [2, 3]);
  assert.equal(s.items.length, 0);
});

test('exactly at the grace limit still fires', () => {
  const s = new Scheduler([it(1, T)]);
  assert.equal(s.due(T + GRACE_MS).length, 1);
});

test('replace-all discards previous items', () => {
  const s = new Scheduler([it(1, T + 10)]);
  assert.equal(s.replace([it(7, T + 20), it(8, T + 30)]), 2);
  assert.deepEqual(s.items.map((x) => x.id), [7, 8]);
  s.clear();
  assert.equal(s.items.length, 0);
});

test('snooze re-schedules the same alarm 5 minutes later', () => {
  const s = new Scheduler();
  s.snooze(it(9, T, { kind: 'alarm' }), T + 1000);
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].at, T + 1000 + SNOOZE_MS);
  assert.equal(s.items[0].kind, 'alarm');
  assert.equal(s.items[0].id, 9);
});

test('nextDelay is clamped to 60 s, never negative, null when empty', () => {
  const s = new Scheduler();
  assert.equal(s.nextDelay(T), null);
  s.replace([it(1, T + 30 * 24 * 3600 * 1000)]);
  assert.equal(s.nextDelay(T), MAX_WAIT_MS);
  s.replace([it(1, T + 5000)]);
  assert.equal(s.nextDelay(T), 5000);
  s.replace([it(1, T - 5000)]);
  assert.equal(s.nextDelay(T), 0);
});

test('long delays (> 2^31 ms) never produce an oversized timeout', () => {
  const s = new Scheduler([it(1, T + 2 ** 33)]);
  assert.ok(s.nextDelay(T) <= MAX_WAIT_MS);
});

test('pending keeps future and grace-period items only', () => {
  const s = new Scheduler([it(1, T - GRACE_MS - 1), it(2, T - 1000), it(3, T + 1000)]);
  assert.deepEqual(s.pending(T).map((x) => x.id), [2, 3]);
});
