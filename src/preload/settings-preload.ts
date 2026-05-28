import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('combrief', {
  listApps: () => ipcRenderer.invoke('apps:list'),
  installApp: (id: string) => ipcRenderer.invoke('apps:install', id),
  uninstallApp: (id: string) => ipcRenderer.invoke('apps:uninstall', id),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch: object) => ipcRenderer.invoke('config:set', patch),
  getMessages: () => ipcRenderer.invoke('i18n:messages'),
});
