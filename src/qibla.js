// Qibla direction from Karlstad – fixed coordinates, so no location permission.
import { KARLSTAD } from './estimate.js';

export const KAABA = { lat: 21.422487, lon: 39.826206 };
// Magnetic declination in Karlstad (WMM, 2026): compass needles point ~5° east of true north.
export const DECLINATION_KARLSTAD = 5;

const RAD = Math.PI / 180;

/** Initial great-circle bearing in degrees clockwise from true north. */
export function qiblaBearing(from = KARLSTAD, to = KAABA) {
  const φ1 = from.lat * RAD, φ2 = to.lat * RAD, Δλ = (to.lon - from.lon) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** Great-circle distance in km. */
export function distanceKm(from = KARLSTAD, to = KAABA) {
  const φ1 = from.lat * RAD, φ2 = to.lat * RAD;
  const a = Math.sin(((to.lat - from.lat) * RAD) / 2) ** 2
    + Math.cos(φ1) * Math.cos(φ2) * Math.sin(((to.lon - from.lon) * RAD) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Phone heading in degrees from TRUE north from a DeviceOrientation event, or null.
 * iPhone: webkitCompassHeading (magnetic, clockwise). Android: absolute alpha
 * (counter-clockwise, relative to magnetic north on most phones).
 */
export function headingFromEvent(e, screenAngle = 0) {
  let magnetic = null;
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
    magnetic = e.webkitCompassHeading;
  } else if (e.absolute && typeof e.alpha === 'number') {
    magnetic = 360 - e.alpha;
  }
  if (magnetic == null) return null;
  return (magnetic + DECLINATION_KARLSTAD + screenAngle + 720) % 360;
}

/** How far (degrees, −180…180) the phone must turn to face the Qibla; + = turn right. */
export function turnBy(heading, bearing = qiblaBearing()) {
  return ((bearing - heading + 540) % 360) - 180;
}

export function compassWord(deg) {
  const words = ['norr', 'nordost', 'öster', 'sydost', 'söder', 'sydväst', 'väster', 'nordväst'];
  return words[Math.round(deg / 45) % 8];
}
