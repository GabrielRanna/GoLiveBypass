import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('golive', {
  pickConf:       () => ipcRenderer.invoke('golive:pick-conf'),
  importConfig:   (rawText: string) => ipcRenderer.invoke('golive', 'config:import', { rawText }),
  activate:       () => ipcRenderer.invoke('golive', 'tunnel:activate'),
  deactivate:     () => ipcRenderer.invoke('golive', 'tunnel:deactivate'),
  status:         () => ipcRenderer.invoke('golive', 'tunnel:status'),
  fetchProton:    (username: string, password: string) =>
                    ipcRenderer.invoke('golive', 'proton:fetch', { username, password }),
  installVencord: () => ipcRenderer.invoke('golive', 'vencord:install'),
  vencordStatus:  () => ipcRenderer.invoke('golive', 'vencord:status'),
  checkUpdate:    () => ipcRenderer.invoke('golive', 'app:checkUpdate'),
  downloadUpdate: (url: string) => ipcRenderer.invoke('golive', 'app:downloadUpdate', { url }),

  onLog:             (cb: (m: string) => void) => ipcRenderer.on('log', (_e, m) => cb(m)),
  onProtonProgress:  (cb: (m: string) => void) => ipcRenderer.on('proton:progress', (_e, m) => cb(m)),
  onVencordProgress: (cb: (m: string) => void) => ipcRenderer.on('vencord:progress', (_e, m) => cb(m)),
  onUpdateAvailable: (cb: (info: any) => void) => ipcRenderer.on('update:available', (_e, i) => cb(i)),
  onUpdateProgress:  (cb: (m: string) => void) => ipcRenderer.on('update:progress', (_e, m) => cb(m)),
});
