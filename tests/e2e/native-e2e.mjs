// Runs the app as if on Android / iPhone (see native-mock.js) and checks the
// native code paths: notification scheduling and the "Fungerar notiserna?" check.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { writeFile as writeFs, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const fx = JSON.parse(await readFile('tests/fixtures/karlstad-oktober-2026.json', 'utf8'));
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const october = { year: 2026, month: 10, days: fx.truth.map((r) => r.map(toMin)) };
const mockSrc = await readFile('tests/e2e/native-mock.js', 'utf8');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const path = join('dist', decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  let body;
  try { body = await readFile(path); } catch { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
  res.end(body);
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failed = false;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failed = true; };

async function open(config, width = 400) {
  const page = await browser.newPage({ viewport: { width, height: width > 400 ? 800 : 900 } });
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failed = true; });
  await page.addInitScript(() => {
    const fixed = new Date('2026-10-08T06:13:00Z').getTime();
    const RealDate = Date;
    globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  });
  await page.addInitScript((c) => { window.__mockConfig = c; }, config);
  await page.addInitScript(mockSrc);
  await page.goto(url);
  await page.waitForFunction(() => ['LocalNotifications.schedule', 'LocalNotifications.getPending', 'salahDesktop.schedule'].some((c) => window.__mock.calls.includes(c)));
  await page.waitForTimeout(300);
  return page;
}

const storage = { schedules: JSON.stringify({ '2026-10': october }), settings: JSON.stringify({ before: { fajr: [10], dhohr: [10, 5], asr: [10], magrib: [10], isha: [10] }, sound: 'adhan' }) };

