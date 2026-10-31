// Windows desktop app (Electron): notifications and alarms go through the bridge
// window.salahDesktop, which only exists inside that app. Without it every call is a no-op.
import { Capacitor } from '@capacitor/core';

const bridge = () => (typeof window !== 'undefined' && window.salahDesktop?.isDesktop ? window.salahDesktop : null);

export const isDesktop = () => !!bridge();

/** 'desktop' | 'android' | 'ios' | 'web' */
export const platform = () => (isDesktop() ? 'desktop' : Capacitor.getPlatform());

export const desktopVersion = () => bridge()?.version ?? null;
export const desktopSchedule = async (items) => (await bridge()?.schedule(items)) ?? { scheduled: 0 };
export const desktopCancelAll = async () => { await bridge()?.cancelAll(); };
export const desktopTest = async () => { await bridge()?.testNotification(); return !!bridge(); };
export const getAutoStart = async () => { try { return !!(await bridge()?.getAutoStart()); } catch { return false; } };
export const setAutoStart = async (on) => { await bridge()?.setAutoStart(on); };

const SLOT_ON_TIME = 0;

/**
 * Maps the app's notifications and alarms to bridge items, earliest first.
 * `prayers` = prayerNotifications() (slot 0 of the id is on time, 1..7 reminders),
 * `reminders` = schedule-expiry notices, `alarms` = alarmTimes(). Only the next `days` days, at most `max` items.
 */
export function desktopItems({ prayers = [], reminders = [], alarms = [] }, settings, now = new Date(), { max = 500, days = 60 } = {}) {
  const limit = now.getTime() + days * 864e5;
  const sound = settings?.sound ?? 'chime';
  const quiet = sound === 'off' ? 'off' : 'chime';
  const items = [
    ...prayers.map((n) => ({
      id: n.id, at: +n.schedule.at, title: n.title, body: n.body,
      ...(n.id % 16 === SLOT_ON_TIME ? { kind: 'prayer', sound } : { kind: 'before', sound: quiet }),
    })),
    ...reminders.map((n) => ({ id: n.id, at: +n.schedule.at, kind: 'info', title: n.title, body: n.body, sound: quiet })),
    ...alarms.map((a) => ({ id: a.id, at: a.at, kind: 'alarm', title: a.title, body: a.body, sound: 'adhan' })),
  ];
  return items
    .filter((i) => i.at > now.getTime() && i.at <= limit)
    .sort((a, b) => a.at - b.at)
    .slice(0, max)
    .map(({ id, at, kind, title, body, sound: s }) => ({ id, at, kind, title, body, sound: s }));
}
