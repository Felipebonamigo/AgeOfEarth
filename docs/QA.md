# QA — matriz de testes e checklist de lançamento (Fase 6.8)

## Verificações automáticas (rodar antes de cada build publicado)

| Comando | O que cobre | Tempo |
|---|---|---|
| `npm run typecheck` | Tipos estritos | ~10 s |
| `npm test` | 288 testes: dados (inclui `checkMap` dos mapas embutidos, recursos iguais por início e mapas oficiais reprodutíveis pelos scripts), determinismo, pathfinding, simulação, regressões, cenários, lockstep/reconexão, modos, mapas fixos, editor, qualidade, áudio, controle, shader do terreno | ~15 s |
| `npm run balance 30 1,2,3,4,5,6` | 6 partidas IA×IA de 30 min: idades (Clássica ~5, Heroica 12–18, Mítica 19–26), ninguém travado | ~2 min |
| `npx tsx scripts/missions.ts` | Todas as missões do registro × 3 dificuldades: validação, viabilidade passiva e o roteiro do jogador (`MISSION_SCRIPTS` em `src/core/scenario/testing.ts`) vencendo dentro da janela. Referência 26/09/2026 (IA relativa ao centro do mapa; roteiros da m2 e da m4 reajustados — só o roteiro, nunca a missão): m1 14m38s/14m26s/15m53s, m2 14m54s/15m01s/21m47s, m3 18m23s/18m25s/18m40s, m4 17m56s/20m08s/21m20s, m6 18m56s/21m28s/24m06s (Fácil/Normal/Difícil) | ~4 min |
| `npm run map:check [arquivo.map.json…]` | Sem arquivos: os mapas embutidos. Validação (erros/avisos), tabela de recursos por início (raio 16) e 2 min de IA×IA em cada (`src/core/map/check.ts`, o mesmo que `tests/data.test.ts` exige): falha com erro, IA parada ou partida encerrada no 1º minuto | ~5 s |
| `npx tsx scripts/maps/estreito.ts` / `scripts/maps/egeu.ts [saída]` | Regeram os mapas oficiais com as ops do editor; recusam gravar com erro de validação, assimetria, recursos desiguais, vizinhança de início diferente ou rota selável (corte mínimo < 5 tiles ou um edifício de até 4×4 que a feche sozinho, com as outras rotas fechadas; `routeReport` em `scripts/maps/lib.ts`); o teste confere que o arquivo embutido é exatamente o que o script gera | ~3 s |
| `npx tsx scripts/maps/fairness.ts <mapa ou id> [min=45] [sementes=1-16] [deuses=zeus] --both --jobs 3` (+ `--swap`, `--order 2,3,0,1`, `--mirror-ai`, `--json saída`) | Justiça por início: IA×IA com o **mesmo deus em todos os inícios** (espelho; deuses diferentes escondem o viés de posição), vitórias e minutos das idades por início; nas partidas sem vencedor conta quem está **à frente no fim** (edifícios + unidades). `--both` roda cada semente nas duas ordens de inícios e separa POSIÇÃO (lado do início) de ÍNDICE (ordem dos jogadores); `--mirror-ai` dá a mesma personalidade de IA a todos (deuses menores e casas iguais). Critério: ≥ 16 sementes, nenhum lado com > 65 % de decididas + à frente, por posição e por índice. Referência 26/09/2026 (45 min, Normal, Zeus; HEAD anterior → atual): **Egeu** 32 × 2 ordens posição 45 × 19 (70 %) → **37 × 27 (58 %)**, índice 35 × 29 (55 %), 59/64 decididas; **Egeu transposto** 16: 5 × 11 → 8 × 8; **Estreito** 32 × 2 ordens 31 × 33 → 38 × 26 (59 %), índice 40 × 24 (63 %); Poseidon 16: 6 × 10 (63 %). Só na ordem padrão o Estreito dá 22 × 8 — é a personalidade da IA por índice (deuses menores opostos), não a posição: com `--mirror-ai`, 20 × 12. Mapa gerado 1v1 (small, 42): 16 × 0 antes e depois (ouro 3600 × 1800 a ≤ 16 tiles: o mapa é desigual) | ~10 min (3 processos, 64 partidas) |
| `npm run smoke 20 42` duas vezes | IA×IA 20 min sem interface; a última linha (`hash final`) tem de ser igual nas duas (determinismo de ponta a ponta). Referência 26/09/2026: `4e899382`, ~0,28 ms/tick | ~15 s |
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
| `npm run relay` + `node scripts/playtest-mp.mjs`, `playtest-reconnect.mjs`, `playtest-mp-fixedmap.mjs`, `playtest-rooms.mjs`, `playtest-spectate.mjs` | Dois navegadores em lockstep, chat, ping, queda e reconexão, mapa fixo no lobby, lista de salas, espectadores | ~4 min |
| `npm run loadtest -- --minutes 40 --bots 4` (+ `--jitter 60 --drop-at 8 --spectator-at 12`, `--map arquivo.map.json`, `--realtime`) | Teste de carga do multiplayer (4.4): relay próprio + N bots em Node, cada um com NetClient e a própria simulação (fluxo de `startNetworkGame`/`rejoinNetworkGame`), comandos determinísticos (coleta, casas/quartel/templo/academia, treino, Idades, pesquisa, mercado, ataque-mover a cada ~3 min, poderes). Hash de todos a cada 100 ticks (divergência → estado de todos + refazer offline até o primeiro tick e diff por caminho), banda, instantâneo, ms/tick, espera pela rede, CPU/RSS do relay; queda com espera+reconexão, "seguir sem ele" (`--drop-mode resume`/`resume-rejoin`), espectador no meio; `--inject-desync M[:cmd]` autotesta o detector. Relatório em `docs/perf/loadtest-<data>.json`. Referência 25/09/2026 (4 CPUs, carga ~10–14 de outros processos): **4 bots × 40 min, mapa grande, atraso 4**: 480/480 hashes iguais, 91–155 s reais, 1,0–1,8 ms/tick, ~42 KB/min enviados e ~159 KB/min recebidos por jogador (20 msg/s env., 61 msg/s rec.), relay 70 MB RSS e ~0,3 s de CPU por minuto simulado, pico 183 unidades/102 edifícios; **4 × 20 min, jitter 60, queda aos 8 (espera+reconexão) e espectador aos 12**: 240/240 iguais, instantâneo 695–728 KB (serialize 18–24 ms, aplicado em 11–16 ms); **2 × 10 min no Estreito**: 120/120; **tempo real, jitter 20–80**: atraso 4 → ≤ 0,04 % de quadros travados; atraso 2 → 1,8–3,7 % (lentidão 0,2–0,4 %); relay 2,2 % de um núcleo por sala de 4 | 2–6 min |
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

