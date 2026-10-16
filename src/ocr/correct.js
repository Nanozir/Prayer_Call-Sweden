// Turns raw OCR cell text into prayer times and repairs typical OCR mistakes
// (5↔6, 3↔8, a dropped colon, an extra digit) by checking each value against
// the neighbouring days: prayer times only drift a few minutes per day.

import { isDst, MONTHS_SV, daysInMonth } from '../time.js';

// Minutes a value may differ from what its neighbours predict. Real schedules are
// smooth: in the mosque's October table every time is within 0.5 min of the
// average of the day before and after, so 1.5 min catches even 2-minute misreads.
// At the start/end of a month the estimate is one-sided and less precise.
const TOLERANCE = 1.5;
const TOLERANCE_EDGE = 2;

export function digitsOf(text) {
  return (text ?? '').replace(/[^0-9]/g, '');
}

export function digitsToMinutes(d) {
  if (d.length < 3 || d.length > 4) return null;
  const h = +d.slice(0, d.length - 2), m = +d.slice(-2);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

// Every value reachable by changing, deleting or inserting one digit.
function candidates(d) {
  const out = new Set();
  const add = (s) => { const v = digitsToMinutes(s); if (v != null) out.add(v); };
  for (let i = 0; i < d.length; i++) {
    for (let k = 0; k <= 9; k++) add(d.slice(0, i) + k + d.slice(i + 1));
    add(d.slice(0, i) + d.slice(i + 1));
  }
  for (let i = 0; i <= d.length; i++) for (let k = 0; k <= 9; k++) add(d.slice(0, i) + k + d.slice(i));
  return [...out];
}

// Linear estimate for index i from the nearest trusted values on each side.
// Returns { p, tol } – the prediction and how far a value may deviate from it.
function predict(vals, good, i) {
  let a = i - 1, b = i + 1;
  while (a >= 0 && !good[a]) a--;
  while (b < vals.length && !good[b]) b++;
  if (a >= 0 && b < vals.length) {
    // Interpolating over a gap of several days is less precise than between neighbours.
    const tol = b - a === 2 ? TOLERANCE : TOLERANCE_EDGE;
    return { p: vals[a] + ((vals[b] - vals[a]) * (i - a)) / (b - a), tol };
  }
  // Extrapolate from two values on the same side.
  if (a >= 0) {
    let a2 = a - 1; while (a2 >= 0 && !good[a2]) a2--;
    return { p: a2 >= 0 ? vals[a] + ((vals[a] - vals[a2]) * (i - a)) / (a - a2) : vals[a], tol: TOLERANCE_EDGE };
  }
  if (b < vals.length) {
    let b2 = b + 1; while (b2 < vals.length && !good[b2]) b2++;
    return { p: b2 < vals.length ? vals[b] - ((vals[b2] - vals[b]) * (b - i)) / (b2 - b) : vals[b], tol: TOLERANCE_EDGE };
  }
  return null;
}

/**
 * rawRows: array (one per day) of 6 OCR results. Each result is a string, or an
 * array of alternative readings of the same cell (first = primary reading).
 * Returns {days, flags} where days[i][c] is minutes (Stockholm time) or null and
 * flags[i][c] is 'ok' | 'corrected' | 'uncertain'.
 */
export function correctTable(rawRows, year, month) {
  const n = rawRows.length;
  const dstShift = (i) => (isDst(year, month, i + 1) ? 60 : 0);
  const days = rawRows.map(() => new Array(6).fill(null));
  const flags = rawRows.map(() => new Array(6).fill('ok'));

  for (let c = 0; c < 6; c++) {
    const readings = rawRows.map((r) => (Array.isArray(r[c]) ? r[c] : [r[c]]).map(digitsOf));
    const digits = readings.map((alts) => alts[0]);
    // Work in standard time so the DST jump does not look like an error.
    const vals = digits.map((d, i) => {
      let v = digitsToMinutes(d);
      if (v != null && c === 5 && v < 180) v += 1440; // Isha after midnight
      return v == null ? null : v - dstShift(i);
    });
    const good = vals.map((v) => v != null);

    // Greedily drop the worst outlier until every trusted value fits its neighbours.
    for (;;) {
      let worst = -1, worstExcess = 0;
      for (let i = 0; i < n; i++) {
        if (!good[i]) continue;
        good[i] = false;
        const est = predict(vals, good, i);
        good[i] = true;
        const excess = est == null ? 0 : Math.abs(vals[i] - est.p) - est.tol;
        if (excess > worstExcess) { worstExcess = excess; worst = i; }
      }
      if (worst < 0) break;
      good[worst] = false;
    }

    for (let i = 0; i < n; i++) {
      if (good[i]) { days[i][c] = vals[i] + dstShift(i); continue; }
      const est = predict(vals, good, i);
      if (est == null) { flags[i][c] = 'uncertain'; continue; }
      const { p, tol } = est;
      let best = null;
      const consider = (v, dev) => { if (dev <= tol && (!best || dev < best.dev)) best = { v, dev }; };
      // An alternative reading that fits as-is beats guessing digit edits.
      for (const alt of readings[i].slice(1)) {
        let v = digitsToMinutes(alt);
        if (v == null) continue;
        if (c === 5 && v < 180) v += 1440;
        consider(v, Math.abs(v - dstShift(i) - p));
      }
      if (!best) {
        for (const d of readings[i]) {
          for (let v of candidates(d)) {
            if (c === 5 && v < 180) v += 1440;
            consider(v, Math.abs(v - dstShift(i) - p));
          }
        }
      }
      if (best) {
        days[i][c] = best.v;
        flags[i][c] = 'corrected';
      } else {
        // Best guess so the user only has to confirm/adjust it.
        days[i][c] = Math.round(p) + dstShift(i);
        flags[i][c] = 'uncertain';
      }
    }
  }
  return { days, flags };
}

// Checks one day: prayers must come in order. Returns list of problem columns.
export function rowProblems(row) {
  const bad = [];
  // Isha shortly after midnight (summer) counts as later than Maghrib.
  const v = (c) => (c === 5 && row[c] < 180 ? row[c] + 1440 : row[c]);
  for (let c = 1; c < 6; c++) {
    if (row[c] == null || row[c - 1] == null) continue;
    if (v(c) <= v(c - 1)) bad.push(c);
  }
  return bad;
}

export function validateSchedule(sched) {
  const issues = [];
  const expected = daysInMonth(sched.year, sched.month);
  if (sched.days.length !== expected) {
    issues.push(`Schemat har ${sched.days.length} dagar men ${MONTHS_SV[sched.month - 1]} har ${expected}.`);
  }
  sched.days.forEach((row, i) => {
    if (row.some((v) => v == null)) issues.push(`Dag ${i + 1} saknar tider.`);
    else if (rowProblems(row).length) issues.push(`Dag ${i + 1}: tiderna är inte i rätt ordning.`);
  });
  return issues;
}

// --- Month / year detection from header text ---------------------------------

const MONTH_ALIASES = [
  ['januari', 'january', 'jan'], ['februari', 'february', 'feb'], ['mars', 'march'],
  ['april', 'apr'], ['maj', 'may'], ['juni', 'june'], ['juli', 'july'],
  ['augusti', 'august', 'aug'], ['september', 'sept', 'sep'], ['oktober', 'october', 'okt', 'oct'],
  ['november', 'nov'], ['december', 'dec'],
];

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

export function detectMonthYear(text) {
  const lower = (text ?? '').toLowerCase();
  const yearMatch = /20[2-9]\d/.exec(lower);
  let month = null, bestDist = Infinity;
  for (const word of lower.match(/[a-zåäö]{3,}/g) ?? []) {
    MONTH_ALIASES.forEach((aliases, idx) => {
      for (const a of aliases) {
        const allowed = a.length >= 6 ? 2 : a.length >= 4 ? 1 : 0;
        const d = editDistance(word, a);
        if (d <= allowed && d < bestDist) { bestDist = d; month = idx + 1; }
      }
    });
  }
  return { year: yearMatch ? +yearMatch[0] : null, month };
}
