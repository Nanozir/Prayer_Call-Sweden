// Islamic (Hijri) date via the phone's built-in calendar support – no library,
// works offline. Umm al-Qura is a calculated calendar; local moon sighting can
// differ by a day, so the user can shift it with settings.hijriOffset (-2…+2).

export function hijriDate({ year, month, day }, offset = 0) {
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('sv-SE-u-ca-islamic-umalqura', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  } catch {
    return null;
  }
  if (fmt.resolvedOptions().calendar !== 'islamic-umalqura') return null; // not supported here
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(Date.UTC(year, month - 1, day + offset, 12))).map((p) => [p.type, p.value]),
  );
  if (!parts.day || !parts.month || !parts.year) return null;
  const monthName = parts.month.charAt(0).toUpperCase() + parts.month.slice(1);
  return `${parts.day} ${monthName} ${parts.year}`;
}
