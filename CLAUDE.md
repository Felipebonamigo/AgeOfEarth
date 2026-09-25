# Age of Earth — guia para agentes

RTS (Rise of Nations + Age of Mythology, panteão grego) em TypeScript + PixiJS, empacotável com Electron para a Steam.
Idioma da interface e dos comentários: português (Brasil). Código em inglês.

## Comandos
- `npm run dev` — Vite em http://localhost:5173 · `npm run build` — typecheck + bundle em `dist/` · `npm run preview` — serve `dist/` na porta 4173
- `npm test` — vitest · `npm run typecheck`
- `npm run smoke 20 42` — IA x IA por 20 min de jogo (semente 42) sem interface · `npm run balance 35 1,2,3`
- `npx tsx scripts/missions.ts` — valida as missões da campanha
- `npm run map:export saida.map.json --size small --seed 42` gera um mapa fixo; `npm run map:check [arquivo.map.json]` valida (sem arquivo: os embutidos), mostra recursos por início e roda 2 min de IA; `npm run smoke 5 42 -- --map arquivo.map.json` · `npx tsx scripts/horde.ts` — valida o Modo Horda
- Mapas oficiais: `npx tsx scripts/maps/estreito.ts` / `egeu.ts` regeram `src/core/data/maps/<id>.map.json` com as ops do editor (simetria, recursos por início e rotas não seláveis conferidos; `tests/data.test.ts` exige que o arquivo seja exatamente o gerado); `npx tsx scripts/maps/fairness.ts <mapa|id> 35 1-16 zeus` mede vitórias/idades por início com o mesmo deus em todos (critério: nenhum início/time com > 65 % das decididas; o Egeu ainda falha — viés norte em aberto)
- `npm run relay` — servidor de multiplayer (porta 8787)
- `npm run loadtest -- --minutes 40 --bots 4 [--jitter 0-80] [--drop-at 8 --drop-mode wait|resume|resume-rejoin] [--spectator-at 12] [--map arquivo]` — teste de carga do multiplayer com bots em Node (hashes, banda, reconexão); relatório em `docs/perf/`
- `node scripts/playtest.mjs` / `playtest-campaign.mjs` / `playtest-mp.mjs` / `playtest-reconnect.mjs` / `playtest-options.mjs` / `playtest-i18n.mjs` / `playtest-modes.mjs` / `playtest-horde-replay.mjs` / `playtest-fixedmap.mjs` / `playtest-editor.mjs` / `playtest-mp-fixedmap.mjs` / `playtest-rooms.mjs` / `playtest-spectate.mjs` / `playtest-scenario.mjs [url] [relay]` / `xvfb-run -a node scripts/playtest-desktop.mjs` (build Electron de `desktop/`, após `npm run dist:linux` lá) / `playtest-audio.mjs` / `playtest-gamepad.mjs` / `actionshot.mjs` — Chromium headless (Playwright); exigem `npm run preview` e, para o multiplayer, `npm run relay`
- `npm run art:shot` / `npm run art:diff` — capturas de referência (3 zooms, editor, cidade, batalha) em `docs/art/` e diff contra `docs/art/ref/` (2 % de tolerância); `?perf=1` na URL mostra fps/ms/draw calls/MB
- `node scripts/renderperf.mjs http://localhost:4173/ 20` — custo do renderizador (ms/quadro em vários zooms) numa partida grande após 20 min simulados; rode antes/depois de mudanças visuais (números pessimistas: renderização por software)
- Chromium do Playwright: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` neste ambiente; use `--use-gl=swiftshader --enable-unsafe-swiftshader`

## Regras do núcleo (`src/core`)
- **Determinismo obrigatório**: nada de `Math.random`, `Math.sin/cos/atan2/pow/exp/log/hypot`, `Date.now`. Use `state.rng` e distâncias por `Math.sqrt`. O teste `tests/determinism.test.ts` falha se isso for violado.
- Toda mutação de estado vinda de fora entra por `Command` → `applyCommand` (`src/core/sim/commands.ts`). O renderizador nunca altera o estado.
- Conteúdo é dado: `src/core/data/*.ts` (unidades, edifícios, tecnologias, deuses, idades). Efeitos de tecnologia seguem os tipos em `techs.ts`.
- Estado serializável: `src/core/serialize.ts` (Maps e typed arrays viram arrays). Novos campos precisam de valor padrão no `deserialize`.
- Cenários: `src/core/scenario/campaign.ts` (dados + gatilhos), executados por `runner.ts` dentro do tick.

## Camadas
`src/core` (simulação) · `src/render` (PixiJS: texturas procedurais, chunks, névoa, efeitos) · `src/ui` (HUD/menus/entrada em DOM) · `src/game/session.ts` · `src/net` + `server/relay.mjs` (multiplayer lockstep) · `desktop/` (Electron/Steam) · `docs/`.

## Convenções
- Atalhos de construção/treino são únicos por contexto e nunca usam A (atacar-mover), R (ponto de encontro) ou U (liberar); teste em `tests/data.test.ts`.
- Regiões conexas do mapa (`src/core/map/components.ts`): use `rectReachable` antes de mandar unidades a um alvo e `wouldSeal` antes de a IA construir; o movimento físico usa `canStep` (sem cortar cantos).
- Ao mudar balanceamento, rode `npm run balance` e observe minutos das idades (Clássica ~5, Heroica ~15-20, Mítica ~20-28).
- Commits em português, com o rodapé de atribuição exigido pela sessão.

## Memória do projeto (ler primeiro em toda sessão)
- **Plano completo e cronograma**: `docs/ROADMAP.md` (fases 0–7, passos numerados, responsáveis V/A/T, marcos M1–M6, custos, riscos). É o documento vivo: ao concluir um passo, marque-o lá.
- **Roteiro da campanha**: `docs/STORY.md` (Titanomaquia, 12 missões, fichas com JSON, lacunas do motor, ordem de produção e testes por missão).
- **Design e arquitetura**: `docs/DESIGN.md` · **Publicação na Steam**: `docs/STEAM.md` e `desktop/README.md`.
- **Áudio**: sintetizado pelo próprio código (`src/audio/`: efeitos posicionais a partir dos efeitos/eventos do estado, ambiente por bioma, música generativa em modos gregos, volumes separados). **Controle**: `src/ui/gamepad.ts` (Xbox/Steam Deck, cursor virtual, menus navegáveis).
- **Visual**: o dono pediu **realismo** no visual (set/2026). Direção de arte e pipeline em `docs/ART.md`; toda entrega visual vem com captura antes/depois (`node scripts/actionshot.mjs http://localhost:4173/ saida.png`) e é olhada com a ferramenta Read.
- **Estado atual**: Fase 0 concluída (fatia vertical: skirmish, campanha com 3 missões, Horda, multiplayer lockstep, replays, Electron). Fase 1 (jogabilidade sólida) quase concluída: guarnição, portões, formações, IA "Muito difícil", i18n PT/EN, opções (tela cheia, escala, qualidade), atalhos e caça a bugs (economia corrigida). Caça a bugs (7 lentes, 48 correções) concluída. Pendente: balanceamento contínuo (`npm run balance`) com base nos playtests humanos. Feitos: lobby (chat, ping, kick, atraso dinâmico), reconexão por instantâneo, modos de jogo e tipos de mapa (5.1). Fase 3.2/3.3 (editor de cenários e mapas fixos): design fechado em `docs/EDITOR.md` (formato, validação, plano em 5 etapas); Etapa 0 (UI de mapa fixo no skirmish e no lobby) concluída; Etapas 1–2 (núcleo: validateMap, mapHash, entidades pré-colocadas, kit inicial, hash do terreno; biblioteca de mapas, seletor no skirmish/lobby, mapa embutido) concluídas; Etapa 3 (editor MVP: `src/editor/` ops/MapEditor/panel, aba Editor no menu, `startEditor/testFromEditor` em `main.ts`, `scripts/playtest-editor.mjs`) concluída; Etapa 4 concluída (Corrigir para todos os avisos corrigíveis, tabela de recursos por início, balde, conta-gotas, redimensionar desfazível, atalhos finais sem A/R/U — Unidades = `M`, regiões = `L`, conta-gotas = `P`; `src/core/map/check.ts` em `map:check` e nos testes; mapas oficiais Estreito e Egeu redesenhados por `scripts/maps/*.ts`); Etapa 5 (cenários em JSON) concluída. Fase 3.2/3.3 fechadas.
- **Rotina combinada com o dono do projeto**: ele joga 2–3 partidas por semana e manda uma lista curta de problemas; o agente entrega correções + uma feature com testes e balanceamento automático; a cada duas semanas o roteiro é revisado.
- **Decisões tomadas**: TypeScript + PixiJS + Electron (não Unity/Godot) para que o agente construa e verifique tudo sozinho; simulação determinística separada da renderização para multiplayer/replays; arte procedural como placeholder até a Fase 2; interface em PT-BR primeiro, EN na Fase 1.7.
- **Pendências que dependem do dono**: horas semanais disponíveis, orçamento de arte, conta Steamworks/empresa (Fase 6).
