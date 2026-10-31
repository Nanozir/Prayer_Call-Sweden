'use strict';
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, protocol, session, nativeImage, shell, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Scheduler, SNOOZE_MS } = require('./scheduler.cjs');

const APP_ID = 'se.salahkalender.app';
const ORIGIN = 'app://salah/';
const ALARM_MAX_MS = 5 * 60 * 1000;
const MAX_ITEMS = 5000;
const DIST = path.join(app.getAppPath(), 'dist');
const ICON = path.join(app.getAppPath(), 'build', 'icon.png');
const STATE_FILE = () => path.join(app.getPath('userData'), 'schedule.json');
const DESKTOP_FILES = new Set(['alarm.html', 'alarm.js', 'sound.html', 'sound.js']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

// Custom scheme instead of file://: module scripts, fetch() (OCR/PDF assets) and workers don't work from file:// origins.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let win = null;
let soundWin = null;
let tray = null;
let timer = null;
let quitting = false;
const main = new Scheduler(); // replaced by the renderer
const snoozed = new Scheduler(); // survives renderer reschedules
const alarms = new Map(); // webContents.id -> { win, item, timeout }
const live = new Set(); // keeps Notification objects alive

app.setAppUserModelId(APP_ID);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(start);
}

// --- persistence ---------------------------------------------------------

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
    main.replace(data.items);
    snoozed.replace(data.snoozed);
  } catch { /* first run or unreadable file */ }
}

function save() {
  const now = Date.now();
  try {
    const tmp = STATE_FILE() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ items: main.pending(now), snoozed: snoozed.pending(now) }));
    fs.renameSync(tmp, STATE_FILE());
  } catch (e) { console.error('Kunde inte spara schemat', e); }
}

// --- scheduler loop ------------------------------------------------------

function arm() {
  clearTimeout(timer);
  const now = Date.now();
  const delays = [main.nextDelay(now), snoozed.nextDelay(now)].filter((d) => d !== null);
  if (!delays.length) return;
  timer = setTimeout(tick, Math.min(...delays));
}

function tick() {
  const due = [...main.due(Date.now()), ...snoozed.due(Date.now())];
  if (due.length) {
    save();
    for (const item of due) fire(item);
  }
  arm();
}

function fire(item) {
  if (item.kind === 'alarm') return openAlarm(item);
  const n = new Notification({ title: item.title, body: item.body, silent: true, icon: ICON });
  live.add(n);
  n.on('click', showWindow);
  n.on('close', () => live.delete(n));
  n.show();
  if (item.sound !== 'off') playSound(item.sound);
}

// --- sound ---------------------------------------------------------------

function secure(extra = {}) {
  return { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, ...extra };
}

function createSoundWindow() {
  soundWin = new BrowserWindow({
    show: false,
    webPreferences: secure({ preload: path.join(__dirname, 'sound-preload.cjs'), autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false }),
  });
  soundWin.loadURL(ORIGIN + '_desktop/sound.html');
}

function playSound(name) {
  if (!soundWin || soundWin.isDestroyed()) createSoundWindow();
  const send = () => soundWin.webContents.send('sound:play', name);
  if (soundWin.webContents.isLoading()) soundWin.webContents.once('did-finish-load', send);
  else send();
}

// --- alarm window --------------------------------------------------------

function openAlarm(item) {
  const w = new BrowserWindow({
    width: 480, height: 380, center: true, show: false, resizable: false, minimizable: false, maximizable: false,
    alwaysOnTop: true, autoHideMenuBar: true, title: item.title, icon: ICON,
    webPreferences: secure({ preload: path.join(__dirname, 'alarm-preload.cjs'), autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false }),
  });
  const id = w.webContents.id;
  const entry = { win: w, item, timeout: setTimeout(() => closeAlarm(id), ALARM_MAX_MS) };
  alarms.set(id, entry);
  w.setAlwaysOnTop(true, 'screen-saver');
  w.on('closed', () => { clearTimeout(entry.timeout); alarms.delete(id); });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('did-finish-load', () => w.webContents.send('alarm:init', { title: item.title, body: item.body }));
  w.once('ready-to-show', () => { w.show(); w.focus(); w.moveTop(); w.flashFrame(true); });
  w.loadURL(ORIGIN + '_desktop/alarm.html');
}

