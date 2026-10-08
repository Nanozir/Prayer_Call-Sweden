// Schedules local notifications from the stored schedules. Everything is rebuilt
// from scratch each time, so a deleted/replaced schedule never leaves stale alarms
// behind and nothing is scheduled past the last day the mosque's tables cover.

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PRAYERS, stockholmToDate, monthLabel, MONTHS_SV } from './time.js';
import { coverageEnd, scheduleStatus } from './store.js';

const CHANNEL = 'salah';
// Android allows max 500 alarms per app, iOS 64 pending notifications.
const MAX = Capacitor.getPlatform() === 'ios' ? 60 : 400;
const REMINDER_ID_BASE = 2_000_000_000;

export const isNative = () => Capacitor.isNativePlatform();

export async function ensurePermissions() {
  if (!isNative()) return { display: false, exact: false };
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
  let exact = true;
  if (Capacitor.getPlatform() === 'android') {
    try {
      exact = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted';
    } catch { /* older Android */ }
  }
  return { display: perm.display === 'granted', exact };
}

export async function openExactAlarmSettings() {
  try { await LocalNotifications.changeExactNotificationSetting(); } catch { /* not Android */ }
}

function prayerNotifications(schedules, settings, now) {
  const list = [];
  for (const sched of Object.values(schedules)) {
    if (scheduleStatus(sched) === 'expired') continue;
    sched.days.forEach((row, d) => {
      row.forEach((minutes, p) => {
        const prayer = PRAYERS[p];
        if (minutes == null || !settings.enabled[prayer.key]) return;
        const at = stockholmToDate(sched.year, sched.month, d + 1, minutes - settings.offset);
        if (at <= now) return;
        const time = stockholmToDate(sched.year, sched.month, d + 1, minutes);
        const hhmm = time.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
        list.push({
          id: (sched.year * 10000 + sched.month * 100 + d + 1) * 10 + p,
          title: settings.offset ? `${prayer.name} om ${settings.offset} min` : `Dags för ${prayer.name}`,
          body: `${prayer.name} ${hhmm} (Karlstads moské)`,
          schedule: { at, allowWhileIdle: true },
          channelId: CHANNEL,
        });
      });
    });
  }
  return list.sort((a, b) => a.schedule.at - b.schedule.at).slice(0, MAX);
}

function reminderNotifications(schedules, now) {
  const end = coverageEnd(schedules);
  if (!end) return [];
  const label = monthLabel(end.year, end.month);
  const next = end.month === 12 ? { year: end.year + 1, month: 1 } : { year: end.year, month: end.month + 1 };
  const reminders = [
    {
      id: REMINDER_ID_BASE + 1,
      title: 'Snart nytt bönetidsschema',
      body: `Schemat för ${label} tar slut om 3 dagar. Lägg in ${MONTHS_SV[next.month - 1]}s schema från moskén.`,
      schedule: { at: stockholmToDate(end.year, end.month, Math.max(1, end.day - 3), 12 * 60) },
    },
    {
      id: REMINDER_ID_BASE + 2,
      title: 'Bönetidsschemat har gått ut',
      body: `Inga fler bönenotiser skickas förrän du lägger in schemat för ${monthLabel(next.year, next.month)}.`,
      schedule: { at: stockholmToDate(next.year, next.month, 1, 9 * 60) },
    },
  ];
  return reminders.filter((r) => r.schedule.at > now).map((r) => ({ ...r, channelId: CHANNEL }));
}

export async function rescheduleAll(schedules, settings) {
  if (!isNative()) return { scheduled: 0, native: false };
  const perms = await ensurePermissions();
  if (!perms.display) return { scheduled: 0, native: true, denied: true };

  await LocalNotifications.createChannel({
    id: CHANNEL, name: 'Bönetider', description: 'Påminnelser om bönetider',
    importance: 5, visibility: 1, vibration: true,
  });

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }

  const now = new Date();
  const list = [
    ...prayerNotifications(schedules, settings, now),
    ...(settings.reminders ? reminderNotifications(schedules, now) : []),
  ];
  if (list.length) await LocalNotifications.schedule({ notifications: list });
  return { scheduled: list.length, native: true, exact: perms.exact, until: list.at(-1)?.schedule.at };
}

export async function testNotification() {
  if (!isNative()) return false;
  const perms = await ensurePermissions();
  if (!perms.display) return false;
  await LocalNotifications.createChannel({ id: CHANNEL, name: 'Bönetider', importance: 5, vibration: true });
  await LocalNotifications.schedule({
    notifications: [{
      id: REMINDER_ID_BASE + 9, title: 'Testnotis', body: 'Så här ser en bönenotis ut.',
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, channelId: CHANNEL,
    }],
  });
  return true;
}
