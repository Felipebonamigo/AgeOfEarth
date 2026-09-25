// Processo principal do Electron: janela do jogo, tela cheia, integração opcional com Steamworks.
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

let steam = null;
function initSteam() {
  try {
    // steamworks.js: precisa do steam_appid.txt ao lado do executável em desenvolvimento e do cliente Steam aberto.
    const sw = require('steamworks.js');
    steam = sw.init();
    console.log('Steam:', steam.localplayer.getName());
  } catch (e) {
    console.log('Steamworks indisponível (rodando fora da Steam):', e.message);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 640,
    title: 'Age of Earth', backgroundColor: '#0b1020', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => { win.show(); if (app.isPackaged) win.setFullScreen(true); });
  win.loadFile(path.join(__dirname, app.isPackaged ? 'app/index.html' : '../dist/index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));
}

ipcMain.handle('steam:name', () => (steam ? steam.localplayer.getName() : null));
ipcMain.handle('steam:achievement', (_e, id) => { try { if (steam) { steam.achievement.activate(id); return true; } } catch { /* ignore */ } return false; });
ipcMain.handle('window:toggleFullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!w.isFullScreen()); });
ipcMain.handle('window:quit', () => app.quit());
ipcMain.handle('file:save', async (e, name, content) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(w, { defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'Age of Earth', extensions: ['aoe.json', 'json'] }] });
  if (r.canceled || !r.filePath) return false;
  await fs.writeFile(r.filePath, content, 'utf8');
  return true;
});
ipcMain.handle('file:open', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(w, { properties: ['openFile'], filters: [{ name: 'Age of Earth', extensions: ['json'] }] });
  if (r.canceled || r.filePaths.length === 0) return null;
  return fs.readFile(r.filePaths[0], 'utf8');
});

app.whenReady().then(() => {
  initSteam();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
