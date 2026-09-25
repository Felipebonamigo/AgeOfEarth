# Age of Earth — guia para agentes

RTS (Rise of Nations + Age of Mythology, panteão grego) em TypeScript + PixiJS, empacotável com Electron para a Steam.
Idioma da interface e dos comentários: português (Brasil). Código em inglês.

## Comandos
- `npm run dev` — Vite em http://localhost:5173 · `npm run build` — typecheck + bundle em `dist/` · `npm run preview` — serve `dist/` na porta 4173
- `npm test` — vitest (26 testes) · `npm run typecheck`
- `npm run smoke 20 42` — IA x IA por 20 min de jogo (semente 42) sem interface · `npm run balance 35 1,2,3`
- `npx tsx scripts/missions.ts` — valida as missões da campanha
- `node scripts/playtest.mjs` / `playtest-campaign.mjs` / `playtest-mp.mjs` — Chromium headless (Playwright); exigem `npm run preview` e, para o multiplayer, `npm run relay`
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
- Atalhos de construção/treino são únicos por contexto (teste em `tests/data.test.ts`).
- Ao mudar balanceamento, rode `npm run balance` e observe minutos das idades (Clássica ~5, Heroica ~15-20, Mítica ~20-28).
- Commits em português, com o rodapé de atribuição exigido pela sessão.