// --- Android: exact alarms off, battery optimised (OnePlus) ---------------------
{
  const page = await open({ platform: 'android', exact: 'denied', battery: { unrestricted: false, manufacturer: 'OnePlus' }, storage });
  const pending = await page.evaluate(() => window.__mock.pending);
  const now = new Date('2026-10-08T06:13:00Z').getTime();
  check(pending.length > 0 && pending.length <= 400, `Android: ${pending.length} notiser schemalagda (max 400)`);
  check(new Set(pending.map((n) => n.id)).size === pending.length, 'Android: alla notis-ID är unika');
  check(pending.every((n) => new Date(n.schedule.at).getTime() > now), 'Android: inga notiser bakåt i tiden');
  const asr = pending.filter((n) => /Asr/.test(n.title) && new Date(n.schedule.at).toISOString().startsWith('2026-10-08'));
  check(asr.length === 2 && asr.some((n) => /Påminnelse/.test(n.title)) && asr.some((n) => /Det är dags/.test(n.title)),
    'Android: Asr idag har både påminnelse (10 min innan) och notis vid bönetiden');
  const atTime = asr.find((n) => /Det är dags/.test(n.title));
  check(new Date(atTime.schedule.at).toISOString() === '2026-10-08T13:33:00.000Z', 'Android: Asr 15:33 svensk tid = 13:33 UTC');
  check(atTime.channelId === 'prayer_adhan', 'Android: böneutrop-kanal används');
  const widget = await page.evaluate(() => window.__mock.widget);
  check(widget?.prayers?.[0]?.name === 'Dhohr' && widget.prayers[0].time === '12:54',
    `Android: widgeten får nästa bön (${widget?.prayers?.[0]?.name} ${widget?.prayers?.[0]?.time})`);

  await page.click('nav button[data-view=settings]');
  await page.waitForSelector('.health li');
  const rows = await page.$$eval('.health li', (lis) => lis.map((li) => [li.className, li.textContent.replace(/\s+/g, ' ').trim()]));
  check(rows.length === 5, `Android: kontrollen visar ${rows.length} punkter`);
  check(rows.filter(([c]) => c === 'bad').length === 2, 'Android: exakta alarm och batteri markeras som problem');
  check(rows.some(([, t]) => /OnePlus/.test(t)), 'Android: tillverkarspecifikt tips för OnePlus');
  check(rows.some(([, t]) => /till och med 31 oktober/.test(t)), 'Android: sista bönenotis 31 oktober (schemapåminnelser räknas inte)');
  await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/health-android.png` : '/dev/null' }).catch(() => {});
  await page.click('.health li.bad button >> nth=1'); // battery settings
  await page.waitForTimeout(1200);
  const batteryOk = await page.$$eval('.health li', (lis) => lis.filter((li) => li.className === 'ok').length);
  check(batteryOk === 4, 'Android: efter knappen till batteriinställningar visas batteriet som OK');
  await page.close();
}

// --- iPhone: only 64 pending allowed -------------------------------------------
{
  const page = await open({ platform: 'ios', storage });
  const pending = await page.evaluate(() => window.__mock.pending);
  check(pending.length <= 64 && pending.length >= 50, `iPhone: ${pending.length} notiser (max 64)`);
  await page.click('nav button[data-view=settings]');
  await page.waitForSelector('.health li');
  const text = await page.$eval('.health', (e) => e.textContent);
  check(/av 64 notiser inlagda/.test(text), 'iPhone: visar hur många av 64 som används');
  check(!/batteri/i.test(text), 'iPhone: inga Android-specifika punkter');
  await page.close();
}

// --- Alarm clock: switch on Fajr 15 min before, Android gets real alarms ----------
{
  const page = await open({ platform: 'android', alarm: { canScheduleExact: false, canFullScreen: false }, storage });
  check((await page.evaluate(() => window.__mock.alarms?.length ?? 0)) === 0, 'Alarm: inga alarm innan något slagits på');
  await page.click('nav button[data-view=settings]');
  await page.waitForSelector('.alarm-row');
  await page.check('.alarm-row:first-child input'); // Fajr
  await page.waitForFunction(() => window.__mock.alarms?.length > 0);
  await page.waitForSelector('.alarm-row select');
  const alarms = await page.evaluate(() => window.__mock.alarms);
  const fajr9 = Date.UTC(2026, 9, 9) + (october.days[8][0] - 120 - 15) * 60_000; // 9 Oct is UTC+2
  check(alarms.length === 14, `Alarm: ${alarms.length} alarm inlagda (max 14)`);
  check(alarms[0].at === fajr9, `Alarm: första alarmet 15 min före Fajr (${new Date(alarms[0].at).toISOString()})`);
  check(new Set(alarms.map((a) => a.id)).size === 14 && alarms.every((a) => a.title && a.body), 'Alarm: unika ID och text');
  const next = await page.$eval('.alarm-next', (e) => e.textContent);
  check(/^Nästa alarm: fre \d\d:\d\d$/.test(next), `Alarm: ${next}`);
  check((await page.$$('.alarm-warn .warn-text')).length === 2, 'Alarm: varning när exakta alarm och låsskärm saknas');
  await page.waitForSelector('.health li.bad >> text=Alarm');
  await page.selectOption('.alarm-row:first-child select', '0');
  await page.waitForFunction((t) => window.__mock.alarms?.[0]?.at === t, fajr9 + 15 * 60_000);
  check(true, 'Alarm: 0 min innan ger alarm vid bönetiden');
  await page.click('.alarm-warn .warn-text button >> nth=0');
  await page.waitForTimeout(1200);
  check((await page.$$('.alarm-warn .warn-text')).length === 1, 'Alarm: varningen försvinner efter att tillståndet getts');
  await page.uncheck('.alarm-row:first-child input');
  await page.waitForFunction(() => window.__mock.alarms.length === 0);
  check(true, 'Alarm: avstängt alarm avbokas');
  await page.close();
}
{
  const page = await open({ platform: 'ios', storage: { ...storage, settings: JSON.stringify({ alarms: { fajr: { on: true, before: 15 } } }) } });
  const pending = await page.evaluate(() => window.__mock.pending);
  const al = pending.filter((n) => n.id % 16 === 8);
  check(al.length === 8 && pending.length <= 64, `iPhone: alarm blir ${al.length} notiser, totalt ${pending.length} (max 64)`);
  check(new Date(al[0].schedule.at).getTime() === Date.UTC(2026, 9, 9) + (october.days[8][0] - 135) * 60_000, 'iPhone: alarmnotis 15 min före Fajr');
  check((await page.evaluate(() => window.__mock.alarms)) === undefined, 'iPhone: inga Android-alarm');
  await page.click('nav button[data-view=settings]');
  check(/riktiga alarm kräver iOS 26/.test(await page.$eval('.alarm-note', (e) => e.textContent)), 'iPhone: not om alarm i inställningarna');
  await page.close();
}

// --- Windows desktop app: bridge instead of Capacitor ------------------------------
{
  const page = await open({ platform: 'desktop', storage }, 1280);
  const items = await page.evaluate(() => window.__mock.items);
  const now = new Date('2026-10-08T06:13:00Z').getTime();
  check(items.length > 0 && items.length <= 500, `Desktop: ${items.length} poster skickade till bryggan`);
  check(new Set(items.map((i) => i.id)).size === items.length && items.every((i) => i.at > now), 'Desktop: unika ID, inget bakåt i tiden');
  check(items.every((i, k) => k === 0 || items[k - 1].at <= i.at), 'Desktop: sorterade i tidsordning');
  const asr = items.find((i) => i.kind === 'prayer' && /Asr/.test(i.title));
  check(asr && asr.at === Date.UTC(2026, 9, 8, 13, 33) && asr.sound === 'adhan', 'Desktop: Asr-notis vid 15:33 svensk tid med böneutrop');
  check(items.some((i) => i.kind === 'before' && /Påminnelse/.test(i.title)), 'Desktop: påminnelser (before) finns');
  check(items.some((i) => i.kind === 'info'), 'Desktop: schemapåminnelse (info) finns');
  check(items.every((i) => i.kind !== 'alarm'), 'Desktop: inga alarm innan något slagits på');
  check(await page.$eval('#app', () => !/webbversionen/.test(document.body.textContent)), 'Desktop: ingen "webbversionen"-banner');
  await page.click('nav button[data-view=settings]');
  await page.waitForSelector('.health li');
  const health = await page.$eval('.health', (e) => e.textContent);
  check(!/batteri|exakta/i.test(health) && /notiser inlagda/.test(health), 'Desktop: kontrollen visar inga Android-problem');
  check((await page.$('[data-a=exact]')) === null, 'Desktop: knappen "Exakta alarm" är dold');
  const settingsText = await page.$eval('#app', (e) => e.textContent);
  check(/systemfältet/.test(settingsText), 'Desktop: not om systemfältet');
  await page.click('[data-a=test]');
  await page.waitForFunction(() => window.__mock.tests === 1);
  check(true, 'Desktop: testnotis anropar bryggan');
  await page.waitForFunction(() => !document.querySelector('[data-f=autostart]').disabled);
  await page.check('[data-f=autostart]');
  await page.waitForFunction(() => window.__mock.autoStart === true);
  check(true, 'Desktop: "Starta med Windows" anropar setAutoStart');
  await page.check('.alarm-row:first-child input');
  await page.waitForFunction(() => window.__mock.items.some((i) => i.kind === 'alarm'));
  const alarms = (await page.evaluate(() => window.__mock.items)).filter((i) => i.kind === 'alarm');
  const fajr9 = Date.UTC(2026, 9, 9) + (october.days[8][0] - 120 - 15) * 60_000;
  check(alarms[0].at === fajr9 && alarms[0].sound === 'adhan', `Desktop: Fajr-alarm 15 min före Fajr (${new Date(alarms[0].at).toISOString()})`);
  check(!/iPhone|iOS/.test(await page.$eval('.alarm-note', (e) => e.textContent)), 'Desktop: alarmkortet utan iOS-text');
  // Wide layout + keyboard
  await page.click('nav button[data-view=home]');
  const before = await page.$eval('.nav-day', (e) => e.textContent);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((b) => document.querySelector('.nav-day').textContent !== b, before);
  check(true, 'Desktop: högerpil byter dag');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((b) => document.querySelector('.nav-day').textContent === b, before);
  const w = await page.$eval('main', (e) => e.getBoundingClientRect().width);
  check(w <= 640, `Desktop: centrerad kolumn (${Math.round(w)} px)`);
  if (process.env.WIDE_SHOT) {
    await page.waitForTimeout(800);
    await page.screenshot({ path: process.env.WIDE_SHOT });
    await page.click('[data-a=month]');
    await page.waitForSelector('.month');
    await page.screenshot({ path: process.env.WIDE_SHOT.replace('.png', '-month.png') });
    await page.click('nav button[data-view=home]');
    await page.click('[data-v=board]');
    await page.screenshot({ path: process.env.WIDE_SHOT.replace('.png', '-board.png') });
  }
  await page.close();
}
{
  const page = await open({ platform: 'desktop', storage: { schedules: storage.schedules, settings: JSON.stringify({ sound: 'off', before: { fajr: [10] } }) } }, 1280);
  const items = await page.evaluate(() => window.__mock.items);
  check(items.filter((i) => i.kind === 'prayer').every((i) => i.sound === 'off'), 'Desktop: "inget ljud" ger sound off');
  await page.close();
}

// --- Backup: export on one phone, import on a fresh install ----------------------
let backupText;
{
  const page = await open({ platform: 'android', storage });
  await page.click('nav button[data-view=settings]');
  page.once('dialog', (d) => d.accept());
  await page.click('[data-a=export]');
  await page.waitForFunction(() => Object.keys(window.__mock.files || {}).some((f) => f.endsWith('.json')));
  backupText = await page.evaluate(() => Object.entries(window.__mock.files).find(([f]) => f.endsWith('.json'))[1]);
  check(/"2026-10"/.test(backupText) && /"sound": "adhan"/.test(backupText), 'Säkerhetskopia: exporten innehåller schema och inställningar');
  await page.close();
}
{
  const page = await open({ platform: 'android', storage: {} });
  const dir = await mkdtemp(join(tmpdir(), 'salah-'));
  const file = join(dir, 'backup.json');
  await writeFs(file, backupText);
  await page.click('nav button[data-view=settings]');
  page.once('dialog', (d) => d.accept());
  await page.setInputFiles('[data-f=import]', file);
  await page.waitForFunction(() => /Importerat/.test(document.querySelector('.backup-msg')?.textContent ?? ''));
  const pending = await page.evaluate(() => window.__mock.pending.length);
  check(pending === 264, `Säkerhetskopia: efter import på ny telefon är notiserna tillbaka (${pending})`);
  await page.click('nav button[data-view=home]');
  const fajr = await page.$eval('.prayer .p-time', (e) => e.textContent);
  check(fajr === '05:11', 'Säkerhetskopia: dagens tider visas efter import');
  await page.close();
}

// --- Qibla compass with simulated sensor readings ------------------------------
{
  const page = await open({ platform: 'android', storage });
  await page.click('nav button[data-view=qibla]');
  const facts = await page.$eval('.qibla-facts', (e) => e.textContent);
  check(/142°.*sydost.*4\s?707 km/.test(facts), `Qibla: ${facts.trim()}`);
  await page.click('[data-a=start]');
  const turn = (alpha) => page.evaluate((a) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: a, beta: 0, gamma: 0, absolute: true })), alpha);
  await turn(360 - 355); // magnetic 355° + 5° declination = facing true north
  let status = await page.$eval('.compass-status', (e) => e.textContent);
  check(/Vrid dig 142° åt höger/.test(status), `Qibla: mot norr → "${status}"`);
  await turn(360 - 137); // magnetic 137 + 5 = 142 true → aligned
  status = await page.$eval('.compass-status', (e) => e.textContent);
  const aligned = await page.$eval('.qibla', (e) => e.classList.contains('aligned'));
  check(aligned && /vänd mot Qibla/.test(status), `Qibla: mot 142° → "${status}"`);
  await page.waitForTimeout(400);
  const rot = await page.$eval('.dial', (e) => e.style.transform);
  check(rot === 'rotate(-142deg)', `Qibla: ratten vriden så att Kaba pekar uppåt (${rot})`);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/qibla.png` });
  await turn(360 - 350); // 355° true
  const before = await page.$eval('.dial', (e) => e.style.transform);
  await turn(360 - 10); // 15° true – passing north
  const after = await page.$eval('.dial', (e) => e.style.transform);
  check(before === 'rotate(5deg)' && after === 'rotate(-15deg)', `Qibla: passerar norr med 20°, inte ett helt varv (${before} → ${after})`);
  await page.close();
}
{
  const page = await open({ platform: 'android', storage });
  await page.click('nav button[data-view=qibla]');
  await page.click('[data-a=start]');
  await page.waitForTimeout(2800);
  const status = await page.$eval('.compass-status', (e) => e.textContent);
  check(/Ingen kompass hittades.*142°/.test(status), 'Qibla: utan sensor visas riktningen i grader');
  await page.close();
}

await browser.close();
server.close();
if (failed) process.exit(1);
console.log('NATIVE E2E OK');
