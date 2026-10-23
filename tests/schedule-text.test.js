import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleText } from '../src/schedule-text.js';

const ISLAMNU = `Bönetider för Karlstad (2026
november)
Datum Fajr Shuruq Duhur Asr Maghrib Ishâ
2026-11-01 05:05 07:25 11:50 13:43 16:13 18:25
2026-11-02 05:07 07:28 11:50 13:41 16:10 18:23
2026-11-03 05:09 07:30 11:50 13:39 16:08 18:21
2026-11-04 05:12 07:33 11:50 13:37 16:05 18:19
2026-11-05 05:14 07:35 11:50 13:35 16:03 18:17
2026-11-06 05:16 07:38 11:50 13:34 16:00 18:15
2026-11-07 05:18 07:40 11:50 13:32 15:58 18:13
Bönetiderna är hämtade från islam.nu`;

test('reads islam.nu table text', () => {
  const r = parseScheduleText(ISLAMNU);
  assert.equal(r.year, 2026);
  assert.equal(r.month, 11);
  assert.equal(r.source, 'islam.nu');
  assert.equal(r.days.length, 30);
  assert.deepEqual(r.days[0], [305, 445, 710, 823, 973, 1105]);
  assert.deepEqual(r.flags[0], ['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
  // Days missing from the text are left empty and red.
  assert.deepEqual(r.days[7], [null, null, null, null, null, null]);
  assert.equal(r.flags[7][0], 'uncertain');
});

test('maps columns by header order', () => {
  const text = ['Dag Fajr Soluppgång Dhuhr Asr Isha Maghrib',
    ...Array.from({ length: 10 }, (_, i) => `${i + 1} 05:0${i % 10} 07:00 12:00 15:00 20:00 18:00`), 'oktober 2026'].join('\n');
  const r = parseScheduleText(text);
  assert.equal(r.month, 10);
  assert.equal(r.year, 2026);
  assert.deepEqual(r.days[3], [303, 420, 720, 900, 1080, 1200]);
  assert.equal(r.source, null);
});

test('flags times out of order and returns null without a table', () => {
  const rows = Array.from({ length: 8 }, (_, i) => `2026-11-0${i + 1} 05:05 07:25 11:50 13:43 ${i === 2 ? '10:00' : '16:13'} 18:25`);
  const r = parseScheduleText(rows.join('\n'));
  assert.equal(r.flags[2][4], 'uncertain');
  assert.equal(parseScheduleText('Hej\n12:00 13:00'), null);
});
