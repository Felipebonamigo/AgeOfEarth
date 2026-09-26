# Guia de publicação na Steam

Este documento resume o caminho do projeto até a loja. O jogo roda no navegador durante o desenvolvimento e vira um
executável nativo com o Electron (pasta `desktop/`). Checklist completo de lançamento em `docs/QA.md`.

## 1. Conta e app
- Cadastre-se no [Steamworks](https://partner.steamgames.com/) e pague a taxa do Steam Direct (US$ 100 por jogo, devolvida após US$ 1.000 em vendas).
- Crie o app e anote o **App ID**. Coloque-o em `desktop/steam_appid.txt`.

## 2. Build
- `npm run build` gera `dist/` (jogo web otimizado).
- `cd desktop && npm install && npm run dist:win` gera `desktop/release/win-unpacked/`.
- Faça o mesmo para Linux (`dist:linux`) se quiser suporte a Steam Deck/Proton (o Electron roda muito bem no Proton mesmo sem build Linux).

## 3. Depósitos e upload (SteamPipe)
- Baixe a Steamworks SDK e use `tools/ContentBuilder`.
- Crie um script `app_build_<appid>.vdf` apontando para `desktop/release/win-unpacked` como `ContentRoot` e defina o executável de lançamento em Steamworks → Installation → General (`Age of Earth.exe`).
- `steamcmd +login <usuário> +run_app_build caminho/app_build.vdf +quit` envia a build; depois publique-a em um branch (default/beta) no painel.

## 4. Recursos Steam que o wrapper já prevê

### 4.1 Conquistas (40, PT/EN)
- Definidas em `src/game/achievements.ts` (27 fixas + 13 geradas do registro da campanha). O **id de cada conquista é o
  API name no Steamworks**: o jogo chama `window.desktop.achievement(id)` → `desktop/main.cjs` → `steam.achievement.activate(id)`
  (steamworks.js), com o mesmo id. Ao iniciar, `Achievements.syncToSteam()` reenvia as já destravadas (jogadas fora da
  Steam ou vindas do Steam Cloud); `activate` é idempotente.
- `npx tsx scripts/steam-achievements.ts` gera a planilha de cadastro em `desktop/steam/achievements.json` e `.csv`
  (uma linha por conquista: `api_name`, `hidden`, `icon`, `name_brazilian`, `desc_brazilian`, `name_english`,
  `desc_english`; CSV em UTF-8 com vírgula). `--check` falha se os arquivos estiverem desatualizados.
  `tests/steam.test.ts` falha se um id não servir de API name (letras ASCII, dígitos e `_`), se houver id repetido ou se
  faltar nome/descrição em inglês.
- **Ocultas** (`hidden: 1`): as conquistas das missões dos Atos II e III e "Ato II/III completo" (os nomes contam a história).
- **Cadastro no Steamworks** (dono, depois do App ID): App Admin → Stats & Achievements → Achievements → *New Achievement*
  para cada linha: *API Name* = `api_name`; *Display Name* e *Description* em **English** e em **Portuguese - Brazil**
  (`brazilian`); *Hidden* conforme a coluna; *Set by* = Client. A Steam não importa a planilha: a entrada é manual (ou
  pela página de localização do Steamworks, que exporta/importa os textos por idioma depois que as conquistas existem).
  Depois, *Publish* em App Admin.
- **Ícones** (pendente, arte): 256×256 JPG por conquista, versão colorida (destravada) e cinza (bloqueada). A coluna `icon`
  traz o emoji usado no jogo como referência para o artista.

### 4.2 Steam Cloud (saves em arquivo)
O jogo guarda tudo no `localStorage`; no Electron, `src/game/cloud.ts` **espelha** em arquivos o que importa ao jogador
(grava nos dois a cada mudança) e, na inicialização, restaura dos arquivos o que faltar no `localStorage`:

| Chave do localStorage | Arquivo em `saves/` |
|---|---|
| `aoe_save_v1` (save do F5/menu) | `save.json` |
| `aoe_replay_v1` (último replay) | `replay.json` |
| `aoe_campaign`, `aoe_campaign_diff` (progresso e dificuldade da campanha) | `campaign.json`, `campaign-difficulty.json` |
| `aoe_achievements_v1`, `aoe_gods_played` (conquistas) | `achievements.json`, `gods-played.json` |
| `aoe_settings_v1`, `aoe_locale` (opções e idioma) | `settings.json`, `locale.json` |
| `aoe_setup`, `aoe_mp` (última partida rápida e sala online) | `skirmish-setup.json`, `multiplayer.json` |
| `aoe_maps_v1`, `aoe_map_<id>` (Meus mapas do editor) | `maps-index.json`, `map-<id>.json` (ids fora do formato do slug: `mapx-<hex>.json`) |
| `aoe_editor_autosave`, `aoe_editor_test` (rascunho do editor) | `editor-draft.json`, `editor-test.json` |

Fora do espelho (ficam só nesta máquina): a ficha de vaga do relay (`aoe_seat:*`), o relatório de dessincronização
(`aoe_desync_v1`) e os carimbos da sincronização (`aoe_cloud_sync_v1`).

- **Pasta** (fixada em `desktop/main.cjs`; não mude): `app.getPath('userData')/saves` =
  Windows `%APPDATA%\age-of-earth-desktop\saves` · Linux `~/.config/age-of-earth-desktop/saves` (ou `$XDG_CONFIG_HOME/…`) ·
  macOS `~/Library/Application Support/age-of-earth-desktop/saves`.
- **Segurança**: a página só alcança três canais (`cloud:readAll`, `cloud:write`, `cloud:remove` no `preload.cjs`), com
  chaves da lista fixa de `desktop/cloud.cjs` (igual à de `src/game/cloud.ts`; o teste compara), texto de até 16 MB, no
  máximo 300 arquivos; o nome do arquivo sai da chave, nunca de um caminho vindo da página. Gravação atômica
  (`arquivo.json.tmp` + rename).
- **Quem vale na inicialização** (`planCloudSync`, função pura testada): só no arquivo → restaura; só no localStorage →
  grava o arquivo (saves de antes do espelho); diferentes → se o localStorage ainda é o último sincronizado nesta máquina
  (carimbo), o arquivo veio de outra máquina pelo Steam Cloud e é restaurado; senão vence o localStorage. Assim o Steam
  Deck e o PC compartilham o progresso: o Steam baixa os arquivos antes de abrir o jogo e o jogo os aplica ao iniciar.
- **Configuração no Steamworks** (dono): App Admin → Cloud → *Steam Cloud Settings*:
  - *Byte quota per user*: **200 MB** (save e replay de partidas grandes passam de 1 MB cada; mapas 0,1–1 MB);
    *Number of files allowed per user*: **300** (o mesmo teto do jogo).
  - *Auto-Cloud* → *Root Paths*: Root **`WinAppDataRoaming`**, Subdirectory **`age-of-earth-desktop/saves`**, Pattern
    **`*.json`**, OS **Windows**, sem recursão. (Os temporários `*.json.tmp` ficam de fora pelo padrão.)
  - *Root Overrides*: Linux → **`LinuxHome`** com `.config/age-of-earth-desktop/saves` (ou `LinuxXdgConfigHome` com
    `age-of-earth-desktop/saves`, se aparecer na lista); macOS → **`MacAppSupport`** com `age-of-earth-desktop/saves`.
    No Steam Deck rodando a build Windows pelo Proton vale a raiz do Windows (dentro do prefixo do Proton).
  - Não aponte para `userData` inteiro: lá ficam os caches do Chromium e o próprio `Local Storage` (binário, muda a cada execução).
- Teste: `xvfb-run -a node scripts/playtest-desktop.mjs` grava opções e um save, fecha, **apaga o localStorage da origem
  `app://game`**, reabre e confere que tudo voltou dos arquivos (perfil temporário via `XDG_CONFIG_HOME`); a lógica pura e
  os limites do processo principal estão em `tests/steam.test.ts`.

### 4.3 Outros
- **Rich Presence**: `window.desktop.presence(texto)` → "No menu principal" / "Idade Heroica · 12 min", já no idioma do jogo
  (`steam_display` = `#Status`). Envie `desktop/steam/rich_presence.vdf` (token `#Status` = `%status%` em english e brazilian)
  em App Admin → Stats & Achievements → *Rich Presence Localization*.
- **Multiplayer**: o núcleo é determinístico e o agendador `LockstepScheduler` só troca comandos por tick; o transporte pode ser o
  Steam Networking Sockets (relay gratuito da Valve) via `steamworks.js`. Hoje o transporte é o relay próprio (`server/relay.mjs`).
- **Workshop**: mapas e cenários são dados JSON, ideais para o Workshop.
- **Licenças**: `npx tsx scripts/licenses.ts` gera `docs/THIRD_PARTY.md` (vai no pacote em `resources/THIRD_PARTY.md`) e a lista
  da tela Créditos (`src/ui/third-party.json`); ver `docs/LEGAL.md` §4.

## 5. Checklist de loja
- Capsules (imagens), trailer, descrição PT-BR/EN, tags (RTS, Mitologia, Estratégia, Single-player).
- Página "Em breve" o quanto antes: wishlists movem o algoritmo da Steam.
- Playtest com o **Steam Playtest** (gratuito) antes do Early Access.
