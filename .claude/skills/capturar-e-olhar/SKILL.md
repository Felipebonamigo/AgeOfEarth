---
name: capturar-e-olhar
description: 'Ver o jogo web do Age of Earth de verdade: build, preview na porta 4173, captura no Chromium headless (actionshot ou o playtest do assunto) e olhar a imagem com a ferramenta Read antes de afirmar qualquer coisa visual. Use ao mudar HUD, menu, renderizador, arte ou efeito, ou quando o Felipe pedir "tira um print", "mostra como ficou", "roda o playtest".'
---
# Capturar e olhar

Regra: nada visual está "pronto" ou "corrigido" sem uma captura nova **aberta com a ferramenta Read** nesta sessão. Mudança visual leva captura antes e depois. Capturas de trabalho vão em `scratch/` (no `.gitignore`).

## Passos

1. Build e servidor, na raiz do repositório. O preview não termina sozinho: suba numa sessão de processos própria, que grava o próprio PID.
   ```bash
   mkdir -p scratch
   npm run build 2>&1 | tail -3                      # ~40 s; termina com "built in"
   setsid sh -c 'echo $$ > scratch/preview.pid; exec npm run preview -- --port 4173 --strictPort' > scratch/preview.log 2>&1 &
   timeout 60 bash -c 'until curl -sf http://localhost:4173/ >/dev/null; do sleep 1; done' && echo no ar
   ```
   Com `--strictPort`, porta ocupada dá erro no log em vez de trocar de porta calada. Se for o servidor de outra sessão, use outra porta e passe a URL aos scripts; não derrube o dos outros. O relay (`npm run relay`, porta 8787) sobe do mesmo jeito, com `scratch/relay.pid`.
2. Captura rápida (batalha com heróis e criaturas, 1440×900, ~30 s):
   ```bash
   node scripts/actionshot.mjs http://localhost:4173/ scratch/acao.png
   ```
   Passe sempre a saída: sem ela o script sobrescreve `docs/screenshot.png` (a imagem do README).
3. Ou o playtest do assunto: `node scripts/<script> [url] [saída]`. Os de multiplayer pedem o relay no ar e o endereço dele (`ws://localhost:8787`) como 2º argumento.

   | Assunto | Script |
   |---|---|
   | fluxo geral: construir, treinar, pesquisar, poder | `playtest.mjs` (saída padrão `/tmp/pt`), `screenshot.mjs` |
   | campanha, cenário JSON e gatilhos | `playtest-campaign.mjs`, `playtest-scenario.mjs [url] [relay]` |
   | editor e mapa fixo | `playtest-editor.mjs`, `playtest-fixedmap.mjs`, `playtest-mp-fixedmap.mjs [url] [relay]` |
   | Eras, Biblioteca, árvore F3, linhas | `playtest-eras.mjs [url] --out <pasta> [--lang en]`, `playtest-library.mjs`, `playtest-lines.mjs` |
   | naval, comércio, maravilhas, mitologia | `playtest-naval.mjs`, `playtest-trade.mjs`, `playtest-wonders.mjs`, `playtest-myth.mjs` |
   | guarnição e portões, modos e tipos de mapa, Horda e replay | `playtest-garrison.mjs`, `playtest-modes.mjs`, `playtest-horde-replay.mjs` |
   | opções e atalhos, PT/EN, sem emoji, créditos | `playtest-options.mjs`, `playtest-i18n.mjs`, `playtest-noemoji.mjs [url] --out <pasta>`, `playtest-credits.mjs` |
   | controle, áudio | `playtest-gamepad.mjs`, `playtest-audio.mjs` |
   | multiplayer | `playtest-mp.mjs`, `playtest-reconnect.mjs`, `playtest-rooms.mjs`, `playtest-spectate.mjs` (todos `[url] [relay]`) |
   | Electron | `xvfb-run -a node scripts/playtest-desktop.mjs` (depois de `npm ci && npm run dist:linux` em `desktop/`) |
   | arte | `npm run art:shot` / `npm run art:diff`; `node scripts/artshot.mjs --quality high --out <pasta>` mostra o que um jogador com GPU vê |

4. Abra cada PNG com Read. Descreva o que vê e compare antes × depois. Só então afirme algo.
5. Encerre o que você subiu, pelo grupo de processos (matar só o PID do `npm` deixa o `vite` órfão):
   ```bash
   kill -- -"$(cat scratch/preview.pid)"            # e o relay: kill -- -"$(cat scratch/relay.pid)"
   curl -sf http://localhost:4173/ >/dev/null && echo "ainda no ar" || echo parado
   ```
   Nunca `pkill -f`, `killall` ou `kill $(pgrep -f …)`: casam com o próprio shell e com servidores de outras sessões.

## Chromium deste ambiente (para script novo)

```js
chromium.launch({ env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' },
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
```

O idioma vem do `LANG`: `--lang` não vale no headless, e na primeira execução o jogo segue o idioma do sistema (`aoe_locale`, senão `navigator.language`). Os playtests conferem textos em PT.

## Armadilhas

- **Renderização por software lenta** (swiftshader): acelere (`window.aoe.session.speed = 3`), espere por condição em laço com teto de 60 s ou mais e dê timeouts generosos. Timeout de playtest só vira falha depois de repetido com o dobro do tempo. Números do `renderperf` daqui são pessimistas.
- **Scripts que gravam em `docs/art/` por padrão**: `playtest-library`, `-credits`, `-naval`, `-trade`, `-wonders`, `-myth`, `-eras`, `-noemoji`. Passe uma pasta de `scratch/` quando o script aceitar; senão confira `git status` e devolva com `git restore docs/art/<arquivo>` o que não era para mudar.
- `*.png` fica fora do git, menos `docs/art/**`, `docs/steam/`, `public/art/**` e `docs/screenshot.png`: o que cai lá entra no commit.
- As referências do `art:diff` são do preset Baixo; `?perf=1` na URL mostra fps, ms, draw calls e MB.
- Playtest deu certo: código 0, nenhuma conferência com falha e, nos que imprimem, `errors: none`. O `playtest.mjs` só imprime a linha `errors:`, sem mudar o código de saída: leia-a.

## O que registrar

Na resposta final, o caminho de cada captura olhada e o que ela mostra. Captura que é entrega (em `docs/art/`) entra no commit junto da mudança; as de `scratch/` não.
