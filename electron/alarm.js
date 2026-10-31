'use strict';
const audio = new Audio('/sounds/salah_adhan.ogg');
audio.loop = true;

function stop() { audio.pause(); }

window.alarmApi.onInit((data) => {
  document.getElementById('title').textContent = data.title;
  document.getElementById('body').textContent = data.body;
  document.title = data.title;
  audio.play().catch(() => {});
});

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dismiss').addEventListener('click', () => { stop(); window.alarmApi.dismiss(); });
  document.getElementById('snooze').addEventListener('click', () => { stop(); window.alarmApi.snooze(); });
  document.getElementById('dismiss').focus();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Enter') {
    e.preventDefault();
    stop();
    window.alarmApi.dismiss();
  }
});
