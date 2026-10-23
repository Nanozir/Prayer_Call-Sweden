// Persistent storage for schedules and settings (Capacitor Preferences,
// falls back to localStorage in a normal browser).

import { Preferences } from '@capacitor/preferences';
import { monthKey, nowInStockholm, daysInMonth, PRAYERS } from './time.js';

const SCHEDULES = 'schedules';
const SETTINGS = 'settings';

export const DEFAULT_SETTINGS = {
  enabled: { fajr: true, shuruk: false, dhohr: true, asr: true, magrib: true, isha: true },
  offset: 0, // extra reminder this many minutes before the prayer time (0 = none)
  sound: 'chime', // 'bells' | 'chime' | 'off' – sound at the prayer time
  reminders: true, // remind when a schedule is about to run out
  estimate: false, // emergency mode: calculate times when no mosque schedule exists
  hijriOffset: 0, // days to shift the Umm al-Qura Hijri date (local moon sighting)
  view: 'list', // 'list' | 'board' – how Idag shows the day (board = like the mosque's screen)
  iqamah: [10, 10, 10, 5, 0], // minutes from adhan to iqamah: Fajr, Dhohr, Asr, Maghrib, Isha
  jumua: null, // Friday prayer time in minutes, shown on the board (null = hidden)
};

async function getJson(key, fallback) {
  const { value } = await Preferences.get({ key });
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export async function loadSchedules() {
  return getJson(SCHEDULES, {});
}

export async function saveSchedule(sched) {
  const all = await loadSchedules();
  all[monthKey(sched.year, sched.month)] = sched;
  await Preferences.set({ key: SCHEDULES, value: JSON.stringify(all) });
  return all;
}

export async function deleteSchedule(key) {
  const all = await loadSchedules();
  delete all[key];
  await Preferences.set({ key: SCHEDULES, value: JSON.stringify(all) });
  return all;
}

export async function loadSettings() {
  const s = await getJson(SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...s, enabled: { ...DEFAULT_SETTINGS.enabled, ...(s.enabled ?? {}) } };
}

export async function saveSettings(settings) {
  await Preferences.set({ key: SETTINGS, value: JSON.stringify(settings) });
}

// 'expired' | 'current' | 'upcoming' relative to today in Stockholm.
export function scheduleStatus(sched, today = nowInStockholm()) {
  const a = sched.year * 12 + sched.month, b = today.year * 12 + today.month;
  return a < b ? 'expired' : a === b ? 'current' : 'upcoming';
}

export function todaysTimes(all, today = nowInStockholm()) {
  const s = all[monthKey(today.year, today.month)];
  return s?.days[today.day - 1] ?? null;
}

// Last day (as {year, month, day}) covered without gaps starting from today,
// or null when today is not covered.
export function coverageEnd(all, today = nowInStockholm()) {
  let { year, month } = today;
  if (!all[monthKey(year, month)]) return null;
  while (all[monthKey(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)]) {
    if (month === 12) { year++; month = 1; } else month++;
  }
  return { year, month, day: Math.min(all[monthKey(year, month)].days.length, daysInMonth(year, month)) };
}

export function nextPrayer(all, today = nowInStockholm()) {
  const row = todaysTimes(all, today);
  if (!row) return null;
  for (let i = 0; i < 6; i++) {
    if (row[i] != null && row[i] > today.minutes) return { index: i, prayer: PRAYERS[i], minutes: row[i] };
  }
  return null;
}
