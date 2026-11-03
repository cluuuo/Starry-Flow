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
  getStorageInfo: () => ipcRenderer.invoke('storage:get'),
  openStoragePath: (kind) => ipcRenderer.invoke('storage:open', kind),
  chooseStorageDir: (kind) => ipcRenderer.invoke('storage:choose', kind),
  resetStorageDir: (kind) => ipcRenderer.invoke('storage:reset', kind),
  restartApp: () => ipcRenderer.send('app:restart'),
  getMarks: () => ipcRenderer.invoke('marks:get'),
  setMarks: (marks) => ipcRenderer.invoke('marks:set', marks),
  saveMarkImage: (payload) => ipcRenderer.invoke('marks:saveImage', payload),
  readMarkImage: (file) => ipcRenderer.invoke('marks:readImage', file),
  deleteMarkImage: (file) => ipcRenderer.invoke('marks:deleteImage', file),
  saveMarkImageAs: (payload) => ipcRenderer.invoke('marks:saveAs', payload),
  getAchievements: () => ipcRenderer.invoke('achievements:get'),
  setAchievements: (data) => ipcRenderer.invoke('achievements:set', data),
  // WebDAV 云备份：配置只保存地址与账号，密码由主进程加密落盘
  getWebdavConfig: () => ipcRenderer.invoke('webdav:get'),
  testWebdav: (cfg) => ipcRenderer.invoke('webdav:test', cfg),
  uploadWebdav: (cfg) => ipcRenderer.invoke('webdav:upload', cfg),
  listWebdav: () => ipcRenderer.invoke('webdav:list'),
  restoreWebdav: (name) => ipcRenderer.invoke('webdav:restore', name),
  windowControl: (action) => ipcRenderer.send('window:control', action),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  getWindowMode: () => ipcRenderer.invoke('window:get-mode'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  setWindowMode: (mode) => ipcRenderer.invoke('window:set-mode', mode),
  onWindowMode: (cb) => {
    const handler = (_event, mode) => cb(mode);
    ipcRenderer.on('window:mode', handler);
    return () => ipcRenderer.removeListener('window:mode', handler);
  },
  miniDragStart: () => ipcRenderer.send('mini:drag-start'),
  miniDragMove: () => ipcRenderer.send('mini:drag-move'),
  miniDragEnd: () => ipcRenderer.send('mini:drag-end'),
  activateMini: () => ipcRenderer.send('mini:activate'),
  onWindowMaximized: (cb) => {
    const handler = (_event, maximized) => cb(maximized);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  }
});
