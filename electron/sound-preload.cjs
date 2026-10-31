'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('soundApi', {
  onPlay: (cb) => ipcRenderer.on('sound:play', (_e, name) => cb(name)),
});
