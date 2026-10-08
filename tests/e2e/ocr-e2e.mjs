// End-to-end: serves the built app, imports the sample photo in Chromium and
// checks every value on the review screen against the real table.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const fx = JSON.parse(await readFile('tests/fixtures/karlstad-oktober-2026.json', 'utf8'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.gz': 'application/gzip', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
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
const values = await page.$$eval('table.review tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('input')].map((i) => i.value)));
let wrong = 0;
fx.truth.forEach((row, i) => row.forEach((v, c) => { if (values[i]?.[c] !== v) { wrong++; console.log(`day ${i + 1} col ${c}: got ${values[i]?.[c]} want ${v}`); } }));
const flagged = await page.$$eval('table.review input.corrected, table.review input.uncertain', (els) => els.length);
console.log(`month=${month} year=${year} rows=${values.length} wrong=${wrong} flagged=${flagged}`);

await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/review.png` : 'review.png', fullPage: false });
await page.click('[data-a=save]');
await page.waitForSelector('.times');
if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/home.png`, fullPage: true });
await browser.close();
server.close();
if (wrong || month !== '10' || year !== '2026' || values.length !== 31) process.exit(1);
console.log('E2E OK');
