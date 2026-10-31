'use strict';
// Pure timing logic (no electron imports): sorted list of items, due/missed handling.
const GRACE_MS = 2 * 60 * 1000;
const MAX_WAIT_MS = 60 * 1000;
const SNOOZE_MS = 5 * 60 * 1000;

const KINDS = ['prayer', 'before', 'info', 'alarm'];
const SOUNDS = ['adhan', 'bells', 'chime', 'off'];

function clean(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const it of items) {
    if (!it || !Number.isFinite(it.at)) continue;
    out.push({
      id: Number.isFinite(it.id) ? it.id : Math.round(it.at),
      at: Math.round(it.at),
      kind: KINDS.includes(it.kind) ? it.kind : 'info',
      title: String(it.title ?? '').slice(0, 200),
      body: String(it.body ?? '').slice(0, 500),
      sound: SOUNDS.includes(it.sound) ? it.sound : 'off',
    });
  }
  return out.sort((a, b) => a.at - b.at || a.id - b.id);
}

class Scheduler {
  constructor(items = []) { this.items = clean(items); }

  // Replaces everything; returns the number of items kept.
  replace(items) { this.items = clean(items); return this.items.length; }

  clear() { this.items = []; }

  add(item) { this.items = clean([...this.items, item]); }

  snooze(item, now, ms = SNOOZE_MS) { this.add({ ...item, at: now + ms }); }

  // Removes and returns the items that should fire at `now`; items older than the grace period are dropped silently.
  due(now, grace = GRACE_MS) {
    const fire = [];
    let i = 0;
    while (i < this.items.length && this.items[i].at <= now) {
      if (now - this.items[i].at <= grace) fire.push(this.items[i]);
      i++;
    }
    this.items.splice(0, i);
    return fire;
  }

  // Milliseconds until the next item, clamped to [0, MAX_WAIT_MS]; null when empty.
  nextDelay(now, max = MAX_WAIT_MS) {
    if (!this.items.length) return null;
    return Math.min(Math.max(this.items[0].at - now, 0), max);
  }

  // Items still in the future or inside the grace period (for persisting).
  pending(now, grace = GRACE_MS) { return this.items.filter((it) => it.at >= now - grace); }
}

module.exports = { Scheduler, clean, GRACE_MS, MAX_WAIT_MS, SNOOZE_MS };
