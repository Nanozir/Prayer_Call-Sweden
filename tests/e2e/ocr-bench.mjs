// OCR robustness benchmark: imports the sample schedule plus degraded versions
// (shadow, low resolution, dark mode, blur) and reports, per image, how many of
// the 186 times end up wrong and how many are flagged yellow/red for review.
// Usage: npm run build && node tests/e2e/ocr-bench.mjs [--strict]
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const fx = JSON.parse(await readFile('tests/fixtures/karlstad-oktober-2026.json', 'utf8'));
const images = [
  ['original', 'tests/fixtures/karlstad-oktober-2026.jpg'],
  ['skugga', 'tests/fixtures/degraded/shadow.jpg'],
  ['låg upplösning', 'tests/fixtures/degraded/lowres.jpg'],
  ['mörkt läge', 'tests/fixtures/degraded/inverted.jpg'],
  ['oskärpa', 'tests/fixtures/degraded/blur.jpg'],
];
// --strict: no image may have a wrong time that is NOT flagged for review.
const LIMITS = { silent: 0 };

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

const results = [];
for (const [name, file] of images) {
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  await page.addInitScript(() => {
    const fixed = new Date('2026-10-08T06:13:00Z').getTime();
    const RealDate = Date;
    globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  });
  await page.goto(url);
  await page.click('nav button[data-view=import]');
  const t0 = Date.now();
  await page.setInputFiles('input[type=file]', file);
  const outcome = await Promise.race([
    page.waitForSelector('table.review', { timeout: 240000 }).then(() => 'ok'),
    page.waitForSelector('.error .banner', { timeout: 240000 }).then(() => 'error'),
  ]);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (outcome !== 'ok') {
    results.push({ name, secs, wrong: 186, silent: '-', yellow: '-', red: '-', month: '-', note: await page.$eval('.error .banner', (e) => e.textContent) });
  } else {
    const cells = await page.$$eval('table.review tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('button.cell')].map((b) => [b.textContent, b.className])));
    let wrong = 0, silent = 0;
    fx.truth.forEach((row, i) => row.forEach((v, c) => {
      const [text, cls] = cells[i]?.[c] ?? ['', ''];
      if (text !== v) { wrong++; if (cls === 'cell') { silent++; if (process.env.SHOW_SILENT) console.log('  omarkerat fel', name, 'dag', i + 1, 'kol', c, 'läst', text, 'rätt', v); } }
    }));
    const yellow = await page.$$eval('.cell.corrected', (e) => e.length);
    const red = await page.$$eval('.cell.uncertain, .cell.invalid', (e) => e.length);
    const month = `${await page.$eval('[data-f=month]', (e) => e.value)}/${await page.$eval('[data-f=year]', (e) => e.value)}`;
    results.push({ name, secs, wrong, silent, yellow, red, month });
  }
  await page.close();
}
await browser.close();
server.close();

console.log('bild            fel  varav omarkerade  gula  röda  månad    tid');
for (const r of results) {
  console.log(`${r.name.padEnd(15)} ${String(r.wrong).padStart(3)}  ${String(r.silent).padStart(16)}  ${String(r.yellow).padStart(4)}  ${String(r.red).padStart(4)}  ${r.month.padEnd(7)}  ${r.secs}s ${r.note ?? ''}`);
}
if (process.argv.includes('--strict') && results.some((r) => r.silent === '-' || r.silent > LIMITS.silent)) process.exit(1);
