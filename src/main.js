import { App } from '@capacitor/app';
import {
  PRAYERS, MONTHS_SV, WEEKDAYS_SV, daysInMonth, weekday, fmt, parseTime,
  monthKey, monthLabel, nowInStockholm,
} from './time.js';
import {
  loadSchedules, saveSchedule, deleteSchedule, loadSettings, saveSettings,
  scheduleStatus, todaysTimes, coverageEnd, nextPrayer,
} from './store.js';
import {
  rescheduleAll, ensurePermissions, openExactAlarmSettings, testNotification, isNative, SOUND_OPTIONS,
  notificationFacts,
} from './notify.js';
import { validateSchedule, rowProblems } from './ocr/correct.js';
import { withEstimates } from './estimate.js';
import { shareCalendar } from './share.js';
import { addDays, sameDay, dayRow, step } from './daynav.js';
import { batteryStatus, openBatterySettings, openNotificationSettings } from './native.js';
import { healthItems } from './health.js';
import { Capacitor } from '@capacitor/core';

const app = document.getElementById('app');
const state = { view: 'home', viewDate: null, anim: null, schedules: {}, settings: null, notifyResult: null, perms: null, draft: null };

const ICON = {
  bellOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1Z"/></svg>',
  bellOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6.17V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66a6.9 6.9 0 0 0-2.38 1.04ZM3.4 2.6 2 4l3.13 3.13A7 7 0 0 0 5 11v5l-2 2v1h14.17l2.83 2.83 1.4-1.4Z"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2ZM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5Z"/></svg>',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// ---------------------------------------------------------------- navigation

document.querySelectorAll('.tabs button').forEach((b) => {
  b.addEventListener('click', () => show(b.dataset.view));
});

function show(view) {
  if (view === 'home' && state.view !== 'home') state.viewDate = null;
  state.view = view;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  render();
  window.scrollTo(0, 0);
}

function render() {
  app.replaceChildren();
  if (state.view === 'home') renderHome();
  else if (state.view === 'import') renderImport();
  else renderSettings();
}

async function refreshNotifications() {
  try {
    state.notifyResult = await rescheduleAll(state.schedules, state.settings);
    if (isNative()) state.perms = await ensurePermissions();
  } catch (e) {
    state.notifyResult = { error: e.message ?? String(e) };
  }
}

// ---------------------------------------------------------------- home

function statusBanners() {
  const today = nowInStockholm();
  const all = Object.values(state.schedules);
  const out = [];
  const end = coverageEnd(state.schedules, today);

  if (!all.length && state.settings.estimate) {
    out.push(['warn', 'Inget schema från moskén inlagt. Beräknade tider visas och används för notiser – de kan avvika från moskéns tider. Lägg in moskéns schema så snart du kan.', 'import']);
  } else if (!all.length) {
    out.push(['warn', 'Inget schema inlagt ännu. Ta en bild/skärmdump av moskéns månadsschema och lägg in det.', 'import']);
  } else if (!end && state.settings.estimate) {
    out.push(['warn', `Inget schema från moskén för ${monthLabel(today.year, today.month)}. Beräknade tider visas och används för notiser – de kan avvika från moskéns tider. Lägg in moskéns schema så snart det finns.`, 'import']);
  } else if (!end) {
    const upcoming = all.filter((s) => scheduleStatus(s, today) === 'upcoming')
      .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))[0];
    out.push(['bad', `Det finns inget schema för ${monthLabel(today.year, today.month)}. `
      + 'Inga bönenotiser skickas idag, så du får inga felaktiga tider – lägg in månadens schema. '
      + '(I nödfall kan du slå på "Beräknade tider" under Inställningar.)'
      + (upcoming ? ` (Schemat för ${monthLabel(upcoming.year, upcoming.month)} börjar gälla den 1:a.)` : ''), 'import']);
  } else {
    const daysLeft = end.year === today.year && end.month === today.month ? end.day - today.day : Infinity;
    if (daysLeft <= 3) {
      out.push(['warn', daysLeft === 0
        ? `Schemat går ut idag. Lägg in nästa månads schema för att fortsätta få notiser.`
        : `Schemat går ut om ${daysLeft} dag${daysLeft === 1 ? '' : 'ar'} (${end.day} ${MONTHS_SV[end.month - 1]}). Lägg in nästa månad när moskén publicerat den.`, 'import']);
    }
  }

  if (!isNative()) {
    out.push(['warn', 'Du kör webbversionen – notiser fungerar bara i den installerade appen.']);
  } else if (state.perms && !state.perms.display) {
    out.push(['bad', 'Notiser är avstängda för appen. Slå på dem i telefonens inställningar.']);
  } else if (state.perms && !state.perms.exact) {
    out.push(['warn', 'Appen får inte använda exakta alarm, så notiser kan komma några minuter sent.', 'exact']);
  }
  if (Capacitor.getPlatform() === 'ios' && state.notifyResult?.scheduled) {
    out.push(['warn', 'På iPhone kan bara de närmaste dagarnas notiser läggas in åt gången. Öppna appen minst en gång i veckan så fylls de på.']);
  }
  if (state.notifyResult?.error) out.push(['bad', `Kunde inte schemalägga notiser: ${state.notifyResult.error}`]);
  return out;
}

