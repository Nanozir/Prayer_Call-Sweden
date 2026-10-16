// Shares a file: native share sheet in the app (Messages, WhatsApp, mail, Drive …),
// a plain download in a browser.
import { Capacitor } from '@capacitor/core';
import { buildIcs, icsFileName } from './ics.js';

export async function shareFile(name, text, mime, message) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, text: message, files: [uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function shareCalendar(sched, settings) {
  return shareFile(icsFileName(sched), buildIcs(sched, settings), 'text/calendar',
    'Öppna filen för att lägga in bönetiderna i kalendern.');
}
