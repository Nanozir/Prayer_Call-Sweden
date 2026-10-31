'use strict';
const FILES = { adhan: 'salah_adhan.ogg', bells: 'salah_bells.wav', chime: 'salah_chime.wav' };
let current = null;

window.soundApi.onPlay((name) => {
  const file = FILES[name];
  if (!file) return;
  if (current) current.pause();
  current = new Audio('/sounds/' + file);
  current.play().catch(() => {});
});