function closeAlarm(id) {
  const e = alarms.get(id);
  if (e && !e.win.isDestroyed()) e.win.close();
}

ipcMain.on('alarm:dismiss', (e) => closeAlarm(e.sender.id));
ipcMain.on('alarm:snooze', (e) => {
  const entry = alarms.get(e.sender.id);
  if (!entry) return;
  snoozed.snooze(entry.item, Date.now(), SNOOZE_MS);
  save();
  arm();
  closeAlarm(e.sender.id);
});

// --- main window + tray --------------------------------------------------

function fromMainWindow(e) {
  return !!win && !win.isDestroyed() && e.sender === win.webContents && e.senderFrame.url.startsWith(ORIGIN);
}

function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!fromMainWindow(e)) throw new Error('Otillåten avsändare');
    return fn(...args);
  });
}

function autoStartOpts() {
  return { path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: ['--hidden'] };
}

function isAutoStart() {
  return app.getLoginItemSettings(autoStartOpts()).openAtLogin;
}

function setAutoStart(on) {
  app.setLoginItemSettings({ openAtLogin: on, ...autoStartOpts() });
  updateTray();
}

function testNotification() {
  fire({ id: 0, at: Date.now(), kind: 'info', title: 'Salah-kalender', body: 'Testnotis – notiser fungerar.', sound: 'chime' });
}

function registerIpc() {
  handle('salah:schedule', (items) => {
    const scheduled = main.replace(Array.isArray(items) ? items.slice(0, MAX_ITEMS) : []);
    save();
    arm();
    return { scheduled };
  });
  handle('salah:cancel-all', () => { main.clear(); snoozed.clear(); save(); arm(); });
  handle('salah:test', testNotification);
  handle('salah:get-autostart', isAutoStart);
  handle('salah:set-autostart', (on) => setAutoStart(!!on));
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow(false);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow(hidden) {
  win = new BrowserWindow({
    width: 1100, height: 800, minWidth: 360, minHeight: 500, show: false, autoHideMenuBar: true, title: 'Salah-kalender', icon: ICON,
    webPreferences: secure({
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: ['--salah-version=' + app.getVersion()],
      backgroundThrottling: false,
    }),
  });
  win.once('ready-to-show', () => { if (!hidden) win.show(); });
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) e.preventDefault(); });
  win.loadURL(ORIGIN + 'index.html');
}

function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Öppna', click: showWindow },
    { label: 'Skicka testnotis', click: testNotification },
    { label: 'Starta med Windows', type: 'checkbox', checked: isAutoStart(), click: (item) => setAutoStart(item.checked) },
    { type: 'separator' },
    { label: 'Avsluta', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 32, height: 32 }));
  tray.setToolTip('Salah-kalender');
  tray.on('click', showWindow);
  updateTray();
}

// --- protocol ------------------------------------------------------------

function serve() {
  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    if (url.host !== 'salah') return new Response('Not found', { status: 404 });
    let root = DIST;
    let rel = decodeURIComponent(url.pathname);
    if (rel.startsWith('/_desktop/')) {
      root = __dirname;
      rel = rel.slice('/_desktop'.length);
      if (!DESKTOP_FILES.has(rel.slice(1))) return new Response('Not found', { status: 404 });
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    let buf;
    try { buf = await fs.promises.readFile(file); } catch { return new Response('Not found', { status: 404 }); }
    const headers = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(buf.length - Number(m[2]), 0);
      const end = m[1] && m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
      if (start > end || start >= buf.length) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${buf.length}` } });
      return new Response(buf.subarray(start, end + 1), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${buf.length}` } });
    }
    return new Response(buf, { headers });
  });
}

function start() {
  serve();
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  Menu.setApplicationMenu(null);
  load();
  registerIpc();
  createSoundWindow();
  createWindow(process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin);
  createTray();
  powerMonitor.on('resume', tick);
  tick();
}

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* stay in the tray */ });
