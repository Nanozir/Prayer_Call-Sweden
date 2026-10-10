// Emergency estimate of prayer times when no mosque schedule is available.
//
// Prayer times follow the sun, so they can be computed from the sun's position
// over Karlstad. Each mosque uses its own conventions (twilight angles, Asr
// shadow length, safety minutes), so the model is calibrated against the
// mosque's own published schedules: we search the parameters that reproduce
// them best and apply those to the requested month. Still an estimate – the
// app always prefers a real schedule and labels estimated times clearly.

import { daysInMonth, isDst, monthKey, nowInStockholm } from './time.js';
import reference from './data/karlstad-reference.json' with { type: 'json' };

export const KARLSTAD = { lat: 59.3793, lon: 13.5036 };
const RAD = Math.PI / 180;

// Sun declination (deg) and equation of time (min) for a UTC date at noon (NOAA).
function sunPosition(year, month, day) {
  const jd = Date.UTC(year, month - 1, day, 12) / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c = Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) + Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) / RAD;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eot = 4 / RAD * (y * Math.sin(2 * l0 * RAD) - 2 * e * Math.sin(m * RAD)
    + 4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD)
    - 0.5 * y * y * Math.sin(4 * l0 * RAD) - 1.25 * e * e * Math.sin(2 * m * RAD));
  return { decl, eot };
}

// Hours between solar noon and the sun reaching `alt` degrees; NaN if never.
function hourAngle(alt, decl, lat) {
  const cos = (Math.sin(alt * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD))
    / (Math.cos(lat * RAD) * Math.cos(decl * RAD));
  return Math.abs(cos) > 1 ? NaN : Math.acos(cos) / RAD / 15;
}

// Raw astronomical events for one day, in minutes after midnight, Swedish
// standard time (UTC+1, no DST).
export function solarDay(year, month, day, params, loc = KARLSTAD) {
  const { decl, eot } = sunPosition(year, month, day);
  const noon = 720 - 4 * loc.lon - eot + 60;
  const rise = hourAngle(-0.833, decl, loc.lat) * 60;
  const night = 1440 - 2 * rise; // sunset → next sunrise
  const twilight = (angle, sign) => {
    const ha = hourAngle(-angle, decl, loc.lat) * 60;
    const portion = (angle / 60) * night; // high-latitude rule (angle-based)
    const t = Number.isNaN(ha) || ha - rise > portion ? rise + portion : ha;
    return noon + sign * t;
  };
  const asrAlt = Math.atan(1 / (params.asrFactor + Math.tan(Math.abs(loc.lat - decl) * RAD))) / RAD;
  return [
    twilight(params.fajrAngle, -1),
    noon - rise,
    noon,
    noon + hourAngle(asrAlt, decl, loc.lat) * 60,
    noon + rise,
    twilight(params.ishaAngle, 1),
  ];
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// Every stored day as {year, month, day, std: [6 minutes in standard time]}.
function observations(schedules) {
  const out = [];
  for (const s of Object.values(schedules)) {
    if (s.estimated) continue;
    s.days.forEach((row, i) => {
      if (row.some((v) => v == null)) return;
      const shift = isDst(s.year, s.month, i + 1) ? 60 : 0;
      out.push({ year: s.year, month: s.month, day: i + 1, std: row.map((v) => v - shift) });
    });
  }
  return out;
}

/** Finds the parameters that best reproduce the stored mosque schedules. */
export function calibrate(schedules) {
  const obs = observations(schedules);
  if (!obs.length) return null;
  const fit = (col, paramsFor, candidates) => {
    let best = null;
    for (const cand of candidates) {
      const p = paramsFor(cand);
      const res = obs.map((o) => o.std[col] - solarDay(o.year, o.month, o.day, p)[col]);
      const offset = Math.round(median(res));
      const err = res.reduce((a, r) => a + Math.abs(r - offset), 0) / res.length;
      if (!best || err < best.err) best = { cand, offset, err };
    }
    return best;
  };
  const angles = Array.from({ length: 61 }, (_, i) => 6 + i * 0.25); // 6°–21°
  const base = { fajrAngle: 18, ishaAngle: 17, asrFactor: 1 };
  const fajr = fit(0, (a) => ({ ...base, fajrAngle: a }), angles);
  const isha = fit(5, (a) => ({ ...base, ishaAngle: a }), angles);
  const asr = fit(3, (f) => ({ ...base, asrFactor: f }), [1, 2]);
  const fixed = [1, 2, 4].map((col) => fit(col, () => base, [0]));
  return {
    params: { fajrAngle: fajr.cand, ishaAngle: isha.cand, asrFactor: asr.cand },
    offsets: [fajr.offset, fixed[0].offset, fixed[1].offset, asr.offset, fixed[2].offset, isha.offset],
    meanError: [fajr.err, fixed[0].err, fixed[1].err, asr.err, fixed[2].err, isha.err],
    days: obs.length,
  };
}

/**
 * Builds an estimated schedule for a month. Prefers the same month of an
 * earlier year (times repeat almost exactly each year); otherwise uses the
 * calibrated sun model. Returns null when there is nothing to calibrate from.
 */
export function estimateMonth(schedules, year, month, fallbackSchedules = {}) {
  const n = daysInMonth(year, month);
  for (let back = 1; back <= 3; back++) {
    const prev = schedules[monthKey(year - back, month)];
    if (prev && !prev.estimated && prev.days.length >= n - 1) {
      const days = Array.from({ length: n }, (_, i) => {
        const src = prev.days[Math.min(i, prev.days.length - 1)];
        const from = isDst(year - back, month, Math.min(i + 1, prev.days.length)) ? 60 : 0;
        const to = isDst(year, month, i + 1) ? 60 : 0;
        return src.map((v) => (v == null ? null : v - from + to));
      });
      return { year, month, days, estimated: true, method: 'previous-year', basedOn: monthKey(year - back, month) };
    }
  }
  const cal = calibrate(schedules) ?? calibrate(fallbackSchedules);
  if (!cal) return null;
  const days = Array.from({ length: n }, (_, i) => {
    const raw = solarDay(year, month, i + 1, cal.params);
    const shift = isDst(year, month, i + 1) ? 60 : 0;
    return raw.map((v, c) => Math.round(v + cal.offsets[c]) + shift);
  });
  return { year, month, days, estimated: true, method: 'model', calibration: cal };
}

/**
 * Real schedules plus, when the estimate mode is on, estimated schedules for the
 * current and next month if the mosque's own are missing. Real ones always win.
 */
export function withEstimates(schedules, settings, today = nowInStockholm()) {
  if (!settings?.estimate) return schedules;
  const out = { ...schedules };
  let { year, month } = today;
  for (let k = 0; k < 2; k++) {
    const key = monthKey(year, month);
    if (!out[key]) {
      const est = estimateMonth(schedules, year, month, reference.schedules);
      if (est) out[key] = est;
    }
    if (month === 12) { year++; month = 1; } else month++;
  }
  return out;
}
