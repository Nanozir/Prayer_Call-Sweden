import { App } from '@capacitor/app';
import {
  PRAYERS, MONTHS_SV, WEEKDAYS_SV, daysInMonth, weekday, fmt, parseTime,
  monthKey, monthLabel, nowInStockholm,
} from './time.js';
import {
  loadSchedules, saveSchedule, deleteSchedule, loadSettings, saveSettings,
  scheduleStatus, todaysTimes, coverageEnd, nextPrayer,
} from './store.js';
import { rescheduleAll, ensurePermissions, openExactAlarmSettings, testNotification, isNative } from './notify.js';
import { validateSchedule, rowProblems } from './ocr/correct.js';

const app = document.getElementById('app');
const state = { view: 'home', schedules: {}, settings: null, notifyResult: null, perms: null, draft: null };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// ---------------------------------------------------------------- navigation

document.querySelectorAll('.tabs button').forEach((b) => {
  b.addEventListener('click', () => show(b.dataset.view));
});

function show(view) {
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

  if (!all.length) {
    out.push(['warn', 'Inget schema inlagt ännu. Ta en bild/skärmdump av moskéns månadsschema och lägg in det.', 'import']);
  } else if (!end) {
    const upcoming = all.filter((s) => scheduleStatus(s, today) === 'upcoming')
      .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))[0];
    out.push(['bad', `Det finns inget schema för ${monthLabel(today.year, today.month)}. `
      + 'Inga bönenotiser skickas idag, så du får inga felaktiga tider – lägg in månadens schema.'
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
  renderBanners(app);
  const today = nowInStockholm();
  const row = todaysTimes(state.schedules, today);
  const wd = WEEKDAYS_SV[weekday(today.year, today.month, today.day)];

  if (row) {
    const next = nextPrayer(state.schedules, today);
    const card = h(`<section class="card">
      <h2>${wd} ${today.day} ${MONTHS_SV[today.month - 1]}</h2>
      ${next ? `<div class="muted">Nästa: ${next.prayer.name}</div>
        <div class="big">${fmt(next.minutes)}</div>
        <div class="muted">om ${countdown(next.minutes - today.minutes)}</div>` : '<div class="muted">Dagens böner är passerade.</div>'}
      <table class="times"><tbody></tbody></table>
    </section>`);
    const tbody = card.querySelector('tbody');
    PRAYERS.forEach((p, i) => {
      const cls = [next?.index === i ? 'next' : row[i] <= today.minutes ? 'past' : '', state.settings.enabled[p.key] ? '' : 'off'].join(' ');
      tbody.append(h(`<table><tr class="${cls}"><td>${p.name}</td><td>${fmt(row[i])}</td></tr></table>`).querySelector('tr'));
    });
    app.append(card);
  }

  const n = state.notifyResult;
  if (n?.native && !n.denied && !n.error) {
    app.append(h(`<p class="muted">${n.scheduled
      ? `${n.scheduled} notiser schemalagda, sista ${n.until.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}.`
      : 'Inga kommande notiser schemalagda.'}</p>`));
  }

  const list = Object.entries(state.schedules).sort(([a], [b]) => (a < b ? 1 : -1));
  if (list.length) {
    const card = h('<section class="card"><h2>Inlagda scheman</h2><ul class="list"></ul></section>');
    const ul = card.querySelector('ul');
    const labels = { current: 'Gäller nu', upcoming: 'Kommande', expired: 'Utgånget' };
    for (const [key, s] of list) {
      const st = scheduleStatus(s, today);
      const li = h(`<li><span>${monthLabel(s.year, s.month)}<br><span class="badge ${st}">${labels[st]}</span></span>
        <span class="row"><button class="secondary" data-a="edit">Visa</button><button class="danger" data-a="del">Ta bort</button></span></li>`);
      li.querySelector('[data-a=edit]').onclick = () => {
        state.draft = { year: s.year, month: s.month, days: s.days.map((r) => [...r]), flags: s.days.map(() => new Array(6).fill('ok')), existing: true };
        show('import');
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
    <p class="muted">Välj en bild eller skärmdump av moskéns schema. Appen läser av tiderna – du får granska dem innan de sparas.</p>
    <label class="file-pick"><input type="file" accept="image/*" />📷 Välj bild</label>
    <div class="progress" hidden><progress max="1" value="0"></progress><p class="muted msg"></p></div>
    <p class="muted" style="margin-top:16px">Tips: en rak, skarp bild där hela tabellen syns ger bäst resultat.</p>
    <button class="secondary" data-a="manual">Skriv in manuellt istället</button>
  </section>`);
  const input = card.querySelector('input');
  const prog = card.querySelector('.progress');
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    prog.hidden = false;
    card.querySelector('.file-pick').hidden = true;
    try {
      const { readSchedule } = await import('./ocr/recognize.js');
      const res = await readSchedule(file, (f, msg) => {
        prog.querySelector('progress').value = f;
        prog.querySelector('.msg').textContent = msg;
      });
      const now = nowInStockholm();
      state.draft = {
        year: res.year ?? now.year, month: res.month ?? now.month,
        monthDetected: res.year != null && res.month != null,
        days: res.days, flags: res.flags, image: URL.createObjectURL(file),
      };
      fitDraftToMonth();
      render();
    } catch (e) {
      prog.querySelector('.msg').textContent = `Kunde inte läsa bilden: ${e.message ?? e}`;
      card.querySelector('.file-pick').hidden = false;
    }
  };
  card.querySelector('[data-a=manual]').onclick = () => {
    const now = nowInStockholm();
    state.draft = { year: now.year, month: now.month, monthDetected: true, days: [], flags: [] };
    fitDraftToMonth();
    render();
  };
  app.append(card);
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
    </p>
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
  d.days.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.append(h(`<table><tr><td class="day">${WEEKDAYS_SV[weekday(d.year, d.month, i + 1)].slice(0, 3)} ${i + 1}</td></tr></table>`).querySelector('td'));
    row.forEach((v, c) => {
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.inputMode = 'numeric';
      inp.value = fmt(v);
      inp.className = d.flags[i][c] === 'ok' ? '' : d.flags[i][c];
      const commit = () => {
        let text = inp.value.trim();
        if (/^\d{3,4}$/.test(text)) text = `${text.slice(0, -2)}:${text.slice(-2)}`;
        let val = parseTime(text);
        if (val != null && c === 5 && val < 180) val += 1440; // Isha after midnight
        d.days[i][c] = val;
        d.flags[i][c] = 'ok';
        inp.value = val == null ? inp.value : fmt(val);
        inp.className = val == null ? 'invalid' : '';
        markRow(tr, i);
      };
      inp.onchange = commit;
      // Tapping into a red cell and leaving it counts as "checked".
      inp.onblur = () => { if (d.flags[i][c] === 'uncertain') commit(); };
      td.append(inp);
      tr.append(td);
    });
    tbody.append(tr);
    markRow(tr, i);
  });

  card.querySelector('[data-a=cancel]').onclick = () => { state.draft = null; render(); };
  card.querySelector('[data-a=save]').onclick = async () => {
    const issuesEl = card.querySelector('.issues');
    const uncertain = d.flags.flat().filter((f) => f === 'uncertain').length;
    const issues = validateSchedule(d);
    if (uncertain) issues.unshift(`${uncertain} tid${uncertain === 1 ? '' : 'er'} kunde inte läsas säkert (röda). Kontrollera dem mot bilden och tryck på varje röd ruta.`);
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
  };
  app.append(card);
}

function markRow(tr, i) {
  const bad = rowProblems(state.draft.days[i]);
  tr.querySelectorAll('input').forEach((inp, c) => {
    if (bad.includes(c)) inp.classList.add('invalid');
    else if (inp.classList.contains('invalid') && state.draft.days[i][c] != null) inp.classList.remove('invalid');
  });
}

// ---------------------------------------------------------------- settings

function renderSettings() {
  const s = state.settings;
  const card = h(`<div><section class="card"><h2>Notiser</h2><div class="prayers"></div>
    <div class="toggle"><span>Påminn i förväg</span>
      <select data-f="offset">${[0, 5, 10, 15, 20, 30].map((m) => `<option value="${m}" ${m === s.offset ? 'selected' : ''}>${m ? `${m} min innan` : 'Vid bönetiden'}</option>`).join('')}</select></div>
    <label class="toggle"><span>Påminn när schemat håller på att gå ut</span><input type="checkbox" data-f="reminders" ${s.reminders ? 'checked' : ''}/></label>
    <div class="row" style="margin-top:12px"><button class="secondary" data-a="test">Skicka testnotis</button><button class="secondary" data-a="exact">Exakta alarm</button></div>
    <p class="muted msg"></p>
  </section>
  <section class="card"><h2>Om notiserna</h2><p class="muted">
    Notiser skapas bara för datum som finns i ett inlagt schema. När ett schema gått ut skickas inga bönenotiser
    (så du aldrig får fel tider) – istället får du en påminnelse om att lägga in nästa månad.<br><br>
    Vissa telefoner (t.ex. OnePlus, Oppo, Xiaomi, Samsung) stänger av appar i bakgrunden för att spara batteri.
    Om notiser uteblir: ställ in batterioptimering för Salah-kalender till <b>Obegränsad / Tillåt</b>.
  </p></section></div>`);
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
  card.querySelector('[data-f=reminders]').onchange = (e) => { s.reminders = e.target.checked; persist(); };
  card.querySelector('[data-a=test]').onclick = async () => {
    msg.textContent = (await testNotification()) ? 'Testnotis kommer om 5 sekunder.' : 'Notiser fungerar bara i appen och kräver tillstånd.';
  };
  card.querySelector('[data-a=exact]').onclick = async () => { await openExactAlarmSettings(); await persist(); };
  app.append(card);
}

// ---------------------------------------------------------------- startup

async function init() {
  state.schedules = await loadSchedules();
  state.settings = await loadSettings();
  render();
  await refreshNotifications();
  render();
  App.addListener('appStateChange', async ({ isActive }) => {
    if (!isActive) return;
    await refreshNotifications();
    if (state.view === 'home') render();
  }).catch(() => {});
  setInterval(() => { if (state.view === 'home') render(); }, 30_000);
}

init();
