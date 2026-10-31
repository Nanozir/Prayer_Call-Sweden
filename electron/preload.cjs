'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const arg = process.argv.find((a) => a.startsWith('--salah-version='));

contextBridge.exposeInMainWorld('salahDesktop', {
  isDesktop: true,
  version: arg ? arg.slice('--salah-version='.length) : '',
  schedule: (items) => ipcRenderer.invoke('salah:schedule', items),
  cancelAll: () => ipcRenderer.invoke('salah:cancel-all'),
  testNotification: () => ipcRenderer.invoke('salah:test'),
  getAutoStart: () => ipcRenderer.invoke('salah:get-autostart'),
  setAutoStart: (on) => ipcRenderer.invoke('salah:set-autostart', !!on),
});
