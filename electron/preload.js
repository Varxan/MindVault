'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Add 'is-electron' class to <html> so CSS can target Electron-specific styles
// (e.g. drag regions, traffic-light padding) without affecting browser usage
document.documentElement.classList.add('is-electron');

// IPC → Custom DOM Events
// contextBridge cannot reliably return functions, so we dispatch native DOM
// CustomEvents that the renderer can listen to with window.addEventListener.
// This sidesteps contextBridge serialisation entirely.
ipcRenderer.on('show-onboarding', () => {
  window.dispatchEvent(new CustomEvent('mv:show-onboarding'));
});

ipcRenderer.on('show-license-activation', () => {
  window.dispatchEvent(new CustomEvent('mv:show-license-activation'));
});

// Expose minimal Electron info to the renderer
contextBridge.exposeInMainWorld('electron', {
  version:  process.versions.electron,
  platform: process.platform,
  // License activation (trial → licensed)
  activateLicense: (key) => ipcRenderer.invoke('activation:activateLicenseExpired', key),
});
