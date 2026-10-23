import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardStatus, boardHtml } from '../src/board.js';

// 23 Oct 2026 at Karlstads moské.
const row = [347, 481, 771, 901, 1060, 1186];
const iq = [10, 10, 10, 5, 0];

test('next prayer skips Shuruk and counts down', () => {
  assert.deepEqual(boardStatus(row, 400, iq), { next: 2, line: 'Dhohr om 6 h 11 min', iqamahSoon: false });
  assert.deepEqual(boardStatus(row, 0, iq).next, 0);
});

test('between adhan and iqamah the iqamah is counted down', () => {
  assert.deepEqual(boardStatus(row, 1062, iq), { next: 4, line: 'Iqamah Maghrib om 3 min', iqamahSoon: true });
  // Isha has +0: at the adhan minute the day is done.
  assert.equal(boardStatus(row, 1186, iq).next, null);
  assert.equal(boardStatus(row, 1186, iq).line, 'Dagens böner är klara');
});

test('html: tiles, Jumua only when set, no clock for other days', () => {
  const html = boardHtml({ row, now: 1000, iqamah: iq, jumua: 774, isFriday: true, dateText: 'Fre 23 oktober 2026', hijri: null });
  assert.match(html, /data-clock/);
  assert.match(html, /Jumua<\/span><span class="bs-time today">12:54/);
  assert.equal((html.match(/class="tile/g) ?? []).length, 5);
  assert.match(html, /class="tile next" aria-current="true">\s*<span class="t-name">Maghrib/);
  const other = boardHtml({ row, now: null, iqamah: iq, jumua: null, isFriday: false, dateText: 'x', hijri: null });
  assert.doesNotMatch(other, /data-clock|Jumua|tile next|tile past/);
});
