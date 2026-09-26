# QA — matriz de testes e checklist de lançamento (Fase 6.8)

## Verificações automáticas (rodar antes de cada build publicado)

| Comando | O que cobre | Tempo |
|---|---|---|
| `npm run typecheck` | Tipos estritos | ~10 s |
| `npm test` | 706 testes em 45 arquivos (26/09/2026, integração da Etapa 4 da arte: `art-cavalry`, `art-distancia-cerco` e `art-heroes` — kits, poses, pé/sombra/altura e silhuetas a zoom 1 das 17 unidades da etapa, habilidade Q pela recarga do núcleo — e, no `art-manifest`, a sombra a ½ resolução e as páginas em múltiplos de 32 px); antes, 631 em 40 (com a Fase 6: `steam` — conquistas servem de API name e têm PT/EN, planilha do Steamworks em dia, espelho do Steam Cloud igual no jogo e no processo principal, `planCloudSync`, limites do IPC, gravação/restauração de ponta a ponta numa pasta real, nenhuma gravação de chave espelhada fora do `storeSet`, servidor padrão no Electron, licenças SPDX sem GPL/AGPL e lista da tela Créditos em dia com os lockfiles); antes, 616 em 39 (anti-trapaça 4.5 e a revisão): fuzz determinístico de comandos e regras de validação (`command-fuzz`: 7 200 comandos malucos numa partida em curso sem exceção, invariantes — sem NaN, recursos ≥ 0, população coerente, ids/guarnições consistentes — e o mesmo hash/save em duas execuções; entrada do `NetworkScheduler`: ids repetidos e limites por tick, tick em que o par não é aguardado, deus com nome do protótipo), relatório de dessincronização (`desync-report`: dois pares em memória com estado adulterado → tick, hashes e categoria/jogador divergentes), relay anti-trapaça (`relay-anticheat`: comando em nome de outra vaga, tick repetido/para trás, JSON malformado, quadro WebSocket inválido, mensagem grande, limite de taxa também do anfitrião, ficha de reconexão, instantâneo só pedido, configurações saneadas), texto de outros pares no HUD (`hud-text`: aviso e falas nunca viram HTML), justiça de posição (`position-fairness`: referenciais, desempates, kit, rodízio das IAs, sondagens de simetria do Egeu e do Estreito, poderes e entidades espelhados), versão da simulação no relay (`relay-version`), dados (inclui `checkMap` dos mapas embutidos, recursos iguais por início e mapas oficiais reprodutíveis pelos scripts), determinismo, pathfinding, simulação, regressões, cenários, lockstep/reconexão, modos, mapas fixos, editor, qualidade, áudio, controle, shader do terreno | ~15 s |
| `npm run balance 30 1,2,3,4,5,6` | 6 partidas IA×IA de 30 min: idades (Clássica ~5, Heroica 12–18, Mítica 19–26), ninguém travado | ~2 min |
| `npx tsx scripts/missions.ts` | Todas as missões do registro × 3 dificuldades: validação, viabilidade passiva e o roteiro do jogador (`MISSION_SCRIPTS` em `src/core/scenario/testing.ts`) vencendo dentro da janela. Referência 26/09/2026 (depois da correção do viés de posição; roteiros da m2, m5 e m7 reajustados e janela da m4 revista para 15m–39m — só o roteiro/janela, nunca a missão; causas em `docs/STORY.md` §4 e §7.2): m1 14m39s/14m26s/15m55s, m2 19m33s/15m32s/15m25s, m3 18m30s/19m10s/19m16s, m4 16m14s/19m00s/19m09s, m5 15m55s/16m55s/17m55s (variante "escolta" 6m08s/7m55s/8m59s), m6 19m36s/20m02s/22m17s, m7 17m47s/17m00s/22m52s (Fácil/Normal/Difícil). Para rodar em paralelo: `npx tsx scripts/missions.ts 14 m1_despertar,m2_cerco,m3_portal` etc. | ~8 min (1 processo) |
| `npm run map:check [arquivo.map.json…]` | Sem arquivos: os mapas embutidos. Validação (erros/avisos), tabela de recursos por início (raio 16) e 2 min de IA×IA em cada (`src/core/map/check.ts`, o mesmo que `tests/data.test.ts` exige): falha com erro, IA parada ou partida encerrada no 1º minuto | ~5 s |
| `npx tsx scripts/maps/estreito.ts` / `scripts/maps/egeu.ts [saída]` | Regeram os mapas oficiais com as ops do editor; recusam gravar com erro de validação, assimetria, recursos desiguais, vizinhança de início diferente ou rota selável (corte mínimo < 5 tiles ou um edifício de até 4×4 que a feche sozinho, com as outras rotas fechadas; `routeReport` em `scripts/maps/lib.ts`); o teste confere que o arquivo embutido é exatamente o que o script gera | ~3 s |
| `npx tsx scripts/maps/fairness.ts <mapa ou id> [min=45] [sementes=1-16] [deuses=zeus] --both --jobs 3` (+ `--swap`, `--order 2,3,0,1`, `--mirror-ai`, `--transpose`, `--json saída`) | Justiça por início: IA×IA com o **mesmo deus em todos os inícios** (espelho; deuses diferentes escondem o viés de posição), vitórias e minutos das idades por início; nas partidas sem vencedor conta quem está **à frente no fim** (edifícios + unidades). `--both` roda cada semente nas duas ordens de inícios e separa POSIÇÃO (lado do início) de ÍNDICE (ordem dos jogadores); `--mirror-ai` dá a mesma personalidade de IA a todos; `--transpose` joga o mapa transposto (x ↔ y). Critério: nenhum lado com > 65 % de decididas + à frente, por posição e por índice; com 32 partidas uma moeda honesta passa de 65 % em ~11 % das vezes, então um "fora" isolado em 16 sementes pede a confirmação em ≥ 32 sementes (64 partidas, ~2 %). Referência 26/09/2026 (versão final, 45 min, Normal, Zeus; sementes 1–16 · novas 101–132; decididas + à frente): **Egeu** posição 18 × 14 · 33 × 31, índice 12 × 20 (decididas 10 × 20 = 67 %) · 37 × 27; **Egeu transposto** posição 18 × 14 · 36 × 28, índice 16 × 16 · 30 × 34; **Estreito** posição **11 × 21 (66 %, fora)** · 38 × 26, índice 15 × 17 · 28 × 36; Poseidon 1–16: 18 × 14 / 16 × 16. União das 96 partidas por mapa (decididas): Egeu 45 × 44, transposto 49 × 40, Estreito 48 × 46. Números completos, antes/depois e resíduos em `docs/EDITOR.md` (Etapa 4, "Justiça de posição") | ~5 min (16 sementes × 2 ordens, 4 IAs, 3 processos); ~11 min com 32 sementes |
| `npm run smoke 20 42` duas vezes | IA×IA 20 min sem interface; a última linha (`hash final`) tem de ser igual nas duas (determinismo de ponta a ponta). Referência 26/09/2026 (versão final da correção do viés): `8783483f` nas duas, 0,34 ms/tick com a máquina ocupada por outras rodadas | ~15 s |
| `npm run balance 35 1,2,3 -- --map src/core/data/maps/<id>.map.json` | Balanço num mapa fixo (tantas IAs quantos inícios; linha "aos 5 min" acusa IA parada). Referência 25/09/2026 (mapas revisados): Estreito Clássica 5–6, Heroica 13–18, Mítica 17–21, Titãs 27 (Zeus × Poseidon: o Poseidon vence — é o deus; justiça por início é com `fairness.ts`); Egeu (4 IAs, cada um por si) Clássica 5–6, Heroica 13–17, Mítica 18–22, Titãs 25–32; nenhuma parada aos 5 min | ~1 min |
| `npx tsx scripts/perf.ts` | Mapa grande, 4 IAs Muito difícil: média < 3 ms/tick, pior tick < 50 ms | ~1 min |
| `npm run perf:render -- http://localhost:4173/ 20` | Renderizador no cenário fixo (144×144, semente 42, 3 IAs, 20 min, ≥ 260 unidades): fps, ms de `renderer.render` (média/p95), draw calls, MB de texturas, sprites e chunks nos 4 cenários; grava `docs/perf/<data>.json`. Números de base na seção abaixo | ~2 min |
| `npm run art:shot -- http://localhost:4173/ <prefixo>` + `npm run art:diff -- <prefixo>` | 6 capturas de referência (3 zooms, editor, cidade da IA, batalha) comparadas com `docs/art/ref/` (≤ 2 % de pixels diferentes; `--update` só em mudança visual intencional) | ~1 min |
| `tests/terrain-shader.test.ts` (em `npm test`) | GLSL ES 3.00 do terreno com os uniforms/texturas esperados (completo e simples, ≤ 5 leituras no interior do simples, fronteira suave no completo e por aresta no simples), bytes de `uWeights`/`uKind`/`uOwner` puros e determinísticos, `invalidateRect` alterando só o retângulo, retângulo + `TERRAIN_INFLUENCE` = reescrita total, materiais 256² tileáveis e em cache | — |
| `tests/quality.test.ts` (em `npm test`) | Presets low/medium/high/auto, resolução efetiva, preset automático (desce com p95 > 12 ms, nunca sobe), `loadSettings` com save antigo | — |
| `npm run preview` + `node scripts/playtest.mjs` | Partida no navegador: construir, treinar, avançar, poderes, salvar/carregar | ~1 min |
| `node scripts/playtest-campaign.mjs`, `playtest-horde-replay.mjs`, `playtest-garrison.mjs` | Campanha, Horda/replay, guarnição/portões | ~2 min |
| `node scripts/playtest-options.mjs`, `playtest-i18n.mjs`, `playtest-modes.mjs`, `playtest-fixedmap.mjs` | Opções/atalhos/diagnóstico, inglês, modos de jogo, exportar/carregar mapa fixo | ~2 min |
| `node scripts/playtest-gamepad.mjs` | Controle falso (1280×800, interface a 130 %): menu pelo D-pad/LB/RB e A inicia; cursor virtual até um cidadão, A seleciona, B coleta, Y para, ◀ ocioso, LT+A painel, ▶ exército, X atacar-mover, Start/B menu, analógico direito rola, ⧉ visão geral, vibração, HUD cabe na tela, mouse retoma, desconexão; captura `docs/art/controle-deck.png` | ~2 min |
| `node scripts/playtest-editor.mjs` | Editor de mapas: novo mapa gerado, pintar lago/bosque com o mouse, torre e hoplita por jogador, mover início, desfazer/refazer, validação (Ir até), salvar, Testar (partida real) e voltar à mesma instância, exportar, P (conta-gotas, sem pausar)/F5 sem efeito, Esc/menu; Etapa 4: balde (botão 🪣), conta-gotas (botão 💧), cerca com gargalo → **Corrigir** faz o aviso sumir (e Ctrl+Z o traz de volta), tabela de recursos, redimensionar 80→96 (Ctrl+Z volta à instância anterior, Ctrl+Y refaz; o rascunho acompanha a instância exibida, também após Ctrl+S), Estreito e Egeu abertos no editor sem avisos e com recursos iguais, Testar contra IAs e voltar; capturas `docs/art/editor-estreito.png` e `editor-egeu.png` (67 verificações) | ~2 min |
| `npm run relay` + `node scripts/playtest-mp.mjs`, `playtest-reconnect.mjs`, `playtest-mp-fixedmap.mjs`, `playtest-rooms.mjs`, `playtest-spectate.mjs` (todos aceitam `[url] [ws]`, ex.: `node scripts/playtest-mp.mjs http://localhost:4220/ ws://localhost:8797` com `node server/relay.mjs 8797`) | Dois navegadores em lockstep, chat (o da partida é texto puro: `<img onerror>` aparece como texto), ping, queda e reconexão (com a ficha da vaga), mapa fixo no lobby, lista de salas (sala iniciada fica só para assistir), espectadores — com os limites do relay (4.5) ligados | ~4 min |
| `npm run loadtest -- --minutes 40 --bots 4` (+ `--jitter 60 --drop-at 8 --spectator-at 12`, `--map arquivo.map.json`, `--realtime`) | Teste de carga do multiplayer (4.4): relay próprio (acelerado: `--no-rate-limit`, porque os bots mandam ~1 000 ticks/s; `--realtime`: com os limites de taxa do relay ligados) + N bots em Node, cada um com NetClient e a própria simulação (fluxo de `startNetworkGame`/`rejoinNetworkGame`), comandos determinísticos (coleta, casas/quartel/templo/academia, treino, Idades, pesquisa, mercado, ataque-mover a cada ~3 min, poderes). Hash de todos a cada 100 ticks (divergência → estado de todos + refazer offline até o primeiro tick e diff por caminho), banda, instantâneo, ms/tick, espera pela rede, CPU/RSS do relay; queda com espera+reconexão, "seguir sem ele" (`--drop-mode resume`/`resume-rejoin`), espectador no meio; `--inject-desync M[:cmd]` autotesta o detector. Relatório em `docs/perf/loadtest-<data>.json`. Referência 25/09/2026 (4 CPUs, carga ~10–14 de outros processos): **4 bots × 40 min, mapa grande, atraso 4**: 480/480 hashes iguais, 91–155 s reais, 1,0–1,8 ms/tick, ~42 KB/min enviados e ~159 KB/min recebidos por jogador (20 msg/s env., 61 msg/s rec.), relay 70 MB RSS e ~0,3 s de CPU por minuto simulado, pico 183 unidades/102 edifícios; **4 × 20 min, jitter 60, queda aos 8 (espera+reconexão) e espectador aos 12**: 240/240 iguais, instantâneo 695–728 KB (serialize 18–24 ms, aplicado em 11–16 ms); **2 × 10 min no Estreito**: 120/120; **tempo real, jitter 20–80**: atraso 4 → ≤ 0,04 % de quadros travados; atraso 2 → 1,8–3,7 % (lentidão 0,2–0,4 %); relay 2,2 % de um núcleo por sala de 4 | 2–6 min |
| `npx tsx scripts/steam-achievements.ts --check` · `npx tsx scripts/licenses.ts --check` | Planilha das conquistas (`desktop/steam/achievements.{json,csv}`) e licenças de terceiros (`docs/THIRD_PARTY.md`, `src/ui/third-party.json`) em dia; licenças conhecidas e sem copyleft forte no pacote distribuído (sem `--check`: regeram) | ~2 s |
| `node scripts/playtest-credits.mjs [url]` | Tela Créditos pelo menu principal em PT e EN: equipe, tecnologias, tabela de licenças igual a `src/ui/third-party.json`, textos das licenças, abre no topo, cabe na janela; capturas `docs/art/creditos-{pt,en}.png` | ~20 s |
| `npm run dist:linux` (em `desktop/`, depois de `npm ci` lá) + `xvfb-run -a node scripts/playtest-desktop.mjs` | Build Linux do Electron (perfil temporário via `XDG_CONFIG_HOME`): `app://`, bloqueio de caminhos, ponte `window.desktop` (Steam ausente → `null`; espelho só com 3 operações), `THIRD_PARTY.md` e `LICENSES.chromium.html` no pacote, IPC do espelho recusa chave fora da lista/caminho/não-texto/> 16 MB, opções e save (F5) gravados em `saves/*.json`, partida, tela cheia, `localStorage` entre execuções; depois **apaga o localStorage da origem `app://game`**, reabre e confere opções (inglês, sem rolagem pela borda) e save restaurados dos arquivos (Carregar funciona). Referência 26/09/2026: 29 verificações, 5 chaves restauradas, save de 283 KB | ~2 min (+ ~1 min da build) |
| `npm run relay` + `node scripts/playtest-scenario.mjs [url] [relay]` | Cenário JSON embutido: editor → Gatilhos (modelos, validação ao vivo com path, JSON inválido bloqueia Salvar) → Testar com cenário (intro, objetivos, diálogo) e voltar ao editor; exportar/importar em Campanha → Cenários personalizados (id reservado recusado, sem progresso da campanha); multiplayer com "Cenário: …" no lobby, scenarioData nos dois clientes e mesmo hash | ~2 min |

