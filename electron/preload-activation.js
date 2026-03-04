'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose activation API to the activation window renderer
contextBridge.exposeInMainWorld('activationAPI', {
  // Get which screen to show based on current state
  getActivationState: () => ipcRenderer.invoke('activation:getState'),

  // Start 30-day trial with email + password (new user)
  startTrial: (email, password) => ipcRenderer.invoke('activation:startTrial', email, password),

  // Sign in with email + password (returning user / second device)
  signIn: (email, password) => ipcRenderer.invoke('activation:signIn', email, password),

  // Activate with license key (from license screen)
  activateLicense: (email, key) => ipcRenderer.invoke('activation:activateLicense', email, key),

  // Activate with license key (from expired screen — email already stored)
  activateLicenseExpired: (key) => ipcRenderer.invoke('activation:activateLicenseExpired', key),

  // Tell main process to close activation window and open main app
  launchApp: () => ipcRenderer.send('activation:launch'),
});
