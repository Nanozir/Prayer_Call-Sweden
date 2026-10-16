// Schedules local notifications from the stored schedules. Everything is rebuilt
// from scratch each time, so a deleted/replaced schedule never leaves stale alarms
// behind and nothing is scheduled past the last day the mosque's tables cover.

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PRAYERS, stockholmToDate, monthLabel, MONTHS_SV } from './time.js';
import { coverageEnd, scheduleStatus } from './store.js';
import { withEstimates } from './estimate.js';

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

export function prayerNotifications(schedules, settings, now) {
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
        const base = (sched.year * 10000 + sched.month * 100 + d + 1) * 10 + p;
        // Always notify at the prayer time itself, so a reminder is never mistaken for it.
        const note = sched.estimated ? ' – beräknad tid, kan avvika' : ' (Karlstads moské)';
        list.push({
          id: base * 2,
          title: `Det är dags för ${prayer.name}${sched.estimated ? ' (beräknad)' : ''}`,
          body: `${prayer.name} ${hhmm}${note}`,
          schedule: { at: time, allowWhileIdle: true },
          channelId: prayerChannel(settings.sound),
        });
        const before = new Date(time.getTime() - settings.offset * 60_000);
        if (settings.offset && before > now) {
          list.push({
            id: base * 2 + 1,
            title: `Påminnelse: ${prayer.name} om ${settings.offset} min`,
            body: `Inte bönetid än – ${prayer.name} är ${hhmm}.`,
            schedule: { at: before, allowWhileIdle: true },
            channelId: beforeChannel(settings.sound),
          });
        }
      });
    });
  }
  // Leave room for the two schedule reminders (iOS caps pending notifications at 64).
  return list.sort((a, b) => a.schedule.at - b.schedule.at).slice(0, MAX - 2);
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

export async function rescheduleAll(schedules, settings) {
  if (!isNative()) return { scheduled: 0, native: false };
  const perms = await ensurePermissions();
  if (!perms.display) return { scheduled: 0, native: true, denied: true };

  await ensureChannels();

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }

  const now = new Date();
  const prayers = prayerNotifications(withEstimates(schedules, settings), settings, now);
  const list = [...prayers, ...(settings.reminders ? reminderNotifications(schedules, now, settings) : [])];
  if (list.length) await LocalNotifications.schedule({ notifications: list });
  return { scheduled: list.length, native: true, exact: perms.exact, until: prayers.at(-1)?.schedule.at };
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

/** Facts for the "Fungerar notiserna?" check in Settings. */
export async function notificationFacts() {
  if (!isNative()) return { native: false };
  const platform = Capacitor.getPlatform();
  const perm = await LocalNotifications.checkPermissions();
  let exact = null;
  if (platform === 'android') {
    try { exact = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted'; } catch { exact = null; }
  }
  const pending = (await LocalNotifications.getPending()).notifications;
  // Last *prayer* notification – schedule reminders (ids from REMINDER_ID_BASE) are not prayers.
  const times = pending.filter((n) => n.id < REMINDER_ID_BASE)
    .map((n) => new Date(n.schedule?.at ?? 0).getTime()).filter((t) => t > 0).sort((a, b) => a - b);
  return {
    native: true,
    platform,
    display: perm.display === 'granted',
    exact,
    pending: pending.length,
    limit: platform === 'ios' ? 64 : 500,
    last: times.length ? new Date(times[times.length - 1]) : null,
  };
}
