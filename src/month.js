// Month overview rows. Pure so they can be tested.
import { weekday, WEEKDAYS_SV } from './time.js';

/**
 * One row per day of `schedule`: { day, wd, friday, today, past, times }.
 * `times` always has six entries (null where missing). `today` is {year, month, day}.
 */
export function monthRows(schedule, today) {
  if (!schedule) return [];
  const { year, month } = schedule;
  const key = year * 10000 + month * 100;
  const now = today.year * 10000 + today.month * 100 + today.day;
  return schedule.days.map((row, i) => {
    const day = i + 1;
    const w = weekday(year, month, day);
    return {
      day, wd: WEEKDAYS_SV[w], friday: w === 5,
      today: key + day === now, past: key + day < now,
      times: Array.from({ length: 6 }, (_, c) => (Number.isFinite(row?.[c]) ? row[c] : null)),
    };
  });
}

/** Month `delta` steps from {year, month}. */
export function shiftMonth({ year, month }, delta) {
  const i = year * 12 + month - 1 + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}