## Desempenho do renderizador — números de base (Etapa 0 da arte, 25/09/2026)

Medição `npm run perf:render` em Chromium headless com swiftshader (renderização por **software**: fps e ms são
pessimistas e não representam GPU; valem draw calls, MB de texturas e o custo de CPU de `renderer.render`, comparados
antes/depois de cada etapa de `docs/ART.md`). Cenário fixo: mapa 144×144, semente 42, 3 IAs Muito difícil, 20 min
simulados, 260 unidades, 153 edifícios, preset Média, 1600×900 @1×. Arquivo: `docs/perf/2026-09-25-etapa0-base.json`.

| Cenário | fps (software) | render média (ms) | p95 | máx | draw calls | tex MB | sprites | chunks |
|---|---|---|---|---|---|---|---|---|
| zoom 1 (cidade do jogador) | 2,4 | 0,34 | 0,6 | 0,6 | 3 | 34,6 | 18 | 12 |
| zoom mínimo (mapa inteiro) | 3,3 | 3,08 | 12,6 | 12,6 | 5 | 112,9 | 89 | 81 |
| zoom 1,5 (maior aglomerado) | 2,7 | 0,84 | 5,4 | 5,4 | 3 | 112,9 | 15 | 8 |
| rolagem contínua (chunks novos) | 2,6 | 6,56 | 40,4 | 40,4 | 3 | 126,9 | 33 | 22 |

