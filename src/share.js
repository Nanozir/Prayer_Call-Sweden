// Shares a calendar file: native share sheet in the app (Messages, WhatsApp,
// mail …), a plain download in a browser.
import { Capacitor } from '@capacitor/core';
import { buildIcs, icsFileName } from './ics.js';

export async function shareCalendar(sched, settings) {
  const text = buildIcs(sched, settings);
  const name = icsFileName(sched);
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Bönetider', text: 'Öppna filen för att lägga in bönetiderna i kalendern.', files: [uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
