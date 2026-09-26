// Processo principal do Electron: janela do jogo, tela cheia, integração opcional com Steamworks.
const { app, BrowserWindow, ipcMain, shell, dialog, protocol, net, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const cloud = require('./cloud.cjs');

// O jogo é servido por um protocolo próprio (app://game/…) em vez de file://: o fetch dos atlas de arte e do
// manifesto (public/art) não funciona em file://, e uma origem fixa mantém o localStorage (saves, opções) estável.
const GAME_DIR = app.isPackaged ? path.join(process.resourcesPath, 'game') : path.join(__dirname, '..', 'dist');
// Perfil fixo (localStorage, opções e a pasta saves/ do Steam Cloud): %APPDATA%\age-of-earth-desktop no Windows,
// ~/.config/age-of-earth-desktop no Linux, ~/Library/Application Support/age-of-earth-desktop no macOS. É o nome que o
// Electron já usava (o "name" do package.json); fixado aqui para que mudar o package.json nunca "perca" os saves nem
// desalinhe o caminho cadastrado no Steam Auto-Cloud (docs/STEAM.md §4). Não mude.
app.setPath('userData', path.join(app.getPath('appData'), 'age-of-earth-desktop'));
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

function serveGame() {
  const root = path.resolve(GAME_DIR);
  protocol.handle('app', (req) => {
    let file;
    try { const { pathname } = new URL(req.url); file = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname)); }
    catch { return new Response('bad request', { status: 400 }); }
    // nada fora da pasta do jogo
    if (file !== root && !file.startsWith(root + path.sep)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

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
    // spellcheck: false — sem corretor, o Chromium não baixa o dicionário (redirector.gvt1.com) ao abrir (docs/LEGAL.md §1.4)
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => { win.show(); });   // tela cheia é decidida pelo jogo (opções salvas)
  win.loadURL('app://game/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));
}

ipcMain.handle('steam:name', () => (steam ? steam.localplayer.getName() : null));
ipcMain.handle('steam:achievement', (_e, id) => { try { if (steam) { steam.achievement.activate(id); return true; } } catch { /* ignore */ } return false; });
// Rich Presence: texto de status visível aos amigos na Steam ("No menu", "Idade Heroica · 12 min"…)
ipcMain.handle('steam:presence', (_e, status) => { try { if (steam && steam.localplayer.setRichPresence) { steam.localplayer.setRichPresence('status', String(status).slice(0, 120)); steam.localplayer.setRichPresence('steam_display', '#Status'); return true; } } catch { /* ignore */ } return false; });
ipcMain.handle('window:toggleFullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!w.isFullScreen()); });
ipcMain.handle('window:setFullscreen', (e, v) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!!v); });
ipcMain.handle('window:isFullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender); return w ? w.isFullScreen() : false; });
ipcMain.handle('window:quit', () => app.quit());
ipcMain.handle('file:save', async (e, name, content) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(w, { defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'Age of Earth', extensions: ['aoe.json', 'json'] }] });
  if (r.canceled || !r.filePath) return false;
  await fs.writeFile(r.filePath, content, 'utf8');
  return true;
});
// Espelho dos saves em arquivos (Steam Auto-Cloud sincroniza esta pasta; docs/STEAM.md §4): só chaves da lista fixa de
// cloud.cjs, texto de até 16 MB, nome do arquivo derivado da chave (a página nunca escolhe caminho).
const savesDir = () => path.join(app.getPath('userData'), 'saves');
const fromGame = (e) => { try { return new URL(e.senderFrame?.url ?? '').protocol === 'app:'; } catch { return false; } };
ipcMain.handle('cloud:readAll', (e) => (fromGame(e) ? cloud.readAll(savesDir()) : {}));
ipcMain.handle('cloud:write', (e, key, value) => fromGame(e) && cloud.write(savesDir(), key, value));
ipcMain.handle('cloud:remove', (e, key) => fromGame(e) && cloud.remove(savesDir(), key));
ipcMain.handle('file:open', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(w, { properties: ['openFile'], filters: [{ name: 'Age of Earth', extensions: ['json'] }] });
  if (r.canceled || r.filePaths.length === 0) return null;
  return fs.readFile(r.filePaths[0], 'utf8');
});

app.whenReady().then(() => {
  // Nenhum pedido de rede fora do jogo e do servidor de multiplayer escolhido (docs/LEGAL.md §1.4): o corretor ortográfico
  // do Chromium vem ligado no Electron e baixa da Google o dicionário do idioma do sistema a cada abertura. Desligar não
  // basta (o download sai mesmo assim): a lista de idiomas vazia é o que o impede (no macOS o corretor é o do sistema).
  session.defaultSession.setSpellCheckerEnabled(false);
  session.defaultSession.setSpellCheckerLanguages([]);
  serveGame();
  initSteam();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