Leitura: o custo de CPU do quadro é baixo (< 1 ms parado) e os picos vêm da geração de chunks por `generateTexture`
(rolagem p95 40 ms; zoom mínimo 12,6 ms). As texturas residentes são dominadas pelos chunks de terreno em cache
(81 chunks = 113 MB; cada RenderTexture 512² ≈ 1 MB) e por ~1 000 texturas pequenas do placeholder procedural; a Etapa 1
(terreno por shader, zero `generateTexture`) deve derrubar as duas colunas. Draw calls já estão dentro do orçamento
(≤ 40). Os "sprites" contam só o que é visível ao jogador local (névoa): o aglomerado do cenário 3 é em geral inimigo.
Metas: 60 fps alvo / 40 fps mínimo no preset Média em GPU integrada 1080p e no Steam Deck (`docs/ART.md` §6); o dono
mede no PC e no Deck com `?perf=1` (ou Opções → Avançado → Mostrar desempenho) e manda os números.

## Desempenho do renderizador — Etapa 1 da arte (terreno por shader, 25/09/2026)

Mesmo cenário e mesma medição da Etapa 0, mas com 10 min simulados (`node scripts/renderperf.mjs http://localhost:4186/ 10`),
antes (`docs/perf/2026-09-25-etapa1-antes.json`, commit 051eade — o renderizador não mudou entre 051eade e a base desta
etapa) e depois (`docs/perf/2026-09-25-etapa1-depois.json`). Terreno agora = `src/render/terrain/ChunkMesh.ts` (um quad
por chunk num único Mesh, culling pelo índice, 1 draw call) + shader completo no preset Média; nós = sprites de um atlas
único na camada `props` (faixas de chunks ordenadas por y); fronteiras no shader do terreno (curva suave).

