// Schedules local notifications from the stored schedules. Everything is rebuilt
// from scratch each time, so a deleted/replaced schedule never leaves stale alarms
// behind and nothing is scheduled past the last day the mosque's tables cover.

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PRAYERS, stockholmToDate, monthLabel, MONTHS_SV, notificationId } from './time.js';
import { coverageEnd, scheduleStatus, REMINDER_MINUTES } from './store.js';
import { withEstimates } from './estimate.js';
import { updateWidget, setAlarms, cancelAlarms, alarmStatus } from './native.js';
import { alarmTimes } from './alarm.js';

// Android ties sound to the notification channel (fixed once created), so each
// sound choice gets its own channel. Sound files live in android/.../res/raw.
const CHANNELS = {
  prayer_adhan: { name: 'Bönetid – böneutrop', sound: 'salah_adhan.ogg' },
  prayer_bells: { name: 'Bönetid – klockspel', sound: 'salah_bells.wav' },
  prayer_chime: { name: 'Bönetid – kort ljud', sound: 'salah_chime.wav' },
  prayer_silent: { name: 'Bönetid – utan ljud', sound: 'salah_silent.wav' },
  before_chime: { name: 'Påminnelse innan bön – kort ljud', sound: 'salah_chime.wav' },
  before_silent: { name: 'Påminnelse innan bön – utan ljud', sound: 'salah_silent.wav' },
  schedule_info: { name: 'Schemapåminnelser', sound: 'salah_chime.wav' },
};
const OLD_CHANNELS = ['salah'];
// Android allows max 500 alarms per app, iOS 64 pending notifications.
const MAX = Capacitor.getPlatform() === 'ios' ? 60 : 400;
const REMINDER_ID_BASE = 2_000_000_000;

export const SOUND_OPTIONS = [
  { value: 'adhan', label: 'Böneutrop (ca 15 s)', file: 'salah_adhan.ogg' },
  { value: 'bells', label: 'Klockspel (ca 5 s)', file: 'salah_bells.wav' },
  { value: 'chime', label: 'Kort ljud (ca 2 s)', file: 'salah_chime.wav' },
  { value: 'off', label: 'Inget ljud (bara vibration)', file: null },
];

const PRAYER_CHANNEL = { adhan: 'prayer_adhan', bells: 'prayer_bells', chime: 'prayer_chime', off: 'prayer_silent' };
const prayerChannel = (sound) => PRAYER_CHANNEL[sound] ?? 'prayer_chime';
const beforeChannel = (sound) => (sound === 'off' ? 'before_silent' : 'before_chime');

async function ensureChannels() {
  for (const id of OLD_CHANNELS) {
    try { await LocalNotifications.deleteChannel({ id }); } catch { /* not there */ }
  }
  for (const [id, c] of Object.entries(CHANNELS)) {
    await LocalNotifications.createChannel({
      id, name: c.name, sound: c.sound, importance: 5, visibility: 1, vibration: true,
    });
  }
}

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

// Ids: see notificationId in time.js (slot 0 = on time, 1..7 = reminders, 8 = alarm).
export { notificationId };

export function prayerNotifications(schedules, settings, now, reserve = 0) {
  const list = [];
  for (const sched of Object.values(schedules)) {
    if (scheduleStatus(sched) === 'expired') continue;
    sched.days.forEach((row, d) => {
      row.forEach((minutes, p) => {
        const prayer = PRAYERS[p];
        if (minutes == null || !settings.enabled[prayer.key]) return;
        const time = stockholmToDate(sched.year, sched.month, d + 1, minutes);
        if (time <= now) return;
        const hhmm = time.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
        const idAt = (slot) => notificationId(sched.year, sched.month, d + 1, p, slot);
        // Always notify at the prayer time itself, so a reminder is never mistaken for it.
        const note = sched.estimated ? ' – beräknad tid, kan avvika' : ' (Karlstads moské)';
        list.push({
          id: idAt(0),
          title: `Det är dags för ${prayer.name}${sched.estimated ? ' (beräknad)' : ''}`,
          body: `${prayer.name} ${hhmm}${note}`,
          schedule: { at: time, allowWhileIdle: true },
          channelId: prayerChannel(settings.sound),
        });
        for (const m of settings.before?.[prayer.key] ?? []) {
          const i = REMINDER_MINUTES.indexOf(m);
          const at = new Date(time.getTime() - m * 60_000);
          if (i < 0 || at <= now) continue;
          list.push({
            id: idAt(i + 1),
            title: `Påminnelse: ${prayer.name} om ${m} min`,
            body: `Inte bönetid än – ${prayer.name} är ${hhmm}.`,
            schedule: { at, allowWhileIdle: true },
            channelId: beforeChannel(settings.sound),
          });
        }
      });
    });
  }
  // Leave room for the two schedule reminders (iOS caps pending notifications at 64).
  return list.sort((a, b) => a.schedule.at - b.schedule.at).slice(0, MAX - 2 - reserve);
}

