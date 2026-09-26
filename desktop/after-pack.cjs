// Gancho afterPack do electron-builder (roda na máquina da build, não vai no pacote).
// O Electron traz por padrão uma libffmpeg compilada com codecs proprietários (decodificadores H.264 e AAC), cobertos por
// patentes e que o jogo não usa (o áudio é sintetizado pelo Web Audio; não há vídeo). Cada release do Electron publica
// também a versão sem eles (ffmpeg-v<versão>-<plataforma>-<arq>.zip, só MP3/Vorbis/Opus/FLAC/PCM…): este gancho a baixa
// (cache em ~/.cache/electron, SHASUMS256 conferido pelo @electron/get) e troca a biblioteca antes da assinatura.
// docs/THIRD_PARTY.md e a tela Créditos dizem "sem codecs proprietários"; scripts/playtest-desktop.mjs confere o binário.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
const { Arch } = require('electron-builder');

const LIB = { linux: 'libffmpeg.so', win32: 'ffmpeg.dll', darwin: 'libffmpeg.dylib', mas: 'libffmpeg.dylib' };

function libPath(ctx) {
  const p = ctx.electronPlatformName;
  if (p === 'darwin' || p === 'mas') {
    return path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Libraries', LIB[p]);
  }
  return path.join(ctx.appOutDir, LIB[p]);
}

module.exports = async function afterPack(ctx) {
  const platform = ctx.electronPlatformName;
  const arch = Arch[ctx.arch];
  if (!LIB[platform] || arch === 'universal') throw new Error(`after-pack: plataforma/arquitetura sem libffmpeg conhecida (${platform}/${arch})`);
  const version = require('electron/package.json').version;
  const dst = libPath(ctx);
  if (!fs.existsSync(dst)) throw new Error(`after-pack: ${dst} não existe (o Electron mudou o lugar da libffmpeg?)`);
  const zip = await downloadArtifact({ version, artifactName: 'ffmpeg', platform, arch });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aoe-ffmpeg-'));
  try {
    await extract(zip, { dir: tmp });
    const src = path.join(tmp, LIB[platform]);
    if (!fs.existsSync(src)) throw new Error(`after-pack: ${path.basename(zip)} sem ${LIB[platform]}`);
    fs.copyFileSync(src, dst);
    console.log(`  • after-pack: ${LIB[platform]} trocada pela versão sem codecs proprietários (${path.basename(zip)})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};
