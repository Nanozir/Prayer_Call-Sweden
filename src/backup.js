// Backup of schedules and settings as a small JSON file, e.g. to move to a new
// phone or to the Google Play version of the app. Imports are validated strictly.
import { daysInMonth, monthKey } from './time.js';
import { DEFAULT_SETTINGS, cleanBefore } from './store.js';

const KIND = 'salah-kalender-backup';

export function buildBackup(schedules, settings, appVersion, now = new Date()) {
  const real = Object.fromEntries(Object.entries(schedules).filter(([, s]) => !s.estimated));
  return JSON.stringify({ kind: KIND, format: 1, appVersion, exportedAt: now.toISOString(), schedules: real, settings }, null, 1);
}

export const backupFileName = (now = new Date()) =>
  `salah-kalender-sakerhetskopia-${now.toISOString().slice(0, 10)}.json`;

const isTime = (v) => v === null || (Number.isInteger(v) && v >= 0 && v < 1440 + 180);

function cleanSchedule(s) {
  if (!s || typeof s !== 'object') return null;
  const { year, month, days } = s;
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Array.isArray(days) || days.length !== daysInMonth(year, month)) return null;
  if (!days.every((row) => Array.isArray(row) && row.length === 6 && row.every(isTime))) return null;
  return {
    year, month, days: days.map((row) => [...row]), savedAt: typeof s.savedAt === 'string' ? s.savedAt : undefined,
    ...(s.source === 'islam.nu' ? { source: s.source } : {}),
  };
}

function cleanSettings(s) {
  if (!s || typeof s !== 'object') return null;
  const out = { ...DEFAULT_SETTINGS, enabled: { ...DEFAULT_SETTINGS.enabled } };
  for (const key of Object.keys(DEFAULT_SETTINGS.enabled)) {
    if (typeof s.enabled?.[key] === 'boolean') out.enabled[key] = s.enabled[key];
  }
  if ([0, 5, 10, 15, 20, 30].includes(s.offset)) out.offset = s.offset;
  out.before = cleanBefore(s.before, s.offset);
  if (['adhan', 'bells', 'chime', 'off'].includes(s.sound)) out.sound = s.sound;
  if (typeof s.reminders === 'boolean') out.reminders = s.reminders;
  if (typeof s.estimate === 'boolean') out.estimate = s.estimate;
  if (Number.isInteger(s.hijriOffset) && Math.abs(s.hijriOffset) <= 2) out.hijriOffset = s.hijriOffset;
  if (['list', 'board'].includes(s.view)) out.view = s.view;
  if (Array.isArray(s.iqamah) && s.iqamah.length === 5 && s.iqamah.every((m) => Number.isInteger(m) && m >= 0 && m <= 60)) out.iqamah = [...s.iqamah];
  if (s.jumua === null || (Number.isInteger(s.jumua) && s.jumua >= 600 && s.jumua < 900)) out.jumua = s.jumua;
  return out;
}

/** Parses and validates a backup. Throws an Error with a Swedish message if unusable. */
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Filen är inte en säkerhetskopia från Salah-kalender.'); }
  if (data?.kind !== KIND || data.format !== 1) throw new Error('Filen är inte en säkerhetskopia från Salah-kalender.');
  const schedules = {};
  let skipped = 0;
  for (const s of Object.values(data.schedules ?? {})) {
    const clean = cleanSchedule(s);
    if (clean) schedules[monthKey(clean.year, clean.month)] = clean; else skipped++;
  }
  return { schedules, settings: cleanSettings(data.settings), skipped, exportedAt: data.exportedAt };
}
