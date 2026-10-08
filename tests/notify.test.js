import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prayerNotifications } from '../src/notify.js';
import { DEFAULT_SETTINGS } from '../src/store.js';

// 1 Nov 2026: Fajr 05:06, Dhohr 11:49 (Stockholm, UTC+1)
const sched = { year: 2026, month: 11, days: Array.from({ length: 30 }, () => [306, 450, 709, 820, 950, 1070]) };
const now = new Date('2026-11-01T00:00:00Z');
const opts = (o) => ({ ...DEFAULT_SETTINGS, enabled: { ...DEFAULT_SETTINGS.enabled }, ...o });

test('without a reminder there is exactly one notification per prayer, at the prayer time', () => {
  const day1 = prayerNotifications({ x: sched }, opts({ offset: 0 }), now).filter((n) => n.schedule.at < new Date('2026-11-02T00:00:00Z'));
  assert.equal(day1.length, 5); // Shuruk off by default
  assert.equal(day1[0].schedule.at.toISOString(), '2026-11-01T04:06:00.000Z');
  assert.match(day1[0].title, /dags för Fajr/);
});

test('with a reminder, the prayer time itself still gets its own notification', () => {
  const list = prayerNotifications({ x: sched }, opts({ offset: 10 }), now);
  const fajr = list.filter((n) => n.schedule.at < new Date('2026-11-01T05:00:00Z'));
  assert.equal(fajr.length, 2);
  assert.equal(fajr[0].schedule.at.toISOString(), '2026-11-01T03:56:00.000Z');
  assert.match(fajr[0].title, /Påminnelse: Fajr om 10 min/);
  assert.match(fajr[0].body, /Inte bönetid än/);
  assert.equal(fajr[1].schedule.at.toISOString(), '2026-11-01T04:06:00.000Z');
  assert.match(fajr[1].title, /dags för Fajr/);
  assert.notEqual(fajr[0].id, fajr[1].id);
  assert.equal(new Set(list.map((n) => n.id)).size, list.length);
});

test('sound choice selects the channel', () => {
  const ch = (sound) => prayerNotifications({ x: sched }, opts({ sound, offset: 5 }), now).slice(0, 2).map((n) => n.channelId);
  assert.deepEqual(ch('bells'), ['before_chime', 'prayer_bells']);
  assert.deepEqual(ch('off'), ['before_silent', 'prayer_silent']);
  assert.deepEqual(ch('adhan'), ['before_chime', 'prayer_adhan']);
});