function renderBanners(target) {
  for (const [kind, text, action] of statusBanners()) {
    const el = h(`<div class="banner ${kind}">${esc(text)}${action ? '<br><button class="secondary"></button>' : ''}</div>`);
    const btn = el.querySelector('button');
    if (action === 'import') { btn.textContent = 'Lägg till schema'; btn.onclick = () => show('import'); }
    if (action === 'exact') {
      btn.textContent = 'Tillåt exakta alarm';
      btn.onclick = async () => { await openExactAlarmSettings(); await refreshNotifications(); render(); };
    }
    target.append(el);
  }
}

function renderHome() {
  const today = nowInStockholm();
  const shown = withEstimates(state.schedules, state.settings, today);
  const date = state.viewDate ?? today;
  const isToday = sameDay(date, today);
  if (isToday) renderBanners(app);

  const wd = WEEKDAYS_SV[weekday(date.year, date.month, date.day)];
  const prevStep = step(shown, date, -1);
  const nextStep = step(shown, date, 1);
  const nav = h(`<div class="day-nav">
    <button class="nav-arrow" data-dir="-1" aria-label="Föregående dag" ${prevStep ? '' : 'disabled'}>‹</button>
    <div class="nav-label">
      <span class="nav-day">${isToday ? 'Idag' : `${wd} ${date.day} ${MONTHS_SV[date.month - 1]}`}</span>
      ${isToday ? `<span class="muted">${wd} ${date.day} ${MONTHS_SV[date.month - 1]}</span>` : '<button class="link" data-a="today">Till idag</button>'}
    </div>
    <button class="nav-arrow" data-dir="1" aria-label="Nästa dag" ${nextStep ? '' : 'disabled'}>›</button>
  </div>`);
  nav.querySelectorAll('.nav-arrow').forEach((b) => { b.onclick = () => moveDay(+b.dataset.dir); });
  nav.querySelector('[data-a=today]')?.addEventListener('click', () => {
    const back = date.year * 10000 + date.month * 100 + date.day > today.year * 10000 + today.month * 100 + today.day;
    state.anim = sameMonth(date, today) ? 'fade' : `month-${back ? 'prev' : 'next'}`;
    state.viewDate = null;
    render();
  });
  app.append(nav);

  const pane = h('<div class="day-pane"></div>');
  if (state.anim) {
    pane.classList.add(`anim-${state.anim}`);
    if (state.anim.startsWith('month')) pane.append(h(`<div class="month-chip">${monthLabel(date.year, date.month)}</div>`));
    state.anim = null;
  }
  app.append(pane);

  const row = dayRow(shown, date);
  if (!row) {
    const future = date.year * 12 + date.month > today.year * 12 + today.month;
    const card = h(`<section class="card no-schedule">
      <div class="no-schedule-icon">📅</div>
      <h2>Inget schema för ${monthLabel(date.year, date.month)}</h2>
      <p class="muted">${future
        ? 'Schemat för nästa månad är inte inlagt än. Lägg in det när moskén har publicerat det.'
        : 'Det finns inget sparat schema för den här månaden.'}</p>
      ${future || isToday ? '<button data-a="import">Lägg till schema</button>' : ''}
    </section>`);
    card.querySelector('[data-a=import]')?.addEventListener('click', () => show('import'));
    pane.append(card);
    return;
  }

  const estimated = !!shown[monthKey(date.year, date.month)]?.estimated;
  const badge = estimated ? ' <span class="est-badge">Beräknade tider</span>' : '';
  const next = isToday ? nextPrayer(shown, today) : null;
  if (isToday) {
    const prev = next ? (next.index > 0 ? row[next.index - 1] : null) : null;
    const pct = next && prev != null ? Math.min(100, Math.max(0, ((today.minutes - prev) / (next.minutes - prev)) * 100)) : 0;
    pane.append(h(`<section class="hero">
      <div class="hero-date">${wd} ${today.day} ${MONTHS_SV[today.month - 1]}${badge}</div>
      ${next ? `<div class="hero-label">Nästa bön</div>
        <div class="hero-main"><span class="hero-name">${next.prayer.name}</span><span class="hero-time">${fmt(next.minutes)}</span></div>
        <div class="hero-count">om ${countdown(next.minutes - today.minutes)}</div>
        ${prev != null ? `<div class="hero-bar"><span style="width:${pct.toFixed(0)}%"></span></div>` : ''}`
    : '<div class="hero-main"><span class="hero-name">Dagens böner är klara</span></div>'}
    </section>`));
  } else {
    const diff = Math.round((Date.UTC(date.year, date.month - 1, date.day) - Date.UTC(today.year, today.month - 1, today.day)) / 864e5);
    const rel = diff === 1 ? 'Imorgon' : diff === -1 ? 'Igår' : diff > 0 ? `Om ${diff} dagar` : `För ${-diff} dagar sedan`;
    pane.append(h(`<section class="hero hero-other">
      <div class="hero-date">${rel}${badge}</div>
      <div class="hero-main"><span class="hero-name">${wd} ${date.day} ${MONTHS_SV[date.month - 1]}</span></div>
      <div class="hero-count">Fajr ${fmt(row[0])} · Maghrib ${fmt(row[4])}</div>
    </section>`));
  }

  const list = h('<section class="card prayers-today"></section>');
  const past = date.year * 10000 + date.month * 100 + date.day < today.year * 10000 + today.month * 100 + today.day;
  PRAYERS.forEach((p, i) => {
    const on = state.settings.enabled[p.key];
    const cls = next?.index === i ? 'next' : past || (isToday && row[i] <= today.minutes) ? 'past' : '';
    const item = h(`<div class="prayer ${cls}">
      <span class="p-name">${p.name}${p.key === 'shuruk' ? '<small>soluppgång</small>' : ''}</span>
      <span class="p-time">${fmt(row[i])}</span>
      <button class="bell ${on ? 'on' : ''}" aria-label="${on ? 'Stäng av' : 'Slå på'} notis för ${p.name}">${on ? ICON.bellOn : ICON.bellOff}</button>
    </div>`);
    item.querySelector('.bell').onclick = async () => {
      state.settings.enabled[p.key] = !on;
      await saveSettings(state.settings);
      render();
      await refreshNotifications();
      render();
    };
    list.append(item);
  });
  pane.append(list);

  const n = state.notifyResult;
  if (isToday && n?.native && !n.denied && !n.error) {
    pane.append(h(`<p class="muted center">${n.scheduled
      ? `${n.scheduled} notiser schemalagda, till och med ${n.until.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}.`
      : 'Inga kommande notiser schemalagda.'}</p>`));
  }
  if (isToday) pane.append(h('<p class="muted center swipe-hint">Svep åt sidan för att se andra dagar</p>'));
}

