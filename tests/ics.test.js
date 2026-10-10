import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs } from '../src/ics.js';
import { DEFAULT_SETTINGS } from '../src/store.js';

const sched = { year: 2026, month: 10, days: Array.from({ length: 31 }, () => [293, 429, 776, 948, 1122, 1249]) };

test('one event per enabled prayer and day, in UTC, with an alert at the time', () => {
  const ics = buildIcs(sched, { ...DEFAULT_SETTINGS, offset: 0 }, new Date('2026-10-10T00:00:00Z'));
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 31 * 5);
  assert.match(ics, /DTSTART:20261001T025300Z/); // Fajr 04:53 summer time
  assert.match(ics, /DTSTART:20261031T035300Z/); // 04:53 winter time
  assert.equal(ics.match(/TRIGGER:PT0M/g).length, 31 * 5);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'all line breaks are CRLF');
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test('adds an early alert when a reminder is chosen', () => {
  const ics = buildIcs(sched, { ...DEFAULT_SETTINGS, offset: 10 });
  assert.equal(ics.match(/TRIGGER:-PT10M/g).length, 31 * 5);
});
