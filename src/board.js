// "Moskétavla": the day shown like the screen in the mosque – live clock, the five
// prayers as tiles with iqamah offsets, Shuruk and Jumua at the top.

import { PRAYERS, fmt } from './time.js';

// The five prayers on the board (Shuruk is shown separately), as PRAYERS indexes.
export const BOARD_PRAYERS = [0, 2, 3, 4, 5];

const duration = (min) => {
  const hh = Math.floor(min / 60), mm = min % 60;
  return hh ? `${hh} h ${mm} min` : `${mm} min`;
};

/**
 * What the board highlights at `now` (minutes, Stockholm) for a day `row`:
 * { next: PRAYERS index of the next prayer or null, line: text under the clock }.
 * Between adhan and iqamah the line counts down to the iqamah instead.
 */
export function boardStatus(row, now, iqamah) {
  for (let k = 0; k < BOARD_PRAYERS.length; k++) {
    const i = BOARD_PRAYERS[k];
    const adhan = row[i], iq = adhan + (iqamah[k] ?? 0);
    if (adhan <= now && now < iq) {
      return { next: i, line: `Iqamah ${PRAYERS[i].name} om ${duration(iq - now)}`, iqamahSoon: true };
    }
    if (adhan > now) return { next: i, line: `${PRAYERS[i].name} om ${duration(adhan - now)}`, iqamahSoon: false };
  }
  return { next: null, line: 'Dagens böner är klara', iqamahSoon: false };
}

/**
 * HTML for the board. `clock` is shown for today (live), otherwise the date is the headline.
 * opts: { row, now (minutes or null when not today), iqamah, jumua, isFriday, dateText, hijri, badge }
 */
export function boardHtml({ row, now, iqamah, jumua, isFriday, dateText, hijri, badge = '' }) {
  const status = now == null ? { next: null, line: '' } : boardStatus(row, now, iqamah);
  const tiles = BOARD_PRAYERS.map((i, k) => {
    const off = iqamah[k] ?? 0;
    const cls = status.next === i ? ' next' : now != null && row[i] <= now ? ' past' : '';
    return `<div class="tile${cls}"${status.next === i ? ' aria-current="true"' : ''}>
      <span class="t-name">${PRAYERS[i].name}</span>
      <span class="t-time">${fmt(row[i])}</span>
      <span class="t-iq" aria-label="Iqamah ${off ? `${off} minuter efter` : 'direkt'}">${off ? `+${off}` : '+0'}</span>
    </div>`;
  }).join('');
  return `<section class="board" aria-label="Moskétavla">
    <div class="board-top">
      <div class="board-side"><span class="bs-label">Shuruk</span><span class="bs-time">${fmt(row[1])}</span></div>
      <div class="board-center">
        <div class="board-mosque">Karlstads moské</div>
        ${now != null ? '<div class="board-clock" data-clock aria-hidden="true">--:--:--</div>' : ''}
        <div class="board-date">${dateText}${badge}</div>
        ${hijri ? `<div class="board-hijri">${hijri}</div>` : ''}
      </div>
      <div class="board-side right">${jumua != null
    ? `<span class="bs-label">Jumua</span><span class="bs-time${isFriday ? ' today' : ''}">${fmt(jumua)}</span>` : ''}</div>
    </div>
    ${status.line ? `<div class="board-next${status.iqamahSoon ? ' iqamah' : ''}" role="status">${status.line}</div>` : ''}
    <div class="board-tiles">${tiles}</div>
  </section>`;
}