const sameMonth = (a, b) => a.year === b.year && a.month === b.month;

function moveDay(dir) {
  const today = nowInStockholm();
  const shown = withEstimates(state.schedules, state.settings, today);
  const r = step(shown, state.viewDate ?? today, dir);
  if (!r) {
    app.querySelector('.day-pane')?.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(${dir * -12}px)` }, { transform: 'translateX(0)' }],
      { duration: 220 },
    );
    return;
  }
  state.viewDate = sameDay(r.to, today) ? null : r.to;
  state.anim = `${r.kind}-${dir > 0 ? 'next' : 'prev'}`;
  render();
}

// Horizontal swipe on the "Idag" tab changes day.
function setupSwipe() {
  let start = null;
  app.addEventListener('touchstart', (e) => {
    if (state.view !== 'home' || e.touches.length !== 1) { start = null; return; }
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  app.addEventListener('touchend', (e) => {
    if (!start || state.view !== 'home') return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    const fast = Date.now() - start.t < 600;
    start = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && fast) moveDay(dx < 0 ? 1 : -1);
  }, { passive: true });
}

function renderScheduleList() {
  const today = nowInStockholm();
  const list = Object.entries(state.schedules).sort(([a], [b]) => (a < b ? 1 : -1));
  if (!list.length) return;
  const card = h(`<section class="card"><h2>Inlagda scheman</h2><ul class="list"></ul>
    <p class="muted small-text">📅 <b>Kalender</b> skapar en kalenderfil med alla bönetider och påminnelser.
      Skicka den till t.ex. en iPhone – öppna filen där och välj "Lägg till alla" så hamnar tiderna i
      kalendern med notiser, utan att appen behövs.</p></section>`);
  const ul = card.querySelector('ul');
  const labels = { current: 'Gäller nu', upcoming: 'Kommande', expired: 'Utgånget' };
  for (const [key, s] of list) {
    const st = scheduleStatus(s, today);
    const li = h(`<li><span class="sched-name">${monthLabel(s.year, s.month)}<span class="badge ${st}">${labels[st]}</span></span>
      <span class="row"><button class="secondary small" data-a="edit">Visa / ändra</button><button class="secondary small" data-a="ics" title="Dela till kalender (t.ex. iPhone)">📅 Kalender</button><button class="danger small" data-a="del">Ta bort</button></span></li>`);
    li.querySelector('[data-a=edit]').onclick = () => {
      state.draft = { year: s.year, month: s.month, days: s.days.map((r) => [...r]), flags: s.days.map(() => new Array(6).fill('ok')), existing: true };
      render();
      window.scrollTo(0, 0);
    };
    li.querySelector('[data-a=ics]').onclick = async () => {
      try { await shareCalendar(s, state.settings); } catch (e) { if (!/cancel/i.test(e?.message ?? '')) alert(`Kunde inte dela: ${e.message ?? e}`); }
    };
    li.querySelector('[data-a=del]').onclick = async () => {
      if (!confirm(`Ta bort schemat för ${monthLabel(s.year, s.month)}? Dess notiser tas också bort.`)) return;
      state.schedules = await deleteSchedule(key);
      await refreshNotifications();
      render();
    };
    ul.append(li);
  }
  app.append(card);
}

function countdown(min) {
  const hh = Math.floor(min / 60), mm = min % 60;
  return hh ? `${hh} h ${mm} min` : `${mm} min`;
}

// ---------------------------------------------------------------- import

function renderImport() {
  if (state.draft) return renderReview();

  const card = h(`<section class="card">
    <h2>Lägg till månadsschema</h2>
    <p class="muted">Välj en bild eller skärmdump av moskéns schema. Tiderna läses av direkt i telefonen och du får granska dem innan de sparas.</p>
    <label class="file-pick"><input type="file" accept="image/*" />${ICON.image}<span>Välj bild</span></label>
    <div class="progress-box" hidden>
      <img class="thumb" alt="" />
      <div class="progress-info">
        <div class="msg">Förbereder…</div>
        <div class="bar"><span></span></div>
        <div class="muted pct"></div>
      </div>
    </div>
    <div class="error"></div>
    <p class="muted small-text">Tips: en rak, skarp bild där hela tabellen syns ger bäst resultat.</p>
    <button class="secondary" data-a="manual">Skriv in manuellt istället</button>
  </section>`);
  const input = card.querySelector('input');
  const box = card.querySelector('.progress-box');
  const pick = card.querySelector('.file-pick');
  const errEl = card.querySelector('.error');
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const imageUrl = URL.createObjectURL(file);
    box.querySelector('.thumb').src = imageUrl;
    box.hidden = false;
    pick.hidden = true;
    errEl.replaceChildren();
    try {
      const { readSchedule } = await import('./ocr/recognize.js');
      const res = await readSchedule(file, (f, msg) => {
        box.querySelector('.bar span').style.width = `${Math.round(f * 100)}%`;
        box.querySelector('.pct').textContent = `${Math.round(f * 100)} %`;
        box.querySelector('.msg').textContent = msg;
      });
      const now = nowInStockholm();
      state.draft = {
        year: res.year ?? now.year, month: res.month ?? now.month,
        monthDetected: res.year != null && res.month != null,
        days: res.days, flags: res.flags, raw: res.rawRows, image: imageUrl,
      };
      fitDraftToMonth();
      render();
      window.scrollTo(0, 0);
    } catch (e) {
      console.error(e);
      errEl.replaceChildren(h(`<div class="banner bad">Kunde inte läsa bilden: ${esc(e.message ?? e)}<br>Försök igen, eller skriv in tiderna manuellt.</div>`));
      box.hidden = true;
      pick.hidden = false;
      input.value = '';
    }
  };
  card.querySelector('[data-a=manual]').onclick = () => {
    const now = nowInStockholm();
    state.draft = { year: now.year, month: now.month, monthDetected: true, days: [], flags: [] };
    fitDraftToMonth();
    render();
  };
  app.append(card);
  renderScheduleList();
}

// Pads/trims the draft so it has exactly one row per day of the chosen month.
function fitDraftToMonth() {
  const d = state.draft;
  const n = daysInMonth(d.year, d.month);
  d.rowCountMismatch = d.days.length && d.days.length !== n ? d.days.length : null;
  while (d.days.length < n) { d.days.push(new Array(6).fill(null)); d.flags.push(new Array(6).fill('uncertain')); }
  d.days.length = n;
  d.flags.length = n;
}

function renderReview() {
  const d = state.draft;
  const today = nowInStockholm();
  const card = h(`<section class="card">
    <h2>Granska schemat</h2>
    <div class="row">
      <select data-f="month">${MONTHS_SV.map((m, i) => `<option value="${i + 1}" ${i + 1 === d.month ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <input type="number" data-f="year" value="${d.year}" min="2020" max="2100" style="width:90px" />
    </div>
    <div class="status"></div>
    ${d.image ? '<details><summary class="muted">Visa bilden</summary><img class="preview" /></details>' : ''}
    <p class="legend muted">
      <span style="background:var(--warn-bg);color:var(--warn)">gul</span>automatiskt rättad – titta snabbt
      <br><span style="background:var(--bad-bg);color:var(--bad)">röd</span>osäker – kontrollera mot bilden
      <br>Tryck på en tid för att ändra eller bekräfta den.
    </p>
    <div class="check-bar"></div>
    <div class="review-wrap"><table class="review"><thead><tr><th></th>${PRAYERS.map((p) => `<th>${p.name}</th>`).join('')}</tr></thead><tbody></tbody></table></div>
    <div class="issues"></div>
    <div class="row" style="margin-top:12px"><button data-a="save">Spara schema</button><button class="secondary" data-a="cancel">Avbryt</button></div>
  </section>`);
  if (d.image) card.querySelector('img.preview').src = d.image;

  const statusEl = card.querySelector('.status');
  const updateStatus = () => {
    const st = scheduleStatus(d, today);
    const msgs = [];
    if (!d.monthDetected) msgs.push(['warn', 'Kunde inte läsa av månad/år från bilden – kontrollera att rätt månad är vald.']);
    if (st === 'expired') msgs.push(['warn', `Det här schemat gäller ${monthLabel(d.year, d.month)}, som redan har passerat. Det kan sparas, men inga notiser skapas från det.`]);
    if (st === 'upcoming') msgs.push(['ok', `Schemat börjar gälla 1 ${MONTHS_SV[d.month - 1]} ${d.year}.`]);
    if (st === 'current') msgs.push(['ok', `Schemat gäller nu (${monthLabel(d.year, d.month)}).`]);
    if (!d.existing && state.schedules[monthKey(d.year, d.month)]) msgs.push(['warn', 'Det finns redan ett schema för den här månaden – det ersätts när du sparar.']);
    if (d.rowCountMismatch) msgs.push(['warn', `Bilden gav ${d.rowCountMismatch} rader men månaden har ${daysInMonth(d.year, d.month)} dagar – kontrollera tabellen.`]);
    statusEl.replaceChildren(...msgs.map(([k, t]) => h(`<div class="banner ${k}">${esc(t)}</div>`)));
  };
  const onMonthChange = () => {
    d.year = +card.querySelector('[data-f=year]').value;
    d.month = +card.querySelector('[data-f=month]').value;
    d.monthDetected = true;
    fitDraftToMonth();
    render();
  };
  card.querySelector('[data-f=month]').onchange = onMonthChange;
  card.querySelector('[data-f=year]').onchange = onMonthChange;
  updateStatus();

  const tbody = card.querySelector('tbody');
  const cellClass = (i, c) => {
    const f = d.flags[i][c];
    if (d.days[i][c] == null || rowProblems(d.days[i]).includes(c)) return 'cell invalid';
    return f === 'ok' ? 'cell' : `cell ${f}`;
  };
  const checkBar = card.querySelector('.check-bar');
  const updateCheckBar = () => {
    const yellow = d.flags.flat().filter((f) => f === 'corrected').length;
    const red = d.flags.flat().filter((f) => f === 'uncertain').length;
    if (!yellow && !red) { checkBar.replaceChildren(h('<div class="banner ok">Alla tider är kontrollerade.</div>')); return; }
    const el = h(`<div class="banner warn">${red ? `<b>${red} röd${red === 1 ? '' : 'a'}</b> ` : ''}${red && yellow ? 'och ' : ''}${yellow ? `<b>${yellow} gul${yellow === 1 ? '' : 'a'}</b> ` : ''}tid${red + yellow === 1 ? '' : 'er'} att kontrollera.
      <br><button class="secondary small">Gå till nästa</button></div>`);
    el.querySelector('button').onclick = () => {
      for (let i = 0; i < d.days.length; i++) {
        for (let c = 0; c < 6; c++) {
          if (d.flags[i][c] !== 'ok') { openTimeEditor(i, c); return; }
        }
      }
    };
    checkBar.replaceChildren(el);
  };
  // Redraws a whole day (row order checks depend on all six values).
  const refreshRow = (i) => {
    for (let k = 0; k < 6; k++) {
      const btn = tbody.querySelector(`[data-cell="${i}-${k}"]`);
      btn.textContent = d.days[i][k] == null ? '––:––' : fmt(d.days[i][k]);
      btn.className = cellClass(i, k);
    }
    updateCheckBar();
  };

  function openTimeEditor(i, c) {
    const flag = d.flags[i][c];
    const near = (k) => (d.days[k]?.[c] != null ? fmt(d.days[k][c]) : '–');
    const raw = d.raw?.[i]?.[c];
    const why = flag === 'corrected'
      ? `Appen läste ${raw ? `"${esc(raw)}"` : 'något oklart'} och rättade det automatiskt. Stämmer tiden med bilden?`
      : flag === 'uncertain'
        ? `Appen kunde inte läsa tiden säkert${raw ? ` (läste "${esc(raw)}")` : ''}. Värdet nedan är en uppskattning – kontrollera mot bilden.`
        : 'Ändra tiden om den inte stämmer med moskéns schema.';
    const dlg = h(`<dialog class="editor">
      <form method="dialog">
        <h3>${PRAYERS[c].name} – ${WEEKDAYS_SV[weekday(d.year, d.month, i + 1)]} ${i + 1} ${MONTHS_SV[d.month - 1]}</h3>
        <p class="muted">${why}</p>
        <input type="time" required value="${d.days[i][c] == null ? '' : fmt(d.days[i][c])}" />
        <p class="muted small-text">Dagen innan: <b>${near(i - 1)}</b> · Dagen efter: <b>${near(i + 1)}</b></p>
        <p class="error-text"></p>
        <div class="row">
          <button value="save" class="primary">${flag === 'ok' ? 'Spara' : 'Stämmer – spara'}</button>
          <button value="cancel" class="secondary" formnovalidate>Avbryt</button>
        </div>
      </form>
    </dialog>`);
    const input = dlg.querySelector('input');
    dlg.querySelector('[value=save]').onclick = (e) => {
      let val = parseTime(input.value);
      if (val == null) { e.preventDefault(); dlg.querySelector('.error-text').textContent = 'Ange en tid, t.ex. 15:33.'; return; }
      if (c === 5 && val < 180) val += 1440; // Isha after midnight
      d.days[i][c] = val;
      d.flags[i][c] = 'ok';
      refreshRow(i);
    };
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    input.focus();
  }

  d.days.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.append(h(`<table><tr><td class="day">${WEEKDAYS_SV[weekday(d.year, d.month, i + 1)].slice(0, 3)} ${i + 1}</td></tr></table>`).querySelector('td'));
    row.forEach((v, c) => {
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.cell = `${i}-${c}`;
      btn.onclick = () => openTimeEditor(i, c);
      td.append(btn);
      tr.append(td);
    });
    tbody.append(tr);
  });
  d.days.forEach((_, i) => refreshRow(i));

  card.querySelector('[data-a=cancel]').onclick = () => { state.draft = null; render(); };
  card.querySelector('[data-a=save]').onclick = async () => {
    const issuesEl = card.querySelector('.issues');
    const uncertain = d.flags.flat().filter((f) => f === 'uncertain').length;
    const issues = validateSchedule(d);
    if (uncertain) issues.unshift(`${uncertain} tid${uncertain === 1 ? '' : 'er'} kunde inte läsas säkert (röda). Tryck på dem, kontrollera mot bilden och spara.`);
    if (issues.length) {
      issuesEl.replaceChildren(h(`<div class="banner bad">${issues.slice(0, 6).map(esc).join('<br>')}${issues.length > 6 ? '<br>…' : ''}</div>`));
      return;
    }
    if (scheduleStatus(d, today) === 'expired'
      && !confirm(`Schemat för ${monthLabel(d.year, d.month)} har redan gått ut. Spara ändå (utan notiser)?`)) return;
    state.schedules = await saveSchedule({
      year: d.year, month: d.month, days: d.days, savedAt: new Date().toISOString(),
    });
    state.draft = null;
    await refreshNotifications();
    show('home');
    window.scrollTo(0, 0);
  };
  app.append(card);
}