## Matriz manual (por versão candidata)

| Ambiente | Mínimo | Verificar |
|---|---|---|
| Windows 10/11, GPU integrada | 60 fps no menu, ≥ 30 fps em partida grande | Tela cheia/janela, F11, escala da interface 125%, teclado ABNT (atalhos), salvar/carregar/exportar, conquistas Steam |
| Windows, GPU dedicada | 60 fps | Qualidade de renderização 100%, mapa grande com 4 IAs Muito difícil por 30 min |
| Linux (Steam Deck em modo desktop e Gaming Mode) | 40 fps a 1280×800 | Legibilidade com escala 130% (barra superior numa linha, menu e modais inteiros na tela), tela cheia. **Controle integrado** (layout "Gamepad" do Steam Input, não "teclado e mouse"): aviso de conexão; menu principal só pelo D-pad (abas com LB/RB, A confirma, B volta, listas com A → ✚ → A); cursor virtual (analógico esquerdo, acelera ao segurar, freia sobre unidades), A seleciona/segurar e mover faz retângulo, B ordem, X atacar-mover, Y parar, LT + A/B/X/Y painel, D-pad ◀▶▲▼, ⧉ visão geral, Start menu; vibração ao sofrer ataque; mexer no trackpad/mouse devolve o cursor do sistema; Opções → 🎮 Controle (sensibilidade, eixo, esquema alternativo, vibração) |
| macOS | 60 fps | Tela cheia nativa, atalhos com ⌘ não conflitando (Ctrl+M/Ctrl+A) |
| Máquina fraca (4 GB, GPU antiga) | Jogável a 50% de renderização | Sem travamentos; tempo de carregamento < 10 s |

Para cada linha: 1 partida rápida completa (vitória por conquista), 1 missão da campanha, 1 partida online com outro computador
(chat, queda proposital e reconexão), 1 Horda até a onda 10.

## Checklist de lançamento (Early Access)

- [ ] Versão e notas de atualização (PT/EN) escritas; `desktop/package.json` com a versão certa.
- [ ] Build Electron para Windows (x64), Linux (x64) e macOS; testes de fumaça em cada um.
- [ ] `THIRD_PARTY.txt`, EULA e política de privacidade incluídos e linkados (ver `docs/LEGAL.md`).
- [ ] Conquistas cadastradas no Steamworks com os mesmos ids de `src/game/achievements.ts`.
- [ ] Servidor de retransmissão em produção (VPS com `wss://` e certificado), endereço padrão no jogo apontando para ele, monitoramento de uptime.
- [ ] Página da Steam: cápsulas, 6+ screenshots atuais, trailer, descrição PT/EN, tags, requisitos mínimos/recomendados.
- [ ] Depot e branches na Steam: `default` (público) e `beta` (testadores); upload via SteamPipe testado com a conta de desenvolvedor.
- [ ] Plano de hotfix: quem aprova, como publicar em < 24 h, canal de suporte (Discord/e-mail) na página.
- [ ] Backup do repositório e das chaves (Steamworks, certificado do servidor).

## Relato de problemas pelos jogadores

Pedir sempre: (1) o arquivo do **diagnóstico** (menu da partida → "Exportar diagnóstico"), (2) o que estava fazendo,
(3) se era online, o nome da sala e o horário. O diagnóstico contém o save, as configurações, os últimos erros e o relatório de
dessincronização — permite reproduzir a partida localmente com `Session.load`.