| Cenário | render média antes → depois (ms) | p95 antes → depois | máx antes → depois | draw calls | tex MB antes → depois | chunks |
|---|---|---|---|---|---|---|
| zoom 1 (cidade do jogador) | 0,52 → 0,56 | 1,5 → 0,8 | 3,0 → 0,8 | 5 → 5 | 35,5 → 14,4 | 12 |
| zoom mínimo (mapa inteiro) | 0,69 → 0,66 | 0,8 → 1,2 | 10,1 → 1,2 | 8 → 5 | 110,3 → 14,4 | 81 |
| zoom 1,5 (maior aglomerado) | 0,36 → 0,73 | 0,7 → 1,8 | 1,2 → 1,8 | 5 → 4 | 110,4 → 14,5 | 8 |
| rolagem contínua | 2,85 → 1,44 | 17,9 → 5,3 | 23,7 → 5,3 | 6 → 4 | 134,4 → 14,5 | 12 |

(No "depois" entram só 4–7 quadros na janela de 4 s — ver fps abaixo —, então p95 = máx; nenhum pico novo acima de 6 ms.)

- **Zero `generateTexture` de chunk** (grep em `src/render`: só `TextureCache.make` de unidades/edifícios e o atlas de
  nós, gerado uma vez por sessão). Draw calls 4–5 em todos os zooms (antes 5–9); o pico de rolagem caiu de 17,9/23,7 ms
  para 5,3 ms e as texturas residentes de 110–134 MB para 14,4 MB (4 materiais 512² albedo + normal com mipmaps, água e
  macro 256², 3 texturas w×h, atlas de nós).
- **Cortar 50 árvores rolando a câmera** (mapa grande "forest", 6 236 nós, zoom 1, uma árvore removida e 24 px de rolagem
  por quadro, `scripts/_tmp-etapa1.mjs trees`): `renderer.render` média 0,59 ms, p95 1,2 ms, máximo 2,2 ms (meta ≤ 4 ms).
- **fps por software (swiftshader, 1440×900, zoom 1,3)**: preset Baixo (shader simples) 6,6–6,8 fps, igual à Etapa 0
  (~7); preset Média (completo) 1,5 fps. O completo lê ~21 texels por pixel no interior de um material (4 macro, pesos,
  tipo, 4 da B-spline, 3 grades × albedo+normal + 1 larga, 4 da fronteira) e até ~28 nas transições; por software isso
  custa ~0,6 s por quadro. Em GPU real a conta é ~45 M leituras por quadro a 1080p (≈ 1–2 ms em integrada, dentro do
  orçamento de §6). **Pendente do dono**: `?perf=1` no PC e no Deck nos presets Média e Baixo (docs/ART.md §6).
  Observação: o preset `auto` mede só o custo de CPU de `renderer.render` (não o quadro da GPU), então não desce sozinho
  para Baixo numa GPU fraca — ajuste fora desta etapa (`src/main.ts`).
- Materiais gerados em runtime (em segundo plano ao abrir o menu, um por macrotarefa): ≈ 300 ms a 512² (grama 110 ms,
  terra/areia 65, rocha 55, água+macro 15, Node com a máquina carregada) e ≈ 60 ms a 256²; o custo fica fora da partida.
- Presets trocados em partida (`low → high → medium → auto → low → medium`): o shader alterna `simple:256` ↔ `full:512`,
  `uNormals`/`uWaterAnim` seguem o preset, sem erro no console.

## Desempenho do renderizador — Etapa 2B da arte (sprites assados, 25/09/2026)

Hoplita, cidadão, templo, árvores/tocos e nós assados (`src/render/art/`, `views/`, `props.ts`); antes = build da base
(commit 8d9808d, porta própria) e depois = esta etapa, rodadas uma após a outra na mesma máquina. A máquina é
compartilhada (4 CPUs, carga 4–7 de outras sessões), então os números por software oscilam ±30–50 % entre rodadas iguais:
leia tendências, não décimos. Mudanças no método desta vez: `renderperf.mjs` reaplica o preset depois de começar a
partida (o automático rebaixava o preset fixo para Baixo no começo de toda partida — defeito de `src/main.ts` anotado à
parte) e ganhou `--reveal` (aos 20 min o jogador local, parado, já perdeu a cidade para as 3 IAs; sem revelar, "cidade" e
"aglomerado" mediam só terreno e nós) e `--quality/--measure`; o aglomerado agora ignora unidades guarnecidas.

**`renderperf` no preset Baixo** (o que o automático escolhe sem GPU), 12 s por cenário, `--reveal`
(`docs/perf/2026-09-25-etapa2b-{antes,depois,depois-baixo-procedural}-baixo.json`; "sem arte" = esta build com a opção
desligada):

| Cenário | fps antes → depois (sem arte) | render média ms antes → depois (sem arte) | p95 antes → depois | draw calls | tex MB | sprites |
|---|---|---|---|---|---|---|
| zoom 1 (cidade) | 1,8 → 1,8 (2,1) | 2,39 → 1,47 (2,59) | 7,6 → 6,0 | 3 → 8 | 7,1 → 25,1 | 481 → 778 |
| mapa inteiro | 2,5 → 2,6 (3,1) | 3,79 → 3,05 (2,33) | 14,2 → 8,0 | 6 → 15 | 11 → 28,7 | 3 379 → 5 209 |
| zoom 1,5 aglomerado | 1,2 → 2,0 (2,2) | 2,89 → 1,54 (1,37) | 21,2 → 5,1 | 4 → 8 | 11 → 28,7 | 547 → 759 |
| rolagem | 1,5 → 2,3 (2,6) | 0,68 → 1,54 (1,78) | 1,2 → 4,9 | 4 → 8 | 11 → 28,7 | 668 → 997 |

No preset Médio (shader completo do terreno) o software faz < 1 fps e entram 5–12 quadros por cenário
(`…-medio.json`): render 1,19 → 1,83 / 3,42 → 4,55 / 3,03 → 2,56 / 0,92 → 2,23 ms — só ruído a essa amostragem.

**CPU sem rasterização** (`node scripts/rendercpu.mjs`, novo: laço síncrono de 150 quadros por cenário com resolução
0,25, `render` = nosso `renderer.render`, `pixi` = `app.renderer.render`; `docs/perf/2026-09-25-etapa2b-{antes,depois}-cpu.json`,
segunda passada de cada página, mediana em ms):

