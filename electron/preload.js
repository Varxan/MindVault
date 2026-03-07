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
  // Wrap callbacks inside preload so contextBridge isolation doesn't swallow them
  onShowOnboarding: (cb) => {
    const wrapped = () => cb();
    ipcRenderer.on('show-onboarding', wrapped);
    return wrapped; // return so the caller can remove it
  },
  offShowOnboarding: (wrapped) => ipcRenderer.removeListener('show-onboarding', wrapped),
  onShowLicenseActivation: (cb) => {
    const wrapped = () => cb();
    ipcRenderer.on('show-license-activation', wrapped);
    return wrapped;
  },
  offShowLicenseActivation: (wrapped) => ipcRenderer.removeListener('show-license-activation', wrapped),
  // License activation (trial → licensed)
  activateLicense: (key) => ipcRenderer.invoke('activation:activateLicenseExpired', key),
});
