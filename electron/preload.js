'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Add 'is-electron' class to <html> so CSS can target Electron-specific styles
// (e.g. drag regions, traffic-light padding) without affecting browser usage
document.documentElement.classList.add('is-electron');

// Expose minimal Electron info to the renderer
contextBridge.exposeInMainWorld('electron', {
  version:  process.versions.electron,
  platform: process.platform,
  // Menu → renderer events
  onShowOnboarding:        (cb) => ipcRenderer.on('show-onboarding', cb),
  offShowOnboarding:       (cb) => ipcRenderer.removeListener('show-onboarding', cb),
  onShowLicenseActivation: (cb) => ipcRenderer.on('show-license-activation', cb),
  offShowLicenseActivation:(cb) => ipcRenderer.removeListener('show-license-activation', cb),
  // License activation (trial → licensed)
  activateLicense: (key) => ipcRenderer.invoke('activation:activateLicenseExpired', key),
});
