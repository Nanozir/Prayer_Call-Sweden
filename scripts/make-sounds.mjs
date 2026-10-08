// Generates the app's notification sounds (soft bell tones, no recordings needed).
// They are mastered quietly (peak about -18 dBFS) so they never blast, even at a
// high notification volume. Output: Android res/raw (for notification channels)
// and public/sounds (for the preview buttons in the app).
import { mkdirSync, writeFileSync } from 'node:fs';

const RATE = 44100;
const PEAK = 0.125; // -18 dBFS

function bell(buf, start, freq, dur, gain = 1) {
  const partials = [[1, 1], [2.01, 0.35], [3.0, 0.12], [4.2, 0.05]];
  const s0 = Math.round(start * RATE);
  for (let i = 0; i < dur * RATE && s0 + i < buf.length; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.008);
    let v = 0;
    for (const [mult, amp] of partials) v += amp * Math.exp(-t * (1.6 + mult)) * Math.sin(2 * Math.PI * freq * mult * t);
    buf[s0 + i] += gain * attack * v;
  }
}

function render(seconds, notes) {
  const buf = new Float64Array(Math.round(seconds * RATE));
  for (const n of notes) bell(buf, ...n);
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  const fadeFrom = buf.length - Math.round(0.3 * RATE);
  return buf.map((v, i) => (v / (max || 1)) * PEAK * (i > fadeFrom ? (buf.length - i) / (buf.length - fadeFrom) : 1));
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const sounds = {
  // Short, soft two-note chime – used for "in X minutes" reminders and the short option.
  salah_chime: render(2.2, [[0, 659.25, 2.2], [0.28, 523.25, 1.9]]),
  // Calm four-note bell motif (~5 s) – used at the prayer time.
  salah_bells: render(5.5, [[0, 587.33, 2.5], [0.55, 440, 2.5], [1.1, 493.88, 2.5], [1.75, 587.33, 3.75, 1.1]]),
  // Silence: lets a channel show heads-up notifications without any sound.
  salah_silent: new Float64Array(Math.round(0.2 * RATE)),
};

for (const dir of ['android/app/src/main/res/raw', 'public/sounds']) {
  mkdirSync(dir, { recursive: true });
  for (const [name, samples] of Object.entries(sounds)) writeFileSync(`${dir}/${name}.wav`, wav(samples));
}
console.log('Sounds written:', Object.keys(sounds).join(', '));
