import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthItems } from '../src/health.js';

const base = { native: true, platform: 'android', display: true, exact: true, pending: 120, limit: 500, last: new Date('2026-11-30T17:00:00Z') };

test('all good on Android', () => {
  const items = healthItems(base, { unrestricted: true, manufacturer: 'Google' }, true);
  assert.deepEqual(items.map((i) => i.id), ['display', 'exact', 'battery', 'schedule', 'pending']);
  assert.ok(items.every((i) => i.ok));
  assert.match(items.at(-1).text, /120 notiser inlagda till och med 30 november/);
});

test('flags what can stop notifications, with the matching action', () => {
  const items = healthItems({ ...base, display: false, exact: false, pending: 0 }, { unrestricted: false, manufacturer: 'OnePlus' }, false);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(byId.display.ok, false);
  assert.equal(byId.display.action, 'notification-settings');
  assert.equal(byId.exact.action, 'exact-alarms');
  assert.equal(byId.battery.ok, false);
  assert.match(byId.battery.text, /OnePlus/);
  assert.equal(byId.schedule.action, 'add-schedule');
  assert.equal(byId.pending.ok, false);
});

test('iPhone shows the 64-notification budget and no Android-only rows', () => {
  const items = healthItems({ ...base, platform: 'ios', exact: null, pending: 58, limit: 64 }, null, true);
  assert.deepEqual(items.map((i) => i.id), ['display', 'schedule', 'pending']);
  assert.match(items.at(-1).text, /58 av 64 notiser inlagda/);
  assert.ok(items.at(-1).note);
});
