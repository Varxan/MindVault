'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Add 'is-electron' class to <html> so CSS can target Electron-specific styles
// (e.g. drag regions, traffic-light padding) without affecting browser usage
document.documentElement.classList.add('is-electron');

// Expose minimal Electron info to the renderer.
// Menu → renderer communication uses executeJavaScript + CustomEvent (in main.js)
// instead of IPC, because contextIsolation separates the preload and renderer
// JavaScript worlds — events dispatched from preload are invisible to React.
contextBridge.exposeInMainWorld('electron', {
  version:  process.versions.electron,
  platform: process.platform,
  // License activation (trial → licensed)
  activateLicense: (key) => ipcRenderer.invoke('activation:activateLicenseExpired', key),
  // Download
  getDownloadFolder: () => ipcRenderer.invoke('download:getFolder'),
});
