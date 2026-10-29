// Alarm clock per prayer: rings `before` minutes ahead of the prayer, every day.
// Pure computation; the native side (Android AlarmManager / iOS notification) is in notify.js.

import { PRAYERS, stockholmToDate, notificationId } from './time.js';

export const ALARM_BEFORE = [0, 5, 10, 15, 20, 25, 30];
const ALARM_SLOT = 8;

export const defaultAlarms = () => Object.fromEntries(PRAYERS.map((p) => [p.key, { on: false, before: 15 }]));

export function cleanAlarms(alarms) {
  const out = defaultAlarms();
  if (!alarms || typeof alarms !== 'object') return out;
  for (const p of PRAYERS) {
    const a = alarms[p.key];
    if (!a || typeof a !== 'object') continue;
    out[p.key] = { on: a.on === true, before: ALARM_BEFORE.includes(a.before) ? a.before : 15 };
  }
  return out;
}

const hhmm = (d) => d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });

/** "tors 05:13" in Swedish time. */
export function alarmLabel(at) {
  const d = new Date(at);
  const wd = d.toLocaleDateString('sv-SE', { weekday: 'short', timeZone: 'Europe/Stockholm' }).replace('.', '');
  return `${wd} ${hhmm(d)}`;
}

/**
 * The coming alarms (earliest first, at most `limit`) from the effective schedules.
 * Only dates a schedule covers; times already passed are skipped.
 * Returns [{ id, at (epoch ms), key, title, body }].
 */
export function alarmTimes(schedules, settings, now = new Date(), limit = 14) {
  const alarms = cleanAlarms(settings?.alarms);
  const list = [];
  for (const sched of Object.values(schedules)) {
    sched.days.forEach((row, d) => {
      row.forEach((minutes, p) => {
        const prayer = PRAYERS[p];
        const cfg = alarms[prayer.key];
        if (minutes == null || !cfg.on) return;
        const time = stockholmToDate(sched.year, sched.month, d + 1, minutes);
        const at = time.getTime() - cfg.before * 60_000;
        if (at <= now.getTime()) return;
        const est = sched.estimated ? ' – beräknad tid, kan avvika' : '';
        list.push({
          id: notificationId(sched.year, sched.month, d + 1, p, ALARM_SLOT),
          at,
          key: prayer.key,
          title: cfg.before ? `${prayer.name} om ${cfg.before} min` : `Det är dags för ${prayer.name}`,
          body: `${prayer.name} ${hhmm(time)}${est}`,
        });
      });
    });
  }
  return list.sort((a, b) => a.at - b.at).slice(0, limit);
}