// ---------------------------------------------------------------- settings

function showEstimateInfo() {
  const dlg = h(`<dialog class="editor info">
    <form method="dialog">
      <h3>Beräknade tider (nödläge)</h3>
      <p><b>Vad det gör:</b> när det inte finns något schema från moskén för den aktuella eller nästa
        månad räknar appen fram tiderna själv, så att du ändå får notiser.</p>
      <p><b>Hur:</b> bönetiderna följer solen. Appen räknar ut solens läge över Karlstad för varje dag
        (soluppgång, middag, solnedgång, skymning och gryning) och justerar beräkningen så att den
        stämmer med moskéns egna scheman som du lagt in. Finns samma månad från ett tidigare år
        används den i stället, eftersom tiderna upprepas nästan exakt varje år. Har du inga egna
        scheman används moskéns schema för oktober 2026 som grund.</p>
      <p><b>Hur exakt:</b> nära de månader som finns inlagda brukar det skilja 0–2 minuter. Längre bort
        kan felet bli större – särskilt <b>Fajr och Isha på sommaren</b>, då det aldrig blir helt mörkt i
        Karlstad och moskéerna använder egna regler.</p>
      <p class="warn-text"><b>Varning:</b> använd bara läget om det inte finns något annat alternativ.
        Moskéns schema går alltid före – så fort du lägger in det används det i stället. Beräknade
        tider märks med "beräknad" i appen och i notiserna.</p>
      <p class="muted">Allt räknas ut i telefonen och fungerar utan internet.</p>
      <div class="row"><button value="ok">Jag förstår</button></div>
    </form>
  </dialog>`);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}


