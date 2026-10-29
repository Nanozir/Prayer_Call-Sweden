import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alarmTimes, cleanAlarms, alarmLabel, ALARM_BEFORE } from '../src/alarm.js';
import { DEFAULT_SETTINGS } from '../src/store.js';
import { parseBackup } from '../src/backup.js';
import { notificationId } from '../src/notify.js';

// Nov 2026 (UTC+1): Fajr 05:06, Shuruk 07:30, Dhohr 11:49
const sched = { year: 2026, month: 11, days: Array.from({ length: 30 }, () => [306, 450, 709, 820, 950, 1070]) };
const now = new Date('2026-11-01T00:00:00Z');
const withAlarms = (a) => ({ ...DEFAULT_SETTINGS, alarms: cleanAlarms(a) });

test('no alarms by default', () => {
  assert.deepEqual(alarmTimes({ x: sched }, DEFAULT_SETTINGS, now), []);
});

test('Fajr alarm rings 15 min before Fajr each day', () => {
  const list = alarmTimes({ x: sched }, withAlarms({ fajr: { on: true, before: 15 } }), now, 3);
  assert.equal(list.length, 3);
  assert.equal(new Date(list[0].at).toISOString(), '2026-11-01T03:51:00.000Z'); // 04:51 Stockholm
  assert.equal(new Date(list[1].at).toISOString(), '2026-11-02T03:51:00.000Z');
  assert.match(list[0].title, /Fajr om 15 min/);
  assert.match(list[0].body, /Fajr 05:06/);
});

test('0 minutes rings at the prayer time; Shuruk works too', () => {
  const list = alarmTimes({ x: sched }, withAlarms({ shuruk: { on: true, before: 0 }, fajr: { on: true, before: 30 } }), now, 4);
  assert.equal(new Date(list[0].at).toISOString(), '2026-11-01T03:36:00.000Z');
  assert.equal(new Date(list[1].at).toISOString(), '2026-11-01T06:30:00.000Z');
  assert.match(list[1].title, /Det är dags för Shuruk/);
});

test('skips past alarms and respects the limit; only covered dates', () => {
  const late = new Date('2026-11-01T04:00:00Z'); // after the 04:51 alarm
  const list = alarmTimes({ x: sched }, withAlarms({ fajr: { on: true, before: 15 } }), late, 100);
  assert.equal(new Date(list[0].at).toISOString(), '2026-11-02T03:51:00.000Z');
  assert.equal(list.length, 29); // 2..30 Nov, nothing after the schedule
  assert.equal(alarmTimes({ x: sched }, withAlarms({ fajr: { on: true, before: 15 } }), late, 5).length, 5);
});

test('ids are unique, stable, in slot 8 and below the reminder id range', () => {
  const list = alarmTimes({ x: sched }, withAlarms({ fajr: { on: true, before: 5 }, isha: { on: true, before: 5 } }), now, 100);
  assert.equal(new Set(list.map((a) => a.id)).size, list.length);
  assert.equal(list[0].id, notificationId(2026, 11, 1, 0, 8));
  assert.ok(list.every((a) => a.id % 16 === 8 && a.id < 2_000_000_000));
});

test('cleanAlarms fixes bad input', () => {
  assert.deepEqual(cleanAlarms(null).fajr, { on: false, before: 15 });
  const c = cleanAlarms({ fajr: { on: true, before: 7 }, asr: { on: 'yes', before: 30 }, bogus: { on: true }, isha: 5 });
  assert.deepEqual(c.fajr, { on: true, before: 15 });
  assert.deepEqual(c.asr, { on: false, before: 30 });
  assert.equal(c.bogus, undefined);
  assert.deepEqual(Object.keys(c), Object.keys(DEFAULT_SETTINGS.enabled));
  assert.deepEqual(ALARM_BEFORE, [0, 5, 10, 15, 20, 25, 30]);
});

test('alarms survive a backup round trip', () => {
  const settings = { ...DEFAULT_SETTINGS, alarms: cleanAlarms({ fajr: { on: true, before: 20 } }) };
  const text = JSON.stringify({ kind: 'salah-kalender-backup', format: 1, settings });
  assert.deepEqual(parseBackup(text).settings.alarms.fajr, { on: true, before: 20 });
  assert.deepEqual(parseBackup(JSON.stringify({ kind: 'salah-kalender-backup', format: 1, settings: {} })).settings.alarms.fajr, { on: false, before: 15 });
});

test('alarmLabel is weekday and Stockholm time', () => {
  assert.equal(alarmLabel(Date.parse('2026-10-08T03:13:00Z')), 'tors 05:13');
});
