// Date/time helpers. All schedule times are Swedish local time (Europe/Stockholm),
// stored as minutes after midnight.

export const PRAYERS = [
  { key: 'fajr', name: 'Fajr' },
  { key: 'shuruk', name: 'Shuruk' },
  { key: 'dhohr', name: 'Dhohr' },
  { key: 'asr', name: 'Asr' },
  { key: 'magrib', name: 'Maghrib' },
  { key: 'isha', name: 'Isha' },
];

export const MONTHS_SV = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

export const WEEKDAYS_SV = ['Sön', 'Mån', 'Tis', 'Ons', 'Tors', 'Fre', 'Lör'];

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function weekday(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function lastSunday(year, month) {
  const last = daysInMonth(year, month);
  return last - weekday(year, month, last);
}

// EU summer time: last Sunday of March to last Sunday of October.
export function isDst(year, month, day) {
  if (month < 3 || month > 10) return false;
  if (month > 3 && month < 10) return true;
  if (month === 3) return day >= lastSunday(year, 3);
  return day < lastSunday(year, 10);
}

// Converts a Stockholm wall-clock time to an absolute Date.
// `minutes` may exceed 1440 (e.g. Isha after midnight).
export function stockholmToDate(year, month, day, minutes) {
  const offset = isDst(year, month, day) ? 120 : 60;
  return new Date(Date.UTC(year, month - 1, day, 0, minutes - offset));
}

// Current date and time in Stockholm, independent of device time zone.
export function nowInStockholm(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Stockholm', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return {
    year: +parts.year, month: +parts.month, day: +parts.day,
    minutes: +parts.hour * 60 + +parts.minute,
  };
}

export function fmt(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '';
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function parseTime(text) {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(text ?? '');
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function monthLabel(year, month) {
  return `${MONTHS_SV[month - 1]} ${year}`;
}

// Stable ids, all < REMINDER_ID_BASE: ((yy*12+m-1)*31+d-1)*6+prayer, times 16, plus a slot.
// Slot 0 = on time, 1..7 = reminder by index in REMINDER_MINUTES, 8 = alarm (src/alarm.js), 9..15 free.
// Max for 2099-12-31 is 3 570 000 or so, far below 2^31 and REMINDER_ID_BASE.
export const notificationId = (year, month, day, p, slot) => ((((year - 2000) * 12 + month - 1) * 31 + day - 1) * 6 + p) * 16 + slot;