// "Fungerar notiserna?" – one line per thing that can stop or delay a prayer notification.
async function renderHealth(box) {
  box.replaceChildren(h('<p class="muted">Kontrollerar…</p>'));
  const f = await notificationFacts();
  if (!f.native) {
    box.replaceChildren(h('<p class="muted">Kontrollen fungerar bara i den installerade appen.</p>'));
    return;
  }
  const today = nowInStockholm();
  const shown = withEstimates(state.schedules, state.settings, today);
  const hasToday = !!shown[monthKey(today.year, today.month)];
  const battery = f.platform === 'android' ? await batteryStatus() : null;
  const recheck = () => refreshNotifications().then(() => renderHealth(box));
  const ACTIONS = {
    'notification-settings': ['Öppna notisinställningar', openNotificationSettings],
    'exact-alarms': ['Tillåt exakta alarm', openExactAlarmSettings],
    'battery-settings': ['Öppna batteriinställningar', openBatterySettings],
    'add-schedule': ['Lägg till schema', () => show('import')],
  };
  const items = healthItems(f, battery, hasToday).map((it) => ({ ...it, action: ACTIONS[it.action] }));
  const list = h('<ul class="health" aria-live="polite"></ul>');
  for (const it of items) {
    const li = h(`<li class="${it.ok ? 'ok' : 'bad'}"><span class="hi" aria-hidden="true">${it.ok ? '✅' : '⚠️'}</span>
      <span><b>${esc(it.text)}</b>${it.ok && it.note ? `<br><small class="muted">${esc(it.note)}</small>` : ''}</span></li>`);
    if (!it.ok && it.action) {
      const b = h(`<button class="secondary small">${esc(it.action[0])}</button>`);
      b.onclick = async () => { await it.action[1](); setTimeout(recheck, 800); };
      li.querySelector('span:last-child').append(h('<br>'), b);
    }
    list.append(li);
  }
  const allOk = items.every((i) => i.ok);
  box.replaceChildren(
    h(`<p class="${allOk ? 'health-ok' : 'health-bad'}">${allOk ? 'Allt ser bra ut – notiserna bör komma i tid.' : 'Något kan hindra notiserna:'}</p>`),
    list,
    h('<p class="muted small-text">Tänk också på att Stör ej och tyst läge kan dölja ljudet.</p>'),
  );
}

