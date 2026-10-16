import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qiblaBearing, distanceKm, headingFromEvent, turnBy, compassWord } from '../src/qibla.js';

test('Qibla from Karlstad is south-east, about 142°', () => {
  const b = qiblaBearing();
  assert.ok(b > 141 && b < 143.5, `bearing ${b}`);
  assert.equal(compassWord(b), 'sydost');
});

test('cross-check: published Qibla for Stockholm (~148°), London (~119°) and Jakarta (~295°)', () => {
  assert.ok(Math.abs(qiblaBearing({ lat: 59.3293, lon: 18.0686 }) - 148.2) < 1);
  assert.ok(Math.abs(qiblaBearing({ lat: 51.5074, lon: -0.1278 }) - 118.99) < 1);
  assert.ok(Math.abs(qiblaBearing({ lat: -6.2088, lon: 106.8456 }) - 295.15) < 1);
});

test('distance Karlstad–Mecka is roughly 4 700 km', () => {
  const d = distanceKm();
  assert.ok(d > 4600 && d < 4800, `${d}`);
});

test('heading from iPhone and Android events, incl. declination', () => {
  assert.equal(headingFromEvent({ webkitCompassHeading: 90 }), 95);
  assert.equal(headingFromEvent({ absolute: true, alpha: 270 }), 95); // 360-270 = 90 magnetic
  assert.equal(headingFromEvent({ absolute: false, alpha: 10 }), null);
});

test('turn direction', () => {
  assert.equal(turnBy(100, 142), 42);
  assert.equal(turnBy(170, 142), -28);
  assert.equal(turnBy(350, 10), 20);
});
