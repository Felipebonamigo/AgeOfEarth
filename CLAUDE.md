# Age of Earth — guia para agentes

RTS (Rise of Nations + Age of Mythology, panteão grego) em TypeScript + PixiJS, empacotável com Electron para a Steam.
Idioma da interface e dos comentários: português (Brasil). Código em inglês.

## Comandos
- `npm run dev` — Vite em http://localhost:5173 · `npm run build` — typecheck + bundle em `dist/` · `npm run preview` — serve `dist/` na porta 4173
- `npm test` — vitest · `npm run typecheck`
- `npm run smoke 20 42` — IA x IA por 20 min de jogo (semente 42) sem interface · `npm run balance 35 1,2,3`
- `npx tsx scripts/missions.ts` — valida as missões da campanha · `npx tsx scripts/horde.ts` — valida o Modo Horda
- `npm run relay` — servidor de multiplayer (porta 8787)
- `node scripts/playtest.mjs` / `playtest-campaign.mjs` / `playtest-mp.mjs` / `playtest-reconnect.mjs` / `playtest-options.mjs` / `playtest-i18n.mjs` / `playtest-modes.mjs` / `playtest-horde-replay.mjs` / `actionshot.mjs` — Chromium headless (Playwright); exigem `npm run preview` e, para o multiplayer, `npm run relay`
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
- **Design e arquitetura**: `docs/DESIGN.md` · **Publicação na Steam**: `docs/STEAM.md` e `desktop/README.md`.
- **Estado atual**: Fase 0 concluída (fatia vertical: skirmish, campanha com 3 missões, Horda, multiplayer lockstep, replays, Electron). Fase 1 (jogabilidade sólida) quase concluída: guarnição, portões, formações, IA "Muito difícil", i18n PT/EN, opções (tela cheia, escala, qualidade), atalhos e caça a bugs (economia corrigida). Caça a bugs (7 lentes, 48 correções) concluída. Pendente: balanceamento contínuo (`npm run balance`) com base nos playtests humanos. Feitos: lobby (chat, ping, kick, atraso dinâmico), reconexão por instantâneo, modos de jogo e tipos de mapa (5.1). Em curso: Fase 3.2/3.3 (editor de cenários e mapas fixos; design em `docs/EDITOR.md`).
- **Rotina combinada com o dono do projeto**: ele joga 2–3 partidas por semana e manda uma lista curta de problemas; o agente entrega correções + uma feature com testes e balanceamento automático; a cada duas semanas o roteiro é revisado.
- **Decisões tomadas**: TypeScript + PixiJS + Electron (não Unity/Godot) para que o agente construa e verifique tudo sozinho; simulação determinística separada da renderização para multiplayer/replays; arte procedural como placeholder até a Fase 2; interface em PT-BR primeiro, EN na Fase 1.7.
- **Pendências que dependem do dono**: horas semanais disponíveis, orçamento de arte, conta Steamworks/empresa (Fase 6).
