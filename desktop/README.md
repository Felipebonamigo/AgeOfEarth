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
(Steam ausente → `null`; espelho de saves só com três operações), `THIRD_PARTY.md` e `LICENSES.chromium.html` no pacote,
partida rodando, tela cheia liga/desliga, `localStorage` persistindo entre duas execuções e o **espelho dos saves**
(Steam Cloud): grava opções e um save (F5), fecha, apaga o `localStorage` da origem `app://game`, reabre e confere que
voltaram dos arquivos. Usa um perfil temporário (`XDG_CONFIG_HOME`), nunca o do usuário.
Build Linux verificada em set/2026: Electron 33.4, 281 MB descompactada (sem ícone próprio até haver logo).

## Arquivos

| Arquivo | Papel |
|---|---|
| `main.cjs` | Processo principal: protocolo `app://`, janela, Steamworks (nome, conquistas, Rich Presence), diálogos de arquivo, perfil fixo (`age-of-earth-desktop`) e os canais `cloud:*` |
| `preload.cjs` | Ponte `window.desktop` (contextIsolation + sandbox): só funções específicas, nenhum acesso genérico a arquivos |
| `cloud.cjs` | Espelho dos saves em `userData/saves/*.json` (lista fixa de chaves, 16 MB, 300 arquivos, gravação atômica) — `docs/STEAM.md` §4.2 |
| `steam/achievements.json`, `steam/achievements.csv` | Planilha de cadastro das 40 conquistas no Steamworks, gerada por `npx tsx scripts/steam-achievements.ts` (não edite) |
| `steam/rich_presence.vdf` | Localização do Rich Presence (`#Status`) para enviar no Steamworks |
| `steam_appid.txt` | App ID (480 = app de testes da Valve até haver o nosso) |

O pacote leva também `resources/THIRD_PARTY.md` (licenças de terceiros, gerado por `npx tsx scripts/licenses.ts`).

## Integração Steam (opcional)

1. Crie o app no Steamworks e anote o App ID; substitua o conteúdo de `steam_appid.txt` (480 é o app de testes da Valve).
2. `npm install steamworks.js` dentro de `desktop/` (biblioteca nativa que carrega a Steamworks SDK).
3. Conquistas: o jogo chama `window.desktop.achievement(id)` com o id de `src/game/achievements.ts` (= API name no
   Steamworks; cadastro em `docs/STEAM.md` §4.1). Nome do jogador: `window.desktop.steamName()`.
4. Steam Cloud: configure o Auto-Cloud para `age-of-earth-desktop/saves/*.json` (`docs/STEAM.md` §4.2).
5. Envie a pasta `release/win-unpacked` como depósito via SteamPipe (ver `docs/STEAM.md`).