| Cenário | render antes → assada (sem arte) | Pixi antes → assada (sem arte) | sprites antes → assada |
|---|---|---|---|
| zoom 1 (cidade) | 0,2 → 0,2 (0,2) | 0,5 → 0,6 (0,4) | 506 → 617 |
| mapa inteiro | 0,5 → 0,6 (0,6) | 1,6 → 2,4 (1,1) | 3 367 → 4 920 |
| zoom 1,5 aglomerado | 0,2 → 0,4 (0,2) | 0,5 → 0,7 (0,3) | 410 → 680 |
| rolagem | 0,2 → 0,2 (0,2) | 0,6 → 0,6 (0,3) | 413 → 622 |

Leitura:
- **Nosso código** (`renderer.render`) fica igual com a arte assada (vistas assadas escolhem quadro só quando muda a pose ou
  o quadro; props trocam de estágio por um número, sem recalcular nomes). O que cresce é o trabalho do **Pixi**, proporcional
  aos sprites: sombras dos props e máscaras de time somam +20–50 % de sprites e, com unidades andando, as faixas (props +
  entidades, ordenadas por y) refazem as instruções a cada quadro. Para conter isso o mundo, os props e as sombras dos props
  viraram grupos de render do Pixi 8 e as árvores no miolo do bosque não desenham sombra (−20 % de sprites num bosque denso).
  Resultado (Pixi, mediana): zoom 1 +0,1 ms (+20 %), rolagem igual, aglomerado +0,2 ms (+40 % de um número pequeno) e
  **mapa inteiro +0,8 ms (+50 %, 4 900 sprites)** — acima dos ~15 % pedidos nesses dois cenários, mas dentro do orçamento
  absoluto de §6 do ART.md (CPU do quadro ≤ 3 ms). Com a opção
  desligada o custo fica **abaixo** da base (os grupos de render ajudam o visual procedural também).
- **Rasterização por software** (fps): no preset Baixo empata ou melhora (1,8 → 1,8; 2,5 → 2,6; 1,2 → 2,0; 1,5 → 2,3), graças
  aos grupos de render (menos CPU disputando com o swiftshader) e ao filtro de mipmap `nearest` no atlas 1× (o trilinear
  custava ~40 % do fps da cena por software). Em GPU real isso é irrelevante; **pendente do dono**: `?perf=1` no PC e no Deck.
- **Draw calls** 3–6 → 8–15 nesta medição; boa parte disso **não** vinha da arte, e sim das faixas como grupos de render
  (cada grupo é um lote próprio) — ver as correções abaixo: 6–9. **Texturas** +18 MB (atlas 1× de units, buildings e props
  com os três passes e mipmaps; o 2× do preset alto soma ≈ 40 MB), longe do orçamento de 160 MB.
- **Desligada = visual idêntico**: `artshot --procedural` desta build × a build base dá 0 px de diferença em 5 das 6
  capturas e 103 px (0,008 %, efeito animado) na "cidade".

**Correções da revisão da Etapa 2B** (mesma sessão, build anterior × corrigida, preset Baixo, `--reveal`, 12 s por cenário;
`docs/perf/2026-09-25-etapa2b-correcoes-{baixo,cpu}.json`):
- **Faixas sem grupo de render**: draw calls 8 → 6 (zoom 1), 15 → 9 (mapa inteiro), 8 → 6 (aglomerado), 9 → 7 (rolagem).
  CPU (`rendercpu`, mediana das duas passadas): nosso código 0,2–0,3 / 0,6–0,8 / 0,3–0,4 / 0,2–0,3 ms e Pixi 0,5–0,6 /
  2,1–2,5 / 0,5–0,7 / 0,5–0,6 ms, contra 0,2–0,3 / 0,6 / 0,2–0,3 / 0,2 e 0,5 / 1,8–2,1 / 0,4–0,7 / 0,5–0,6 na build anterior
  — dentro do ruído de uma passada para outra: os grupos por faixa não poupavam CPU (com unidades andando todas as faixas
  refaziam as instruções a cada quadro).
- **Primeira partida sem troca de visual**: os atlas carregam no menu (`configure` → manifesto → grupos) e sobem para a GPU
  um por quadro no ticker; ao `startGame` a arte já é servida (0 reconstruções; antes, ≈ 3,4 s depois do início, um quadro de
  30–53 ms refazia os props do mapa inteiro e o seguinte fazia o upload de 5 atlas em 19–27 ms). Os props nascem por chunk
  quando ele entra na tela: `PropLayer.reset` do 144×144 caiu de 30–53 ms para 0,3–0,5 ms (260 sprites na tela inicial
  contra 2 806 do mapa inteiro). Ligar a opção no meio da partida reconstrói uma vez só (antes, duas).

## Desempenho do renderizador — Etapa 3 da arte (os 21 edifícios assados, 26/09/2026)

Antes = build da `main` atual (a0cd508, Etapa 2B: só o templo assado entre os edifícios; porta 4211) e depois = a
integração da Etapa 3 (base + lote economia + lote militar; porta 4210), rodadas uma após a outra na mesma máquina
compartilhada (4 CPUs, carga 3–7 de outras sessões: os números por software oscilam ±30 % entre rodadas iguais). Mesmo
método da Etapa 2B: preset Baixo, `--reveal`, 12 s por cenário, 4 rodadas de cada lado (duas gravadas em
`docs/perf/2026-09-26-etapa3-{antes,depois}-baixo{,-r2}.json`, duas anteriores à micro-otimização abaixo, com a mesma
tendência). Na partida medida (144×144, 3 IAs Muito difícil, 20 min) há 133–136 edifícios, todos assados agora.

**`renderperf` no preset Baixo** (mediana das 4 rodadas):

| Cenário | fps antes → depois | render média ms antes → depois | draw calls | tex MB | sprites |
|---|---|---|---|---|---|
| zoom 1 (cidade) | 7,4 → 6,6 (−11 %) | 0,66 → 0,69 (+5 %) | 5 → 6 | 23,2 → 74,4 | 729–745 → 804–816 |
| mapa inteiro | 9,3 → 8,8 (−5 %) | 0,96 → 1,20 (+24 %) | 8 → 7–8 | 25,9 → 74,5 | 4 995 → 5 164–5 172 |
| zoom 1,5 aglomerado | 8,0 → 8,1 (+1 %) | 0,70 → 0,81 (+15 %) | 5–6 → 7–8 | 26 → 74,6 | cena variável |
| rolagem | 8,1 → 7,9 (−2 %) | 0,69 → 0,80 (+16 %) | 5 → 7 | 26 → 74,6 | cena variável |

**CPU sem rasterização** (`rendercpu`, 150 quadros × 2 passadas, média em ms; `docs/perf/2026-09-26-etapa3-{antes,depois}-cpu.json`):

