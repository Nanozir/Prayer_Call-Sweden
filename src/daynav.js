// Day-to-day browsing on the "Idag" tab. Pure functions so they can be tested.
import { monthKey } from './time.js';

export function addDays({ year, month, day }, n) {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export const sameDay = (a, b) => a.year === b.year && a.month === b.month && a.day === b.day;

export function dayRow(schedules, { year, month, day }) {
  return schedules[monthKey(year, month)]?.days[day - 1] ?? null;
}

/**
 * Where a swipe from `from` in direction `dir` (+1 next, -1 previous) leads,
 * or null if it is not allowed. You may step one day into a month without a
 * schedule (to see "Inget schema för …"), but not further into the gap.
 * Returns { to, kind } where kind is 'day' or 'month' (crosses a month boundary).
 */
export function step(schedules, from, dir) {
  const to = addDays(from, dir);
  if (!dayRow(schedules, from) && !dayRow(schedules, to)) return null;
  return { to, kind: to.month === from.month ? 'day' : 'month' };
}
