import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prayerNotifications, widgetPrayers, notificationId } from '../src/notify.js';
import { DEFAULT_SETTINGS, REMINDER_MINUTES, cleanBefore } from '../src/store.js';

// 1 Nov 2026: Fajr 05:06, Dhohr 11:49 (Stockholm, UTC+1)
const sched = { year: 2026, month: 11, days: Array.from({ length: 30 }, () => [306, 450, 709, 820, 950, 1070]) };
const now = new Date('2026-11-01T00:00:00Z');
const all = (l) => Object.fromEntries(Object.keys(DEFAULT_SETTINGS.enabled).map((k) => [k, l]));
const opts = (o = {}) => ({ ...DEFAULT_SETTINGS, enabled: { ...DEFAULT_SETTINGS.enabled }, ...o });

test('without a reminder there is exactly one notification per prayer, at the prayer time', () => {
  const day1 = prayerNotifications({ x: sched }, opts(), now).filter((n) => n.schedule.at < new Date('2026-11-02T00:00:00Z'));
  assert.equal(day1.length, 5); // Shuruk off by default
  assert.equal(day1[0].schedule.at.toISOString(), '2026-11-01T04:06:00.000Z');
  assert.match(day1[0].title, /dags för Fajr/);
});

test('with a reminder, the prayer time itself still gets its own notification', () => {
  const list = prayerNotifications({ x: sched }, opts({ before: all([10]) }), now);
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
  const ch = (sound) => prayerNotifications({ x: sched }, opts({ sound, before: all([5]) }), now).slice(0, 2).map((n) => n.channelId);
  assert.deepEqual(ch('bells'), ['before_chime', 'prayer_bells']);
  assert.deepEqual(ch('off'), ['before_silent', 'prayer_silent']);
  assert.deepEqual(ch('adhan'), ['before_chime', 'prayer_adhan']);
});

test('widget gets the coming prayers without Shuruk, in order, with Swedish times', () => {
  const list = widgetPrayers({ x: sched }, new Date('2026-11-01T05:00:00Z'), 1);
  assert.deepEqual(list.slice(0, 2).map((p) => [p.name, p.time]), [['Dhohr', '11:49'], ['Asr', '13:40']]);
  assert.ok(list.every((p) => p.name !== 'Shuruk'));
  assert.ok(list.every((p, i) => i === 0 || p.at > list[i - 1].at));
  assert.ok(list.at(-1).at <= new Date('2026-11-02T05:00:00Z').getTime());
});

test('several reminders per prayer give one notification each plus the on-time one', () => {
  const before = { ...all([]), dhohr: [10, 5] };
  const list = prayerNotifications({ x: sched }, opts({ before }), now);
  const dhohr = list.filter((n) => /Dhohr/.test(n.title)).filter((n) => n.schedule.at < new Date('2026-11-02T00:00:00Z'));
  assert.deepEqual(dhohr.map((n) => n.schedule.at.toISOString()),
    ['2026-11-01T10:39:00.000Z', '2026-11-01T10:44:00.000Z', '2026-11-01T10:49:00.000Z']);
  assert.match(dhohr[0].title, /Påminnelse: Dhohr om 10 min/);
  assert.match(dhohr[1].title, /Påminnelse: Dhohr om 5 min/);
  assert.match(dhohr[2].title, /dags för Dhohr/);
  assert.equal(list.length, 30 * 5 + 30 * 2);
});

test('legacy offset migrates into every prayer, only once', () => {
  assert.deepEqual(cleanBefore(undefined, 10).asr, [10]);
  assert.deepEqual(cleanBefore(undefined, 0).asr, []);
  assert.deepEqual(cleanBefore({ asr: [60, 5, 7, 5] }, 10).asr, [5, 60]);
  assert.deepEqual(cleanBefore({ asr: [5] }, 10).fajr, []);
});

test('ids are unique, stable and in range over a month, all slots and the far future', () => {
  const before = all(REMINDER_MINUTES);
  const list = prayerNotifications({ x: sched }, opts({ before, enabled: all(true) }), now);
  assert.equal(list.length, 398); // capped at MAX - 2, soonest first
  assert.equal(new Set(list.map((n) => n.id)).size, list.length);
  assert.ok(list.every((n) => n.id > 0 && n.id < 2_000_000_000));
  assert.equal(notificationId(2026, 11, 1, 0, 0), notificationId(2026, 11, 1, 0, 0));
  assert.ok(notificationId(2099, 12, 31, 5, 15) < 2 ** 31 - 1);
  assert.ok(notificationId(2099, 12, 31, 5, 15) < 2_000_000_000);
});
