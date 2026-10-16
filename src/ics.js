// Exports a month's prayer times as an iCalendar (.ics) file. Opening it on an
// iPhone (or any phone/computer) adds every prayer as a calendar event with an
// alert at the prayer time – works offline, without installing this app.

import { PRAYERS, stockholmToDate, monthLabel, fmt } from './time.js';

const pad = (n) => String(n).padStart(2, '0');
const utc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
export const escapeText = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

// RFC 5545: lines longer than 75 octets are folded with CRLF + space.
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; }
    cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export function buildIcs(sched, settings, now = new Date()) {
  const label = monthLabel(sched.year, sched.month);
  const est = sched.estimated ? ' (beräknad)' : '';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Salah-kalender//SV', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:Bönetider ${label}`, 'X-WR-TIMEZONE:Europe/Stockholm',
  ];
  sched.days.forEach((row, d) => {
    row.forEach((minutes, p) => {
      const prayer = PRAYERS[p];
      if (minutes == null || !settings.enabled[prayer.key]) return;
      const start = stockholmToDate(sched.year, sched.month, d + 1, minutes);
      lines.push(
        'BEGIN:VEVENT',
        `UID:${sched.year}-${pad(sched.month)}-${pad(d + 1)}-${prayer.key}@salah-kalender`,
        `DTSTAMP:${utc(now)}`,
        `DTSTART:${utc(start)}`,
        'DURATION:PT10M',
        `SUMMARY:${escapeText(`${prayer.name} ${fmt(minutes)}${est}`)}`,
        `DESCRIPTION:${escapeText(sched.estimated ? 'Beräknad tid – kan avvika från moskéns schema.' : 'Karlstads moské')}`,
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(`Det är dags för ${prayer.name}`)}`, 'TRIGGER:PT0M', 'END:VALARM',
      );
      if (settings.offset) {
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY',
          `DESCRIPTION:${escapeText(`Påminnelse: ${prayer.name} om ${settings.offset} min`)}`,
          `TRIGGER:-PT${settings.offset}M`, 'END:VALARM');
      }
      lines.push('END:VEVENT');
    });
  });
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export const icsFileName = (sched) => `bonetider-${sched.year}-${pad(sched.month)}.ics`;
