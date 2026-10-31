'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alarmApi', {
  onInit: (cb) => ipcRenderer.on('alarm:init', (_e, data) => cb(data)),
  dismiss: () => ipcRenderer.send('alarm:dismiss'),
  snooze: () => ipcRenderer.send('alarm:snooze'),
});
