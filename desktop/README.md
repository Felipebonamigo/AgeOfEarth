# Age of Earth — build desktop (Electron) para Steam

O jogo é uma aplicação web (TypeScript + PixiJS) empacotada com Electron, o mesmo caminho usado por jogos como
Vampire Survivors (versões iniciais) e CrossCode na Steam.

## Gerar o executável

```bash
# 1) na raiz do projeto, gere a versão de produção do jogo
npm install && npm run build

# 2) na pasta desktop, instale o Electron e gere o pacote
cd desktop
npm install
npm start            # testa a janela do jogo
npm run dist:win     # release/win-unpacked/Age of Earth.exe
npm run dist:linux   # release/linux-unpacked/age-of-earth
```

O jogo (`../dist`) vai como recurso extra em `resources/game/` e é servido pelo protocolo próprio `app://game/…`
(registrado em `main.cjs`): o `fetch` dos atlas de arte e do manifesto (`public/art`) não funciona em `file://`, e a
origem fixa mantém o `localStorage` (saves e opções) entre versões. Caminhos fora da pasta do jogo respondem 403.

### Testar a build pronta (sem monitor)

```bash
# na raiz do projeto, depois do dist:linux
xvfb-run -a node scripts/playtest-desktop.mjs [desktop/release/linux-unpacked/age-of-earth] [captura.png]
```

Confere: página em `app://`, `fetch` do manifesto de arte, bloqueio de caminhos fora do jogo, ponte `window.desktop`
(Steam ausente → `null`), partida rodando, tela cheia liga/desliga e `localStorage` persistindo entre duas execuções.
Build Linux verificada em set/2026: Electron 33.4, 281 MB descompactada (sem ícone próprio até haver logo).

## Integração Steam (opcional)

1. Crie o app no Steamworks e anote o App ID; substitua o conteúdo de `steam_appid.txt` (480 é o app de testes da Valve).
2. `npm install steamworks.js` dentro de `desktop/` (biblioteca nativa que carrega a Steamworks SDK).
3. Conquistas: chame `window.desktop.achievement('ID')` no jogo. Nome do jogador: `window.desktop.steamName()`.
4. Envie a pasta `release/win-unpacked` como depósito via SteamPipe (ver `docs/STEAM.md`).
