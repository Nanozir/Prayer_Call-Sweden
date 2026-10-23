// Reads a prayer-time table from text lines, e.g. the text layer of a PDF from
// islam.nu ("2026-11-01 05:05 07:25 11:50 13:43 16:13 18:25"). Text is exact, so
// no OCR correction is needed – only checks that the table is complete and sane.

import { rowProblems, detectMonthYear } from './ocr/correct.js';
import { daysInMonth } from './time.js';

// Header words → our column order (fajr, shuruk, dhohr, asr, magrib, isha).
const COLUMN_WORDS = [
  ['fajr', 'fadjr', 'fajer', 'gryning'],
  ['shuruq', 'shuruk', 'shurooq', 'sunrise', 'soluppgång', 'soluppgang'],
  ['duhur', 'dhuhr', 'dhohr', 'zuhr', 'zohr', 'dhuhur', 'duhr'],
  ['asr'],
  ['maghrib', 'magrib', 'maghreb'],
  ['isha', 'ishâ', 'ishaa', 'esha'],
];

const TIME = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g;

function columnOrder(lines) {
  for (const line of lines) {
    const words = line.toLowerCase().split(/[^a-zåäöâ]+/).filter(Boolean);
    const pos = COLUMN_WORDS.map((aliases) => words.findIndex((w) => aliases.includes(w)));
    if (pos.filter((p) => p >= 0).length >= 5 && pos.every((p) => p >= 0)) {
      // pos[c] = word index of column c → rank of each column among the six.
      const sorted = [...pos].sort((a, b) => a - b);
      return pos.map((p) => sorted.indexOf(p));
    }
  }
  return [0, 1, 2, 3, 4, 5];
}

/**
 * Returns {year, month, days, flags, source} or null when the text holds no table.
 * days[i] = 6 times in minutes (null if missing); flags as in correctTable.
 */
export function parseScheduleText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const order = columnOrder(lines);
  const rows = []; // {date?, day?, times}
  for (const line of lines) {
    const iso = /\b(20\d\d)-(\d\d)-(\d\d)\b/.exec(line);
    const rest = iso ? line.slice(iso.index + iso[0].length) : line;
    const times = [...rest.matchAll(TIME)].map((m) => +m[1] * 60 + +m[2]);
    if (times.length < 6) continue;
    const lead = /^(\d{1,2})(?!\s*[:.]\d)\b/.exec(rest.trim());
    rows.push({
      year: iso ? +iso[1] : null, month: iso ? +iso[2] : null,
      day: iso ? +iso[3] : lead ? +lead[1] : null,
      times: order.map((k) => times[k]),
    });
  }
  if (rows.length < 7) return null;

  // Month from the dates in the table (most common), else from the heading.
  const counts = {};
  for (const r of rows) if (r.year) counts[`${r.year}-${r.month}`] = (counts[`${r.year}-${r.month}`] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  let year, month;
  if (top) [year, month] = top[0].split('-').map(Number);
  else ({ year, month } = detectMonthYear(text));

  const n = year && month ? daysInMonth(year, month) : rows.length;
  const days = Array.from({ length: n }, () => new Array(6).fill(null));
  const flags = Array.from({ length: n }, () => new Array(6).fill('uncertain'));
  rows.forEach((r, idx) => {
    if (r.year && (r.year !== year || r.month !== month)) return;
    const i = (r.day ?? idx + 1) - 1;
    if (i < 0 || i >= n) return;
    days[i] = r.times;
    flags[i] = r.times.map(() => 'ok');
  });
  days.forEach((row, i) => { for (const c of rowProblems(row)) flags[i][c] = 'uncertain'; });

  return {
    year: year ?? null, month: month ?? null, days, flags,
    rowCount: rows.length,
    source: /islam\.nu/i.test(text) ? 'islam.nu' : null,
  };
}
