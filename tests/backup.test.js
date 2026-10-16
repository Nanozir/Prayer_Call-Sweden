import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup } from '../src/backup.js';
import { DEFAULT_SETTINGS } from '../src/store.js';

const oct = { year: 2026, month: 10, days: Array.from({ length: 31 }, () => [293, 429, 776, 948, 1122, 1249]) };

test('round trip keeps schedules and settings, drops estimated months', () => {
  const settings = { ...DEFAULT_SETTINGS, sound: 'adhan', offset: 10, hijriOffset: -1 };
  const text = buildBackup({ '2026-10': oct, '2026-11': { ...oct, month: 11, estimated: true } }, settings, '1.7.0');
  const back = parseBackup(text);
  assert.deepEqual(Object.keys(back.schedules), ['2026-10']);
  assert.deepEqual(back.schedules['2026-10'].days, oct.days);
  assert.equal(back.settings.sound, 'adhan');
  assert.equal(back.settings.offset, 10);
  assert.equal(back.settings.hijriOffset, -1);
});

test('rejects foreign files and skips broken schedules', () => {
  assert.throws(() => parseBackup('hello'), /inte en säkerhetskopia/);
  assert.throws(() => parseBackup('{"kind":"other"}'), /inte en säkerhetskopia/);
  const bad = JSON.stringify({
    kind: 'salah-kalender-backup', format: 1,
    schedules: { a: oct, b: { ...oct, days: oct.days.slice(0, 5) }, c: { ...oct, days: [['<script>']] } },
    settings: { sound: 'evil', offset: 7, enabled: { fajr: 'yes' } },
  });
  const back = parseBackup(bad);
  assert.deepEqual(Object.keys(back.schedules), ['2026-10']);
  assert.equal(back.skipped, 2);
  assert.equal(back.settings.sound, DEFAULT_SETTINGS.sound);
  assert.equal(back.settings.offset, DEFAULT_SETTINGS.offset);
  assert.equal(back.settings.enabled.fajr, true);
});
