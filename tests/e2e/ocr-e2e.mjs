// End-to-end: serves the built app, imports the sample photo in Chromium and
// checks every value on the review screen against the real table.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const fx = JSON.parse(await readFile('tests/fixtures/karlstad-oktober-2026.json', 'utf8'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.gz': 'application/gzip', '.wasm': 'application/wasm' };
const hits = {};
const server = createServer(async (req, res) => {
  const p = req.url.split('?')[0];
  hits[p] = (hits[p] ?? 0) + 1;
  const path = join('dist', decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  let body;
  try { body = await readFile(path); } catch { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
  res.end(body);
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
page.on('pageerror', (e) => console.error('pageerror', e));
const cspViolations = [];
page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text()); });
await page.addInitScript(() => {
  // Freeze "today" at 8 Oct 2026 08:13 Stockholm time.
  const fixed = new Date('2026-10-08T06:13:00Z').getTime();
  const RealDate = Date;
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
});
await page.goto(url);
await page.click('nav button[data-view=import]');
const t0 = Date.now();
await page.setInputFiles('input[type=file]', 'tests/fixtures/karlstad-oktober-2026.jpg');
await page.waitForSelector('table.review', { timeout: 180000 });
console.log(`OCR took ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const month = await page.$eval('[data-f=month]', (e) => e.value);
const year = await page.$eval('[data-f=year]', (e) => e.value);
const values = await page.$$eval('table.review tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('button.cell')].map((b) => b.textContent)));
let wrong = 0;
fx.truth.forEach((row, i) => row.forEach((v, c) => { if (values[i]?.[c] !== v) { wrong++; console.log(`day ${i + 1} col ${c}: got ${values[i]?.[c]} want ${v}`); } }));
const flagged = await page.$$eval('table.review .cell.corrected, table.review .cell.uncertain', (els) => els.length);

// Edit dialog: open a cell (the first flagged one if any), change it and save.
const hasFlags = flagged > 0;
if (hasFlags) await page.click('.check-bar button'); else await page.click('[data-cell="12-3"]');
await page.waitForSelector('dialog.editor[open]');
const [fi, fc] = hasFlags
  ? (await page.$eval('table.review .cell.corrected, table.review .cell.uncertain', (b) => b.dataset.cell)).split('-').map(Number)
  : [12, 3];
await page.fill('dialog.editor input[type=time]', '15:34');
await page.click('dialog.editor [value=save]');
const edited = await page.$eval(`[data-cell="${fi}-${fc}"]`, (b) => ({ text: b.textContent, cls: b.className }));
if (edited.text !== '15:34' || edited.cls !== 'cell') { console.log('FAIL: edit dialog did not update the cell', edited); process.exit(1); }
const remaining = await page.$$eval('table.review .cell.corrected, table.review .cell.uncertain', (els) => els.length);
if (remaining !== Math.max(0, flagged - 1)) { console.log('FAIL: flag not cleared'); process.exit(1); }
// Put the true value back so the saved schedule matches the fixture.
await page.click(`[data-cell="${fi}-${fc}"]`);
await page.fill('dialog.editor input[type=time]', fx.truth[fi][fc]);
await page.click('dialog.editor [value=save]');
console.log(`month=${month} year=${year} rows=${values.length} wrong=${wrong} flagged=${flagged}`);

if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/review.png` });
await page.click('[data-a=save]');
await page.waitForSelector('.hero');
if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/home.png`, fullPage: true });

// Day browsing: swipe (synthetic touch) and arrows, up to the end of the schedule.
const swipe = (dx) => page.evaluate((dx) => {
  const el = document.getElementById('app');
  const touch = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
  el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(200)], bubbles: true }));
  el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(200 + dx)], bubbles: true }));
}, dx);
await swipe(-120); // left = next day
const tomorrow = await page.$eval('.nav-day', (e) => e.textContent);
if (!/9 oktober/.test(tomorrow)) { console.log('FAIL: swipe did not go to the next day:', tomorrow); process.exit(1); }
const fajr9 = await page.$eval('.prayer .p-time', (e) => e.textContent);
if (fajr9 !== fx.truth[8][0]) { console.log('FAIL: wrong times for 9 Oct', fajr9); process.exit(1); }
await swipe(120); // back to today
if (await page.$eval('.nav-day', (e) => e.textContent) !== 'Idag') { console.log('FAIL: swipe back'); process.exit(1); }
for (let i = 0; i < 24; i++) await page.click('.nav-arrow[data-dir="1"]');
const end = await page.$eval('.no-schedule h2', (e) => e.textContent).catch(() => null);
const nextDisabled = await page.$eval('.nav-arrow[data-dir="1"]', (b) => b.disabled);
if (end !== 'Inget schema för november 2026' || !nextDisabled) { console.log('FAIL: end of schedule', end, nextDisabled); process.exit(1); }
if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/no-schedule.png` });
await page.click('.nav-arrow[data-dir="-1"]');
if (!/31 oktober/.test(await page.$eval('.nav-day', (e) => e.textContent))) { console.log('FAIL: back into October'); process.exit(1); }
if (process.env.SHOT_DIR) { await page.waitForTimeout(150); await page.screenshot({ path: `${process.env.SHOT_DIR}/month-anim.png` }); }
console.log('Day browsing OK');
await browser.close();
server.close();

// On Android, requests made from inside the OCR web worker can hang forever, so
// every OCR asset must be loaded exactly once, by the main thread.
const ocrHits = Object.entries(hits).filter(([p]) => p.includes('/tesseract/'));
console.log('OCR asset requests:', JSON.stringify(Object.fromEntries(ocrHits)));
if (ocrHits.length !== 3 || ocrHits.some(([, n]) => n !== 1)) {
  console.log('FAIL: OCR assets must be fetched once each, by the main thread only');
  process.exit(1);
}
if (cspViolations.length) {
  console.log('FAIL: Content-Security-Policy blocked something:\n' + cspViolations.join('\n'));
  process.exit(1);
}
if (wrong || month !== '10' || year !== '2026' || values.length !== 31) process.exit(1);
console.log('E2E OK');
