// Ponte segura entre a página do jogo e o processo principal (Steam, janela).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  steamName: () => ipcRenderer.invoke('steam:name'),
  achievement: (id) => ipcRenderer.invoke('steam:achievement', id),
  presence: (status) => ipcRenderer.invoke('steam:presence', status),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  setFullscreen: (v) => ipcRenderer.invoke('window:setFullscreen', v),
  isFullscreen: () => ipcRenderer.invoke('window:isFullscreen'),
  quit: () => ipcRenderer.invoke('window:quit'),
  onFullscreen: (cb) => ipcRenderer.on('fullscreen', (_e, v) => cb(v)),
  saveFile: (name, content) => ipcRenderer.invoke('file:save', name, content),
  openFile: () => ipcRenderer.invoke('file:open'),
  // Espelho dos saves (Steam Cloud): só as três operações, por chave; o processo principal confere a chave e o tamanho.
  cloudReadAll: () => ipcRenderer.invoke('cloud:readAll'),
  cloudWrite: (key, value) => (typeof key === 'string' && typeof value === 'string' ? ipcRenderer.invoke('cloud:write', key, value) : Promise.resolve(false)),
  cloudRemove: (key) => (typeof key === 'string' ? ipcRenderer.invoke('cloud:remove', key) : Promise.resolve(false)),
});
