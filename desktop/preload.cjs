// Ponte segura entre a página do jogo e o processo principal (Steam, janela).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  steamName: () => ipcRenderer.invoke('steam:name'),
  achievement: (id) => ipcRenderer.invoke('steam:achievement', id),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  setFullscreen: (v) => ipcRenderer.invoke('window:setFullscreen', v),
  isFullscreen: () => ipcRenderer.invoke('window:isFullscreen'),
  quit: () => ipcRenderer.invoke('window:quit'),
  onFullscreen: (cb) => ipcRenderer.on('fullscreen', (_e, v) => cb(v)),
  saveFile: (name, content) => ipcRenderer.invoke('file:save', name, content),
  openFile: () => ipcRenderer.invoke('file:open'),
});