function renderSettings() {
  const s = state.settings;
  const card = h(`<div><section class="card"><h2>Fungerar notiserna?</h2><div class="health-box"></div>
    <button class="secondary small" data-a="recheck">Kontrollera igen</button></section>
    <section class="card"><h2>Notiser</h2><div class="prayers"></div>
    <div class="toggle"><span>Ljud vid bönetiden</span>
      <select data-f="sound">${SOUND_OPTIONS.map((o) => `<option value="${o.value}" ${o.value === s.sound ? 'selected' : ''}>${o.label}</option>`).join('')}</select></div>
    <div class="row sound-row"><button class="secondary small" data-a="listen">▶ Lyssna</button>
      <span class="muted">Ljuden är lågmälda från början. De följer telefonens notisvolym och hörs inte i tyst läge.</span></div>
    <div class="toggle"><span>Extra påminnelse innan<br><small class="muted">Notisen vid bönetiden kommer alltid också</small></span>
      <select data-f="offset">${[0, 5, 10, 15, 20, 30].map((m) => `<option value="${m}" ${m === s.offset ? 'selected' : ''}>${m ? `${m} min innan` : 'Ingen'}</option>`).join('')}</select></div>
    <label class="toggle"><span>Påminn när schemat håller på att gå ut</span><input type="checkbox" data-f="reminders" ${s.reminders ? 'checked' : ''}/></label>
    <div class="toggle"><span>Beräknade tider (nödläge)
        <button type="button" class="info-btn" data-a="estimate-info" aria-label="Om beräknade tider">i</button>
        <br><small class="muted">Bara när moskéns schema saknas</small></span>
      <input type="checkbox" data-f="estimate" ${s.estimate ? 'checked' : ''}/></div>
    <div class="row" style="margin-top:12px"><button class="secondary" data-a="test">Skicka testnotis</button><button class="secondary" data-a="exact">Exakta alarm</button></div>
    <p class="muted msg"></p>
  </section>
  <section class="card"><h2>Om notiserna</h2><p class="muted">
    Notiser skapas bara för datum som finns i ett inlagt schema. När ett schema gått ut skickas inga bönenotiser
    (så du aldrig får fel tider) – istället får du en påminnelse om att lägga in nästa månad.<br><br>
    Vissa telefoner (t.ex. OnePlus, Oppo, Xiaomi, Samsung) stänger av appar i bakgrunden för att spara batteri.
    Om notiser uteblir: ställ in batterioptimering för Salah-kalender till <b>Obegränsad / Tillåt</b>.
  </p></section>
  <p class="muted center">Salah-kalender version ${__APP_VERSION__}</p></div>`);
  const box = card.querySelector('.prayers');
  PRAYERS.forEach((p) => {
    const t = h(`<label class="toggle"><span>${p.name}${p.key === 'shuruk' ? ' <span class="muted">(soluppgång)</span>' : ''}</span><input type="checkbox" ${s.enabled[p.key] ? 'checked' : ''}/></label>`);
    t.querySelector('input').onchange = (e) => { s.enabled[p.key] = e.target.checked; persist(); };
    box.append(t);
  });
  const msg = card.querySelector('.msg');
  const persist = async () => {
    await saveSettings(s);
    await refreshNotifications();
    const n = state.notifyResult;
    msg.textContent = n?.native ? `Sparat – ${n.scheduled ?? 0} notiser schemalagda.` : 'Sparat.';
  };
  card.querySelector('[data-f=offset]').onchange = (e) => { s.offset = +e.target.value; persist(); };
  card.querySelector('[data-f=sound]').onchange = (e) => { s.sound = e.target.value; persist(); };
  let preview = null;
  card.querySelector('[data-a=listen]').onclick = () => {
    const file = SOUND_OPTIONS.find((o) => o.value === s.sound)?.file;
    preview?.pause();
    if (!file) { msg.textContent = 'Inget ljud valt – notisen vibrerar bara.'; return; }
    preview = new Audio(`sounds/${file}`);
    preview.play().catch(() => { msg.textContent = 'Kunde inte spela upp ljudet.'; });
  };
  card.querySelector('[data-f=reminders]').onchange = (e) => { s.reminders = e.target.checked; persist(); };
  card.querySelector('[data-a=estimate-info]').onclick = () => showEstimateInfo();
  card.querySelector('[data-f=estimate]').onchange = (e) => {
    if (e.target.checked && !confirm('Beräknade tider kan avvika från moskéns tider – särskilt Fajr och Isha på sommaren. '
      + 'Använd dem bara när moskéns schema saknas. Slå på ändå?')) { e.target.checked = false; return; }
    s.estimate = e.target.checked;
    persist();
  };
  const healthBox = card.querySelector('.health-box');
  renderHealth(healthBox);
  card.querySelector('[data-a=recheck]').onclick = async () => { await refreshNotifications(); renderHealth(healthBox); };
  card.querySelector('[data-a=test]').onclick = async () => {
    msg.textContent = (await testNotification(s)) ? 'Testnotis kommer om 5 sekunder.' : 'Notiser fungerar bara i appen och kräver tillstånd.';
  };
  card.querySelector('[data-a=exact]').onclick = async () => { await openExactAlarmSettings(); await persist(); };
  app.append(card);
}

// ---------------------------------------------------------------- startup

async function init() {
  setupSwipe();
  state.schedules = await loadSchedules();
  state.settings = await loadSettings();
  render();
  await refreshNotifications();
  render();
  App.addListener('appStateChange', async ({ isActive }) => {
    if (!isActive) return;
    await refreshNotifications();
    // Back from the system settings: home and the notification check show fresh status.
    if (state.view === 'home' || state.view === 'settings') render();
  }).catch(() => {});
  setInterval(() => { if (state.view === 'home') render(); }, 30_000);
}

init();
