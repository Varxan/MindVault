'use strict';

const { contextBridge } = require('electron');

// Add 'is-electron' class to <html> so CSS can target Electron-specific styles
// (e.g. drag regions, traffic-light padding) without affecting browser usage
document.documentElement.classList.add('is-electron');

// Expose minimal Electron info to the renderer
contextBridge.exposeInMainWorld('electron', {
  version:  process.versions.electron,
  platform: process.platform,
});
