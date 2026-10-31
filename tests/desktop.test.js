import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desktopItems, isDesktop, platform } from '../src/desktop.js';
import { prayerNotifications } from '../src/notify.js';
import { alarmTimes } from '../src/alarm.js';
import { DEFAULT_SETTINGS } from '../src/store.js';

const sched = { year: 2026, month: 11, days: Array.from({ length: 30 }, () => [306, 450, 709, 820, 950, 1070]) };
const now = new Date('2026-11-01T00:00:00Z');
const settings = (o = {}) => ({ ...DEFAULT_SETTINGS, enabled: { ...DEFAULT_SETTINGS.enabled }, ...o });
const build = (s, opts) => desktopItems({
  prayers: prayerNotifications({ x: sched }, s, now, 0, Infinity),
  reminders: [{ id: 2_000_000_002, title: 'Bönetidsschemat har gått ut', body: 'x', schedule: { at: new Date('2026-12-01T08:00:00Z') } }],
  alarms: alarmTimes({ x: sched }, s, now, 400),
}, s, now, opts);

test('without the bridge it is the web and nothing is desktop', () => {
  assert.equal(isDesktop(), false);
  assert.equal(platform(), 'web');
});

test('maps prayers, reminders, schedule notices and alarms to bridge items in time order', () => {
  const s = settings({ sound: 'bells', before: { ...DEFAULT_SETTINGS.before, fajr: [10] }, alarms: { ...DEFAULT_SETTINGS.alarms, fajr: { on: true, before: 15 } } });
  const items = build(s);
  assert.ok(items.every((i, k) => k === 0 || items[k - 1].at <= i.at));
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  const first = items.filter((i) => i.at < Date.UTC(2026, 10, 1, 5));
  assert.deepEqual(first.map((i) => i.kind), ['alarm', 'before', 'prayer']);
  assert.equal(first[0].at, Date.UTC(2026, 10, 1, 4, 6) - 15 * 60_000);
  assert.equal(first[0].sound, 'adhan');
  assert.equal(first[1].sound, 'chime');
  assert.equal(first[2].sound, 'bells');
  assert.deepEqual(Object.keys(first[2]).sort(), ['at', 'body', 'id', 'kind', 'sound', 'title']);
  assert.ok(items.some((i) => i.kind === 'info' && /Bönetidsschemat har gått ut/.test(i.title)));
});

test('sound off silences prayers, reminders and notices but not alarms', () => {
  const s = settings({ sound: 'off', before: { ...DEFAULT_SETTINGS.before, fajr: [10] }, alarms: { ...DEFAULT_SETTINGS.alarms, asr: { on: true, before: 0 } } });
  const items = build(s);
  assert.ok(items.filter((i) => i.kind !== 'alarm').every((i) => i.sound === 'off'));
  assert.ok(items.filter((i) => i.kind === 'alarm').every((i) => i.sound === 'adhan'));
});

test('only the next days and at most max items are sent', () => {
  const s = settings();
  const items = build(s, { days: 3, max: 500 });
  assert.ok(items.every((i) => i.at <= now.getTime() + 3 * 864e5));
  assert.equal(items.filter((i) => i.kind === 'prayer').length, 15);
  assert.equal(build(s, { max: 7 }).length, 7);
});
