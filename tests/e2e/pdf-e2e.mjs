// End-to-end: imports islam.nu's PDF (text layer) and a scanned PDF (image only,
// read with OCR) in Chromium, then checks the mosque board view.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';

const nov = JSON.parse(await readFile('tests/fixtures/islamnu-karlstad-2026-11.json', 'utf8'));
const okt = JSON.parse(await readFile('tests/fixtures/karlstad-oktober-2026.json', 'utf8'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  const path = join('dist', decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  let body;
  try { body = await readFile(path); } catch { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
  res.end(body);
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const fail = (...m) => { console.log('FAIL:', ...m); process.exit(1); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

// A "scanned" PDF: the October photo as the only content of the page, no text.
const scanned = join(await mkdtemp(join(tmpdir(), 'salah-pdf-')), 'skannad.pdf');
{
  const p = await browser.newPage();
  const jpg = (await readFile('tests/fixtures/karlstad-oktober-2026.jpg')).toString('base64');
  await p.setContent(`<style>@page{margin:0}body{margin:0}</style><img src="data:image/jpeg;base64,${jpg}" style="display:block;width:946px">`);
  await p.pdf({ path: scanned, width: '946px', height: '2049px', printBackground: true });
  await p.close();
}

const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) errors.push(m.text()); });
await page.addInitScript(() => {
  // Freeze "today" at Saturday 7 Nov 2026 16:00 Stockholm time (Maghrib 15:58, iqamah +5).
  const fixed = new Date('2026-11-07T15:00:00Z').getTime();
  const RealDate = Date;
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
});
await page.goto(url);

// 1. islam.nu PDF: read exactly from the text layer.
await page.click('nav button[data-view=import]');
await page.setInputFiles('input[type=file]', 'tests/fixtures/islamnu-karlstad-2026-11.pdf');
await page.waitForSelector('table.review', { timeout: 60000 });
const month = await page.$eval('[data-f=month]', (e) => e.value);
const year = await page.$eval('[data-f=year]', (e) => e.value);
if (month !== '11' || year !== '2026') fail('month/year', month, year);
const values = await page.$$eval('table.review tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('button.cell')].map((b) => b.textContent)));
let wrong = 0;
nov.truth.forEach((row, i) => row.forEach((v, c) => { if (values[i]?.[c] !== v) { wrong++; console.log(`day ${i + 1} col ${c}: got ${values[i]?.[c]} want ${v}`); } }));
const flagged = await page.$$eval('table.review .cell.corrected, table.review .cell.uncertain, table.review .cell.invalid', (els) => els.length);
const status = await page.$eval('.status', (e) => e.textContent);
if (wrong || flagged) fail(`islam.nu PDF: wrong=${wrong} flagged=${flagged}`);
if (!/islam\.nu, inte från moskéns eget schema/.test(status)) fail('no islam.nu warning', status);
if (!(await page.$('img.preview'))) fail('no preview image of the PDF');
console.log('islam.nu PDF: 180/180 times, no flags, warning shown');
await page.click('[data-a=save]');
await page.waitForSelector('.hero');

// 2. Mosque board.
await page.click('.view-switch [data-v=board]');
await page.waitForSelector('.board');
const board = await page.evaluate(() => ({
  tiles: [...document.querySelectorAll('.tile')].map((t) => [t.querySelector('.t-name').textContent, t.querySelector('.t-time').textContent, t.querySelector('.t-iq').textContent, t.className]),
  next: document.querySelector('.board-next')?.textContent,
  clock: document.querySelector('[data-clock]')?.textContent,
  shuruk: document.querySelector('.board-side .bs-time')?.textContent,
  jumua: document.querySelector('.board-side.right')?.textContent.trim(),
}));
const want = [['Fajr', '05:18', '+10'], ['Dhohr', '11:50', '+10'], ['Asr', '13:32', '+10'], ['Maghrib', '15:58', '+5'], ['Isha', '18:13', '+0']];
want.forEach((w, k) => { if (board.tiles[k].slice(0, 3).join() !== w.join()) fail('tile', k, board.tiles[k]); });
if (!board.tiles[3][3].includes('next')) fail('Maghrib not highlighted', board.tiles.map((t) => t[3]));
if (board.next !== 'Iqamah Maghrib om 3 min') fail('next line', board.next);
if (board.clock !== '16:00:00') fail('clock', board.clock);
if (board.shuruk !== '07:40' || board.jumua !== '') fail('top row', board.shuruk, board.jumua);
if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/board.png` });

// Settings: Jumua time and an iqamah change show up on the board; the choice of view is remembered.
await page.click('nav button[data-view=settings]');
await page.fill('[data-f=jumua]', '12:15');
await page.dispatchEvent('[data-f=jumua]', 'change');
await page.selectOption('[data-iq="3"]', '10');
await page.click('nav button[data-view=home]');
await page.waitForSelector('.board');
const after = await page.evaluate(() => ({
  jumua: document.querySelector('.board-side.right .bs-time')?.textContent,
  maghribIq: document.querySelectorAll('.tile .t-iq')[3].textContent,
  next: document.querySelector('.board-next')?.textContent,
}));
if (after.jumua !== '12:15' || after.maghribIq !== '+10' || after.next !== 'Iqamah Maghrib om 8 min') fail('after settings', after);
await page.click('.nav-arrow[data-dir="1"]');
await page.waitForFunction(() => document.querySelector('.nav-day')?.textContent !== 'Idag' && document.querySelector('.board'));
if (await page.$('[data-clock]')) fail('clock shown for another day');
console.log('board: tiles, highlight, iqamah countdown, Jumua, settings OK');

// 3. Scanned PDF without text: rendered and read with OCR.
await page.click('nav button[data-view=import]');
await page.setInputFiles('input[type=file]', scanned);
await page.waitForSelector('table.review', { timeout: 240000 });
const ocr = await page.$$eval('table.review tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('button.cell')].map((b) => b.textContent)));
let bad = 0;
okt.truth.forEach((row, i) => row.forEach((v, c) => { if (ocr[i]?.[c] !== v) { bad++; console.log('day', i + 1, c, ocr[i]?.[c], v); } }));
const ocrFlags = await page.$$eval('table.review .cell.corrected, table.review .cell.uncertain', (els) => els.length);
const ocrMonth = await page.$eval('[data-f=month]', (e) => e.value);
console.log(`scanned PDF: month=${ocrMonth} wrong=${bad} flagged=${ocrFlags}`);
if (ocrMonth !== '10' || bad > ocrFlags) fail('scanned PDF read badly');
if (await page.$eval('.status', (e) => /islam\.nu/.test(e.textContent))) fail('islam.nu warning on mosque schedule');

if (errors.length) fail('page errors', errors);
await browser.close();
server.close();
console.log('PASS');