| Cenário | render antes → depois | Pixi antes → depois | sprites antes → depois |
|---|---|---|---|
| zoom 1 (cidade) | 0,22 → 0,29 | 0,52 → 0,64 | 638–680 → 718–755 |
| mapa inteiro | 0,69 → 0,74 (+7 %) | 2,79 → 3,01 (+8 %) | 4 989–5 009 → 5 167–5 179 |
| zoom 1,5 aglomerado | 0,35 → 0,41 | 0,82 → 0,88 | cena variável |
| rolagem | 0,35 → 0,41 | 0,80 → 0,92 | 636–645 → 641–647 |

Leitura:
- **fps (o quadro inteiro por software) fica dentro dos ~15 %** em todos os cenários (pior: zoom 1, −11 %).
- **CPU do nosso código**: no mapa inteiro o `renderperf` mede +0,24 ms (+24 %) e o `rendercpu` +0,05 ms (+7 %); no
  aglomerado e na rolagem, +0,1 ms (+15–16 %). A causa é o que a Etapa 3 acrescentou, não um laço caro: os ~135 edifícios
  passam pelo caminho assado (estado/variante/Idade/plantação, faixa ordenada por y, 3 sprites em vez de 2), a fumaça de
  dano e o colapso com escombros (partículas no relógio de jogo), o portão que abre (`updateGatesOpen`, O(unidades) só
  quando há portão) e o vórtice do portal. O perfil de CPU (CDP, 10 s no mapa inteiro) dá `updateEntities` 53,8 → 55,4 ms
  e o total de `render` praticamente igual. Absoluto: 0,7–1,2 ms por quadro, bem abaixo do orçamento de §6 do ART.md
  (≤ 3 ms). Micro-otimização desta integração: a vista não monta mais a chave `estado|variante` a cada quadro, a variante
  da muralha/portão fica guardada até a topologia mudar e a plantação da fazenda sai sem objeto temporário (sem lixo por
  quadro em cidades com muitas muralhas e fazendas).
- **Texturas residentes 26 → 74,5 MB** (1×, com mipmaps): os atlas `buildings` 1× passaram de 1 para 4 texturas (cor
  2048² + 2048×512, máscara 2048×512, sombra 2048²). Dentro do orçamento de §6 (≤ 160 MB típico); se apertar com as
  unidades da Etapa 4: sombras a ½ resolução, KTX2 ou páginas por Idade (pendência no ART.md).
- **Draw calls** +1–2 (5–8 → 6–8), longe do teto de 40. Com a arte desligada (`--baked off`,
  `…-depois-baixo-procedural.json`) as texturas voltam a 7–10 MB e os sprites a 3 282 no mapa inteiro.

### Revisão da Etapa 3 (26/09/2026)

Correções dos 12 achados da revisão (detalhe em `docs/ART.md`, Apêndice D, "Revisão"). Verificação: `npx vitest run`
**37 arquivos, 617 testes, código de saída 0** (a rodada da revisão dava 612/612 com saída 1 por `Timeout calling
"onTaskUpdate"`: o teste das sortidas da m10 simulava as 3 dificuldades num `it` de ≈ 26 s, que passava de 60 s com a
máquina carregada; agora é um `it` por dificuldade, ≈ 9 s cada); `art:check` ok (26 atlas, 12,25 MB de PNG, 193,8 MB de
VRAM com as duas escalas — antes 206,8: o empacotador junta quadros idênticos); `playtest.mjs`, `playtest-editor.mjs`
(com a muralha movida no editor conferindo o bitmask) e `artparade.mjs` sem erros; `artdiff etapa3-depois` 0 % contra as
referências (as cenas do `artshot` não têm muralha, portão nem maravilha danificada). No navegador (build de preview):
portão inimigo sob a névoa fica fechado com o hoplita dele a 0,8 tile e a casa danificada sob a névoa continua no quadro
visto; clique direito na grama acima do Centro Cívico inimigo → `move`, no telhado → `attack`; hoplita atrás do Centro
Cívico e do Colosso → hoplita; sob o portão ladeado por torres a faixa de sombra fica uniforme (luminância 40–60, antes
21–33 em ≈ 0,85 × 0,45 tile). Custo por quadro: a vista de edifício ganhou uma checagem de visibilidade e a chamada do
contorno (retorno imediato com a opção desligada); o alfa do pick é lido só na primeira consulta de cada quadro do atlas.

## Desempenho do renderizador — Etapa 4 da arte (as 19 unidades não míticas assadas, 26/09/2026)

Antes = build da `main` atual (2a9c61f, Etapa 3 integrada: só hoplita e cidadão assados entre as unidades; porta 4241) e
depois = a integração da Etapa 4 (base + lotes cavalaria, distância-cerco e heróis, com a sombra a ½ resolução e as
páginas NPOT; porta 4240), rodadas alternadas na mesma máquina (4 CPUs, sem outro trabalho pesado durante a medição).
Mesmo método das Etapas 2B/3: preset Baixo, `--reveal`, 12 s por cenário, 3 rodadas de cada lado (duas gravadas em
`docs/perf/2026-09-26-etapa4-{antes,depois}-baixo{,-r2}.json`). Na partida medida (144×144, 3 IAs Muito difícil, 20 min,
261 unidades, 133 edifícios) há 11 dos 19 tipos assados (cidadão, hoplita, hipaspista, mirmidão, toxota, arqueiro
cretense, hetairo, helépole, Jasão, Héracles, Perseu) e sobem também os 3 quentes da Arcaica que não estão no mapa (batedor,
milícia, rei) — antes só hoplita e cidadão saíam assados.

**`renderperf` no preset Baixo** (mediana das 3 rodadas):

| Cenário | fps antes → depois | render média ms antes → depois | draw calls | tex MB | sprites |
|---|---|---|---|---|---|
| zoom 1 (cidade) | 7,0 → 7,2 (+3 %) | 0,70 → 0,73 (+4 %) | 6 → 6 | 67,7 → 83,8 | 801–810 → 842–848 |
| mapa inteiro | 8,9 → 9,0 (+1 %) | 1,14 → 1,17 (+3 %) | 7–8 → 7–8 | 67,9 → 83,9 | 5 164–5 172 → 5 216–5 224 |
| zoom 1,5 aglomerado | 7,8 → 8,1 (+4 %) | 0,80 → 0,83 (+4 %) | 8 → 8 | 67,9 → 83,9 | cena variável |
| rolagem | 7,4 → 7,9 (+7 %) | 0,70 → 0,76 (+9 %) | 7 → 7 | 67,9 → 83,9 | cena variável |