function reminderNotifications(schedules, now, settings = {}) {
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
      body: settings.estimate
        ? `Beräknade tider används nu (kan avvika). Lägg in moskéns schema för ${monthLabel(next.year, next.month)}.`
        : `Inga fler bönenotiser skickas förrän du lägger in schemat för ${monthLabel(next.year, next.month)}.`,
      schedule: { at: stockholmToDate(next.year, next.month, 1, 9 * 60) },
    },
  ];
  return reminders.filter((r) => r.schedule.at > now).map((r) => ({ ...r, channelId: 'schedule_info' }));
}

// Android: real alarm clocks (AlarmManager.setAlarmClock, rings until dismissed).
// iPhone: no such thing before iOS 26, so a notification with sound at the alarm time.
const ANDROID_ALARMS = 14;
const IOS_ALARMS = 8;

function iosAlarmNotifications(alarms) {
  return alarms.map((a) => ({
    id: a.id, title: a.title, body: a.body, schedule: { at: new Date(a.at), allowWhileIdle: true }, sound: 'salah_adhan.wav',
  }));
}

export async function rescheduleAll(schedules, settings) {
  if (!isNative()) return { scheduled: 0, native: false };
  const android = Capacitor.getPlatform() === 'android';
  const now = new Date();
  const effective = withEstimates(schedules, settings);
  const alarms = alarmTimes(effective, settings, now, android ? ANDROID_ALARMS : IOS_ALARMS);
  // Alarms need no notification permission to ring, so set them before checking it.
  if (android) await (alarms.length ? setAlarms(alarms) : cancelAlarms());

  const perms = await ensurePermissions();
  if (!perms.display) return { scheduled: 0, native: true, denied: true, alarms: alarms.length };

  await ensureChannels();

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }

  await updateWidget({ prayers: widgetPrayers(effective, now) });
  const iosAlarms = android ? [] : iosAlarmNotifications(alarms);
  const prayers = prayerNotifications(effective, settings, now, iosAlarms.length);
  const list = [...prayers, ...iosAlarms, ...(settings.reminders ? reminderNotifications(schedules, now, settings) : [])];
  if (list.length) await LocalNotifications.schedule({ notifications: list });
  return { scheduled: list.length, native: true, exact: perms.exact, alarms: alarms.length, until: prayers.at(-1)?.schedule.at };
}

export async function testNotification(settings) {
  if (!isNative()) return false;
  const perms = await ensurePermissions();
  if (!perms.display) return false;
  await ensureChannels();
  await LocalNotifications.schedule({
    notifications: [{
      id: REMINDER_ID_BASE + 9, title: 'Testnotis', body: 'Så här låter och ser en bönenotis ut.',
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, channelId: prayerChannel(settings.sound),
    }],
  });
  return true;
}

/**
 * The coming prayers (Shuruk is sunrise, not a prayer) for the home-screen widget,
 * from now and the next few days. Real and estimated schedules; estimated ones are marked.
 */
export function widgetPrayers(schedules, now = new Date(), days = 14) {
  const out = [];
  const limit = now.getTime() + days * 864e5;
  for (const sched of Object.values(schedules)) {
    sched.days.forEach((row, d) => {
      row.forEach((minutes, p) => {
        if (minutes == null || PRAYERS[p].key === 'shuruk') return;
        const at = stockholmToDate(sched.year, sched.month, d + 1, minutes).getTime();
        if (at <= now.getTime() || at > limit) return;
        out.push({
          name: PRAYERS[p].name,
          at,
          time: new Date(at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }),
          estimated: !!sched.estimated,
        });
      });
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Facts for the "Fungerar notiserna?" check in Settings. */
export async function notificationFacts() {
  if (!isNative()) return { native: false };
  const platform = Capacitor.getPlatform();
  const perm = await LocalNotifications.checkPermissions();
  let exact = null;
  if (platform === 'android') {
    try { exact = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted'; } catch { exact = null; }
  }
  const alarm = platform === 'android' ? await alarmStatus() : null;
  const pending = (await LocalNotifications.getPending()).notifications;
  // Last *prayer* notification – schedule reminders (ids from REMINDER_ID_BASE) are not prayers.
  const times = pending.filter((n) => n.id < REMINDER_ID_BASE)
    .map((n) => new Date(n.schedule?.at ?? 0).getTime()).filter((t) => t > 0).sort((a, b) => a - b);
  return {
    native: true,
    platform,
    display: perm.display === 'granted',
    exact,
    alarm,
    pending: pending.length,
    limit: platform === 'ios' ? 64 : 500,
    last: times.length ? new Date(times[times.length - 1]) : null,
  };
}
