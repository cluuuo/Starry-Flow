const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  readMonitorData: () => ipcRenderer.invoke('monitor:read'),
  getMonitorPath: () => ipcRenderer.invoke('monitor:path'),
  getFocusState: () => ipcRenderer.invoke('focus:read'),
  getFocusPath: () => ipcRenderer.invoke('focus:path'),
  sendFocusCommand: (action, payload) => ipcRenderer.invoke('focus:command', { action, payload }),
  getProcessIcon: (exePath) => ipcRenderer.invoke('process:icon', exePath),
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  getMarks: () => ipcRenderer.invoke('marks:get'),
  setMarks: (marks) => ipcRenderer.invoke('marks:set', marks),
  saveMarkImage: (payload) => ipcRenderer.invoke('marks:saveImage', payload),
  readMarkImage: (file) => ipcRenderer.invoke('marks:readImage', file),
  deleteMarkImage: (file) => ipcRenderer.invoke('marks:deleteImage', file),
  saveMarkImageAs: (payload) => ipcRenderer.invoke('marks:saveAs', payload)
});