**Texturas residentes (critério da Etapa 4: ≤ 100 MB no cenário de perf)**: **83,9 MB** no preset Baixo e **95,3 MB** no
Médio (`…-depois-medio.json`; o Médio carrega os materiais do terreno a 512²: antes 79,2 MB). Com os atlas como os lotes
os entregaram (sombra a 1:1, páginas em potência de 2) a mesma partida dava **134,9 MB** no Baixo (106,9 no Médio já com a
sombra a ½) — ver `docs/ART.md`, Apêndice E, "Integração".

**CPU sem rasterização** (`rendercpu`, 150 quadros × 2 passadas, média das duas em ms, arte assada;
`docs/perf/2026-09-26-etapa4-{antes,depois}-cpu.json`):

| Cenário | render antes → depois | Pixi antes → depois | sprites antes → depois |
|---|---|---|---|
| zoom 1 (cidade) | 0,24 → 0,25 | 0,58 → 0,55 | 718–755 → 721–770 |
| mapa inteiro | 0,70 → 0,70 | 2,88 → 2,81 | 5 167–5 179 → 5 216–5 229 |
| zoom 1,5 aglomerado | 0,41 → 0,46 (+11 %) | 0,96 → 0,98 | 625–952 → 660–993 |
| rolagem | 0,39 → 0,36 | 0,91 → 1,01 (+10 %) | 641–646 → 641–646 |

Leitura:
- **fps (o quadro inteiro por software) igual ou melhor** em todos os cenários (+1 a +7 %): as unidades assadas trocam
  o disco procedural (vários `Graphics` por unidade) por 3 sprites do mesmo atlas.
- **CPU do nosso código** +0,03–0,06 ms no `renderperf` (+3 a +9 %) e dentro de ±11 % no `rendercpu` (o aglomerado
  +0,05 ms: mais vistas assadas, com a escolha de animação e o `ability` dos heróis); o Pixi fica igual (±10 %). Nada
  pior que ~15 %, e o absoluto (0,7–1,2 ms) segue bem abaixo do orçamento de §6 do ART.md (≤ 3 ms).
- **Texturas 67,9 → 83,9 MB** (Baixo): +16 MB pelas 3 páginas de unidades (cor 2048×2016 + 2048×992, máscara 2048×1024,
  sombra 2048×960, com mipmaps), já descontada a economia da sombra a ½ nos edifícios e props e das páginas NPOT.
- **Draw calls iguais** (6–8), longe do teto de 40.

## Matriz de testes (6.8, por versão candidata)

Automáticos primeiro (checklist abaixo); a matriz é o que só uma pessoa com o hardware consegue conferir. Cada célula
marcada roda o **roteiro base**: 1 partida rápida completa (vitória por conquista), 1 missão da campanha, 1 partida online
com outro computador (chat, queda proposital e reconexão), 1 Horda até a onda 10, salvar/carregar/exportar, trocar o idioma.

### Plataformas e hardware
| Plataforma | Máquina de referência | Build | Metas | Além do roteiro base |
|---|---|---|---|---|
| Windows 11 x64 | GPU integrada (Intel Iris Xe / Radeon Vega 8), 8 GB | `dist:win` pela Steam | 60 fps no menu, ≥ 30 fps em partida grande (preset Média) | Tela cheia/janela, F11, escala 125 %, teclado ABNT2 (atalhos), conquista destravada aparece no overlay da Steam, Rich Presence visível a um amigo |
| Windows 10 22H2 x64 | GPU dedicada (GTX 1060 / RX 580), 16 GB | `dist:win` pela Steam | 60 fps no preset Alta | Mapa grande, 4 IAs Muito difícil por 30 min; renderização 100 % |
| Linux desktop (Ubuntu 22.04/24.04, X11 e Wayland) | GPU integrada | `dist:linux` pela Steam | ≥ 30 fps (Média) | `xvfb-run -a node scripts/playtest-desktop.mjs` antes; sessão real com tela cheia e controle |
| Steam Deck (LCD e OLED), Gaming Mode e Desktop | Deck | build Windows pelo Proton **e** build Linux nativa | 40 fps a 1280×800 (Baixa/Média) | Tudo da tabela "Controle e Steam" abaixo; teclado virtual da Steam nos campos de texto (nome, sala, chat); suspender e retomar no meio da partida |
| macOS 13+ (Apple Silicon e Intel) | MacBook Air M1 8 GB | `dist:mac` (assinado/notarizado) | 60 fps | Tela cheia nativa; atalhos com ⌘ sem conflito (Ctrl+M/Ctrl+A); Retina |
| Máquina fraca | 4 GB RAM, GPU de 2015 (Intel HD 520), HDD | Windows | Jogável com renderização 50 % e preset Baixa; carregar < 10 s | Sem travamentos em 20 min; o preset automático desce sozinho |

### Resoluções e escala da interface
| Resolução | Escala | Onde testar | Verificar |
|---|---|---|---|
| 1280×800 (Deck) | 130 % | Deck | Barra superior compacta numa linha; menu e modais (Créditos, Opções, Enciclopédia) inteiros na tela, rolando por dentro; dicas de botões |
| 1366×768 | 100 % | notebook fraco | HUD sem sobreposição; minimapa e painel de comandos inteiros |
| 1920×1080 | 100 % e 115 % | Windows | Referência das capturas (`npm run art:shot`) |
| 2560×1440 | 115 % | GPU dedicada | Textos nítidos, sem serrilhado no mapa |
| 3840×2160 (4K) | 150 % e DPI 200 % do sistema | Windows / macOS Retina | Interface legível (`devicePixelRatio` 2), 60 fps com renderização 100 % e 75 %, nada borrado |
| Janela redimensionada e ultrawide 3440×1440 | 100 % | qualquer | O canvas acompanha, sem faixa preta; o menu centraliza |

### Idiomas
| Idioma | Verificar |
|---|---|
| Português (Brasil) | Todos os textos, acentos, teclado ABNT2; campanha inteira (falas, objetivos, fim da m12) |
| English | `node scripts/playtest-i18n.mjs` e `playtest-credits.mjs` (automáticos) + menu, campanha (falas), enciclopédia, conquistas (aviso), Créditos, Rich Presence em inglês |
| Sistema em outro idioma (ex.: espanhol) | Primeira execução abre em inglês (`detectLocale`); trocar para PT no menu e na partida |

### Controle e Steam (versão Steam)
| Item | Verificar |
|---|---|
| Controle | Layout "Gamepad" do Steam Input (não "teclado e mouse"): aviso de conexão; menu só pelo D-pad (abas com LB/RB, A confirma, B volta); cursor virtual (analógico esquerdo, acelera, freia sobre unidades), A seleciona/retângulo, B ordem, X atacar-mover, Y parar, LT + A/B/X/Y painel, D-pad ◀▶▲▼, ⧉ visão geral, Start menu; vibração ao sofrer ataque; trackpad/mouse devolve o cursor do sistema; Opções → 🎮 Controle |
| Conquistas | Destravar 2–3 (ex.: Primeira Oferenda, Filósofo) e ver no overlay/perfil; conquista destravada fora da Steam aparece na Steam na próxima abertura (`syncToSteam`) |
| Steam Cloud | PC → Deck: salvar (F5), avançar a campanha e mudar uma opção no PC; fechar; abrir no Deck → save, campanha, opções e Meus mapas aparecem; o caminho inverso também. Conflito (as duas máquinas jogaram offline) → o diálogo da Steam decide; o jogo aplica o que ficou nos arquivos |
| Rich Presence | Um amigo vê "No menu principal" e "‹Idade› · ‹min› min" |

## Checklist de lançamento (Early Access)

### Automáticos (o agente roda; todos têm de passar na build candidata)
- [ ] `npm run typecheck` e `npm test`
- [ ] `npm run build`
- [ ] `npx tsx scripts/missions.ts` — 12 missões × 3 dificuldades dentro da janela
- [ ] `npm run smoke 20 42` duas vezes — mesmo `hash final`
- [ ] `npm run map:check` e `npx tsx scripts/horde.ts`
- [ ] `npm run balance 30 1,2,3,4,5,6` — idades nos minutos de referência, ninguém travado
- [ ] `npx tsx scripts/perf.ts` — média < 3 ms/tick, pior < 50 ms
- [ ] `npx tsx scripts/steam-achievements.ts --check` — planilha em dia (40 conquistas, 10 ocultas); a contagem no Steamworks bate
- [ ] `npx tsx scripts/licenses.ts --check` — licenças em dia, nenhuma GPL/AGPL/desconhecida no pacote
- [ ] `npm run preview` + `node scripts/playtest.mjs`, `playtest-campaign.mjs`, `playtest-options.mjs`, `playtest-i18n.mjs`, `playtest-credits.mjs`, `playtest-gamepad.mjs`, `playtest-editor.mjs`, `playtest-horde-replay.mjs`
- [ ] `npm run relay` + `playtest-mp.mjs`, `playtest-reconnect.mjs`, `playtest-rooms.mjs`, `playtest-spectate.mjs`, `playtest-scenario.mjs`
- [ ] `npm run loadtest -- --minutes 40 --bots 4` — 480/480 hashes iguais
- [ ] `npm run art:shot` + `npm run art:diff` — só diferenças intencionais
- [ ] `npm ci` e `npm run dist:linux` em `desktop/` + `xvfb-run -a node scripts/playtest-desktop.mjs` — `app://`, ponte, partida, tela cheia, espelho do Steam Cloud (apagar o localStorage e restaurar dos arquivos)
- [ ] `npm run dist:win` (e `dist:mac` quando houver conta Apple) gerados da mesma revisão

### Manuais e do dono
- [ ] Matriz acima com a build candidata (cada linha de plataforma com o roteiro base; resoluções e idiomas distribuídos entre as máquinas).
- [ ] Versão e notas de atualização (PT/EN); `package.json` e `desktop/package.json` com a mesma versão; `SIM_VERSION` subiu se a mesma semente passou a dar outra partida.
- [ ] Conta Steamworks e App ID em `desktop/steam_appid.txt` (hoje 480, o app de testes da Valve).
- [ ] Conquistas cadastradas conforme `docs/STEAM.md` §4.1 (API name = id, English + Portuguese-Brazil, ocultas), com os ícones 256×256; destravar uma com a build da Steam.
- [ ] Steam Cloud configurado conforme `docs/STEAM.md` §4.2 (200 MB, 300 arquivos, raiz Windows + overrides Linux/macOS) e testado entre duas máquinas.
- [ ] Rich Presence: `desktop/steam/rich_presence.vdf` enviado.
- [ ] Depots Windows e Linux (macOS se houver) via SteamPipe, opções de inicialização, branches `default` (público) e `beta` (testadores); upload testado com a conta de desenvolvedor.
- [ ] Steam Input: configuração padrão "Gamepad" publicada; verificação do Steam Deck submetida.
- [ ] Ícone/logo do executável (`desktop/icon.ico` e equivalentes Linux/macOS).
- [ ] Assinatura de código no Windows (evita o aviso do SmartScreen) e notarização no macOS.
- [ ] EULA e política de privacidade (PT/EN) preenchidas, revisadas e publicadas; link na página da Steam (`docs/LEGAL.md` §6–7).
- [ ] Servidor de retransmissão em produção: `wss://` com certificado, `OFFICIAL_RELAY_URL` em `src/ui/menu.ts` apontando para ele (hoje vazio: o desktop usa `ws://localhost:8787`), monitoramento de uptime, retenção do log definida.
- [ ] Página da Steam: cápsulas, 6+ screenshots atuais, trailer, descrição PT/EN, tags, requisitos mínimos/recomendados (tirados da matriz).
- [ ] Classificação indicativa (questionário IARC na Steam).
- [ ] Plano de hotfix: quem aprova, como publicar em < 24 h, canal de suporte (Discord/e-mail) na página.
- [ ] Backup do repositório e das chaves (Steamworks, certificado do servidor, assinatura de código).

## Relato de problemas pelos jogadores

Pedir sempre: (1) o arquivo do **diagnóstico** (menu da partida → "Exportar diagnóstico"), (2) o que estava fazendo,
(3) se era online, o nome da sala e o horário. O diagnóstico contém o save, as configurações, os últimos erros e o relatório de
dessincronização — permite reproduzir a partida localmente com `Session.load`. Numa dessincronização (4.5), o relatório (`desync` e
`desyncLive`) traz o tick, o hash de cada jogador, as categorias que divergiram por jogador (`resources:1`, `units:0`, `world`…) e o
resumo do estado local nesse tick; peça o diagnóstico de **dois** jogadores da mesma partida e compare os `summary` para achar o valor
que difere (docs/DESIGN.md, "Anti-trapaça e relatório de dessincronização").
