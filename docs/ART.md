# Direção de arte e pipeline visual — Age of Earth (contrato da Fase 2)

> **Estado deste documento**: contrato vivo da Fase 2 do `docs/ROADMAP.md` (passos 2.1–2.4 e a parte visual de 2.5). Escrito em set/2026 a partir do relatório do renderizador, de três propostas concorrentes (A, B, C) com protótipos medidos e de três vereditos independentes. Ao concluir uma etapa, marque-a na seção 5 e registre os números na seção 6. Documentos irmãos: `docs/DESIGN.md` (jogo), `docs/EDITOR.md` (editor de mapas, que usa o mesmo renderizador), `docs/ART_ASSETS.md` (briefing para artistas — a ser reescrito na Etapa 8 conforme a seção 3.4), `docs/QA.md` (metas de desempenho), `docs/LEGAL.md` (licenças), `docs/STEAM.md` (pacote).

## 0. Resumo da decisão

**O jogo continua 100 % PixiJS 2D, com a câmera top-down atual, e ganha realismo por dois pipelines próprios:**

1. **Terreno por shader** — um `Mesh` por chunk (16×16 tiles) com um único shader de *splatting* de materiais tileáveis gerados por ruído (albedo + altura + normal), iluminados por um sol fixo, com *texture bombing* contra repetição, água animada, espuma, fronteiras de território e névoa suaves. Sem grade, sem `generateTexture` por chunk.
2. **Sprites pré-renderizados em tempo de build** — modelos paramétricos (ou `.glb` comprados/comissionados no futuro) montados em three.js, iluminados pelo mesmo sol, com sombras reais, materiais PBR e cor de time em máscara, fotografados pelo Chromium headless em 8 direções × quadros de animação e empacotados em atlas PNG + JSON no formato de `Spritesheet` do Pixi. É o método de Age of Empires II/Age of Mythology: a iluminação, os materiais e as sombras vêm de graça do renderizador 3D, não da mão de um artista.

**Vencedora: Abordagem B** (notas dos juízes 7,4 · 7,8 · 7,9 — a melhor nos três vereditos), enxertada com as partes da **Abordagem A** que já foram prototipadas e medidas (terreno com bombing e normais, névoa por shader, fronteiras no shader, partículas e decalques com orçamento, presets de qualidade, script de perf, teste de manifesto). A **Abordagem C** (mundo 3D real em three.js) fica registrada como opção condicional futura (seção 2.4): tem o maior teto estrutural, mas hoje mostra cápsulas coloridas, reescreve câmera/seleção/minimapa/editor e é a mais incerta em GPU integrada.

**Escopo estimado: ≈ 344 h em 9 etapas (faixa realista 300–380 h)**, com uma entrega visível por etapa e a **Etapa 0 (12 h) já mudando o que se vê**. Nada em `src/core` muda. Licenças: só código próprio, PixiJS (MIT), three.js (MIT, apenas em build) e arte gerada pelo próprio pipeline. Nenhuma imagem por IA sem autorização explícita do dono.

---

## 1. Direção de arte

### 1.1 Diagnóstico do que existe (captura `scratchpad/atual.png`, set/2026)

Placeholder chapado: tiles com dois tons e grade visível, árvores como três círculos verdes, unidades como círculos vistos de cima que giram 360°, sombra assada girando junto com o corpo, fronteira azul em degraus de 2,5 px, névoa em blocos de 32 px borrados, edifícios como retângulos com telhado ripado, ícones em emoji. Não há uma fonte de luz, não há materiais, não há escala humana legível. Tudo em `src/render/textures.ts` (324 linhas) e `src/render/renderer.ts` (723 linhas — inclui a camada do editor já desenhada: regiões/passabilidade como texturas w×h, pincel, fantasmas, inícios, grade).

### 1.2 Referências que o dono reconhece

| Referência | O que copiar | O que não copiar |
|---|---|---|
| **Age of Mythology (2002 / Retold)** | Escala e leitura: humano ≈ 1 tile de altura, edifícios grandes e legíveis, míticas 1,5–3× maiores, templos de mármore com telhado de terracota, poderes divinos como espetáculo, cor de time em capas/escudos/estandartes | Proporções "cabeçudas"; a nossa é 1:7 (realista) |
| **Age of Empires II DE** | Vista 3/4 com sprites pré-renderizados, sombras coladas ao chão, 8 direções, árvores densas que ocluem unidades, transições macias de terreno | Grade dimétrica do mapa (o nosso chão continua quadrado) |
| **Age of Empires IV** | Materiais: mármore, bronze envelhecido, terracota, madeira, linho; terreno com relevo iluminado; água com espuma na margem; paleta calma | Câmera rotacionável |
| **Rise of Nations** | Fronteira de território como linha fina e suave no chão com leve tingimento, densidade de vegetação, mapa lido de longe | Tiles visíveis |
| **Total War (Rome II)** | Uma luz só, quente; oclusão ambiente no pé das coisas; poeira e fumaça de combate; massa de tropas com sombra | Milhares de soldados por unidade |

### 1.3 O que "realismo" significa aqui — contrato visual em 10 regras

Toda entrega visual é conferida contra esta lista (captura lida com a ferramenta Read + `scripts/artdiff.mjs`).

1. **Uma luz, uma direção.** Sol único a **noroeste-alto**; todas as sombras (terreno, árvores, edifícios, unidades, partículas) caem para **sudeste** (direita-baixo na tela) com o mesmo comprimento relativo. O vetor do sol vive em um único lugar (`scripts/bake/page/camera.js`, ver 3.2) e o shader do terreno deriva `uSun` dele. Nada de sombra assada girando com a unidade.
2. **Materiais, não cores.** Bronze (metálico, reflexo), linho (fosco), couro, madeira, mármore, terracota, pedra, folha, pele/escama. Cada material tem albedo + rugosidade (+ metalicidade) no bake. O jogador lê "escudo de bronze" antes de ler "círculo laranja".
3. **Escala e proporção humanas.** 1 tile = 2 m. Humano 1,8 m ≈ 0,9 tile; cavalo 1,6 m no dorso; lança de 2,4 m; templo 3×3 = 6×6 m com colunas de 2,6 m. Míticas: minotauro 2,6 m, ciclope 4,5 m, colosso 8 m; titãs 12–14 m (raio 1,1 tile já nos dados). Nenhum edifício acima de ~2,2 tiles de altura visual, para não esconder tropas. **Exceção registrada (Etapa 3)**: as maravilhas e o Portal dos Titãs (4×4 e 5×5, marcos de fim de partida) vão até ≈ 3 tiles — Colosso 2,72, Templo de Ártemis 2,31, Estátua de Zeus 1,75, Portal 1,16 (altura acima da borda norte da pegada no atlas 1×); a parte alta fica no meio/fundo da área e o pick por alfa (§1.8) deixa clicar a tropa vista atrás delas (pergunta 18).
4. **Paleta terrosa e dessaturada** (tabela em 1.6): verdes oliva com manchas secas, ocres, areia quente, água azul-petróleo escurecendo com a profundidade, rocha cinza-quente. Cor de time só em túnica, capa, escudo, xairel, estandarte e telhado de tenda (máscara), nunca no corpo inteiro.
5. **Vegetação densa e variada.** Três espécies (oliveira, cipreste, carvalho) × 4 variantes × 2 escalas + tocos; arbustos, rochas, flores e grama alta dispersos pelo `decor` já existente; copas com sombra própria no chão e **oclusão** de unidades atrás (árvores saem do chunk e viram sprites com `zIndex = y`).
6. **Água viva.** Normais animadas por duas camadas de ruído, especular do sol, cor por profundidade (rasa clara e esverdeada, profunda escura), espuma na margem, areia molhada escurecida na faixa de 1 tile.
7. **Relevo sem mapa de altura.** O estado não tem elevação (só o tipo de tile); o relevo é visual: normal map dos materiais + colinas macro por ruído de baixa frequência + AO leve + rocha por "encosta" nas montanhas com topo claro. O editor continua mostrando o que é caminhável pela sobreposição de passabilidade (já existe), não pelo relevo.
8. **Sem grade visível em nenhum zoom (0,35–2,2).** Transições por peso bilinear + ruído (≈ 1 tile de largura), duas escalas de textura, bombing por células de 4 tiles com rotação/deslocamento hasheados.
9. **Legibilidade tática preservada.** Contorno de seleção, barras de vida e ponto de encontro em pixels de tela (como hoje); cor de time saturada o bastante sobre a paleta terrosa; opção "contorno de time" para daltonismo e zoom baixo; teste obrigatório a zoom 0,35 / 1,3 / 2,2 em toda etapa.
10. **Interface coerente com o mundo.** Ícones e retratos renderizados dos mesmos modelos (câmera 3/4, fundo neutro), molduras de mármore/bronze, cursores próprios; zero emoji na partida ao fim da Etapa 7.

### 1.4 Câmera e escala (o "contrato de câmera")

- **Câmera do jogo: inalterada.** `src/render/camera.ts` top-down ortográfica sem rotação, `world.scale = zoom`, zoom 0,35–2,2 (padrão 1,3), `screenToWorld`/`pick`/minimapa/névoa/editor intocados. `TILE = 32` continua.
- **Câmera do bake: ortográfica inclinada ("3/4 falso").** Pitch **50°** (recomendado; pergunta 1 ao dono) com estiramento vertical `1/sin(50°) = 1,305` na matriz de projeção, de modo que **o chão projeta 1:1** (1 tile = 1 tile quadrado na tela) e as verticais aparecem com fator `cos(50°)·1,305 ≈ 0,84` da altura real. Resultado: unidades "em pé" com escudo e elmo visíveis, edifícios com fachada e telhado, mas o pé de cada sprite cai exatamente na posição lógica. É o truque de AoE2 sem a rotação dimétrica do mapa. Topo puro = `PITCH = 90°` no mesmo pipeline; nada mais muda.
- **Pixels por tile.** Atlas base a **1× (32 px/tile)**, obrigatório (Steam Deck/integrada). Pacote **2× (64 px/tile)** opcional para zoom > 1,4 em GPU dedicada, gerado pelo mesmo bake (`--scale 2`). Tamanhos de quadro a 1×: humano 48×51 px (altura visual ≈ 24 px a zoom 1, 31 px a zoom 1,3); cavalaria 64×64; cerco 80×80; míticas 64–112; colosso 112×128; titã 128×144; casa 2×2 → 80×90; templo 3×3 → 128×147; fortaleza 4×4 → 160×180; portal dos titãs 5×5 → 192×215.
- **Direções: 8** (E, SE, S, SO, O, NO, N, NE; índice `dir = ((round(angle/(π/4)) % 8) + 8) % 8`, com `angle` já calculado em `updateEntities`). Padrão: **8 assadas**; `--mirror` no bake produz 5 + 3 espelhadas (escudo troca de lado, como AoE2) se a memória apertar (pergunta 2).
- **Âncora no pé**, gravada por quadro no JSON (`anchor.y` 0,80–0,85 em unidades, 0,70–0,78 em edifícios); sombras usam a mesma âncora; `zIndex = y` do pé, exatamente como hoje.
- **Animações a 10 fps** (como já pedia `ART_ASSETS.md`): parado 4, andar 8, atacar 6, morrer 6; cidadão + carregar 6 e coletar 4 (machado/picareta/foice); Pégaso planar 6; cerco parado 1/andar 6/atacar 8; titãs + ascensão 8.

### 1.5 Iluminação e sombras

- Bake: `DirectionalLight` quente (0xfff0d8, intensidade ≈ 2,6) na direção `(-0,55; 1,0; 0,35)` (coordenadas three.js; sombras para SE na tela), `HemisphereLight` céu azulado/chão terroso, `PCFSoftShadowMap` 2048², tone mapping ACES, saída sRGB. Três passes por quadro: **cor**, **máscara de time** (só materiais marcados `team`, em cinza iluminado para receber `tint` sem perder o sombreado) e **sombra** (`ShadowMaterial` no chão, modelo invisível).
- Jogo: sombras como **sprites separados** na camada `shadows` (alfa 0,45, `blendMode 'multiply'`), sem rotação (o sol é fixo). Ficam sob unidades, edifícios e árvores e caem sobre terreno, água e outras unidades. Desligáveis no preset mínimo.
- Terreno: mesma direção de luz em espaço de tela (`uSun = normalize(-0,45; -0,55; 0,70)`, y para baixo, z para cima): normal map + relevo macro + AO nos vales.
- Ciclo de luz: as sombras são assadas, então só a **cor** da luz e da névoa pode variar (amanhecer/entardecer por `ColorMatrixFilter` na `stage`, custo ≤ 0,5 ms), nunca a direção. Opcional, Etapa 5 (pergunta 10).

### 1.6 Paleta e materiais (valores de referência)

| Uso | Cor (0xRRGGBB) | Observação |
|---|---|---|
| Grama viva / seca | `0x5f7a33` / `0x8a8a4a` | Hoje `TERRAIN_PALETTE` usa `0x4f8a34` (saturado demais) — recalibrar na Etapa 0 |
| Terra | `0x8a6b40` | mantém |
| Areia | `0xd3c294` | hoje `0xd8c78c`; areia molhada = ×0,75 |
| Água rasa / profunda | `0x2a6a86` / `0x184a66` | hoje `0x2f79b5` / `0x1f5a8f` (azul-piscina) |
| Rocha / montanha | `0x74736c` | mantém; topo `0xd8d6cf` |
| Mármore | `0xd9cdb4` (rough 0,55) | AO nas juntas assado |
| Bronze | `0x8c6a2e` (metal 0,9, rough 0,35) | armas, elmos, escudos |
| Terracota | `0xa3552e` (rough 0,85) | telhados |
| Madeira / couro / linho | `0x6b4a2b` / `0x5a3d26` / `0xe8dcc0` | rough 0,8–0,95 |
| Cor de time (4) | azul `0x2f4fa8`, vermelho `0xa8322f`, verde `0x5a8a2f`, amarelo `0xd0a12e` | versões tingidas das atuais em `PLAYER_COLORS`; a HUD mantém as saturadas (pergunta 4) |

`src/render/palette.ts` passa a exportar também `SUN_DIR`, `SHADOW_ALPHA` e `TEAM_TINT`. `TERRAIN_PALETTE` continua sendo a fonte do minimapa do editor e da legenda; a base do minimapa da partida passa a vir das cores reais do terreno (3.8).

### 1.7 Terreno, vegetação e água

Seis tipos (`TERRAIN`: grama, água, montanha, areia, terra, profunda) com o `decor` (0–255 por tile) como semente de variação. Materiais tileáveis 512² gerados por fBm/ridged (`scripts/bake/page/terrain.js` → `public/art/terrain/*.png`, albedo com altura no alfa + normal por Sobel), com **fallback em runtime** (≈ 200 ms para 4 materiais 256²) quando os PNG não existem. Transições sem autotiling: peso por tipo numa textura w×h RGBA amostrada bilinearmente + blend por altura + ruído. Montanha = rocha por encosta + neve por "altura" + sombra de encosta. Água = plano do mesmo mesh com ramo do shader (`uTime`). Correções já identificadas no protótipo (`scratchpad/exp/terreno2-so.png`): a areia saiu como "papel amassado" (ruído em excesso — reduzir amplitude da altura e usar ondulação de baixa frequência) e ainda há costuras fracas nas células do bombing (misturar as duas grades por ruído mais largo); a água estava chapada (falta a normal animada e a cor por profundidade). Esses três itens são critério de pronto da Etapa 1.

### 1.8 Unidades, edifícios, cores de time e legibilidade

- **Unidades**: rig humano paramétrico com kit (elmo coríntio/pilos/coroa, escudo hoplon/pelta, lança/espada/arco/dardo/clava/foice, couraça, capa curta/longa), rig cavalo + cavaleiro, rigs quadrúpede, bípede grande, voador, serpente (hidra por `heads` 1–5 = 5 variantes assadas), cerco (madeira/corda/rodas, braço animado), titã (bípede 4×). Elmos e capuzes escondem a ausência de rosto; a 24–31 px de altura isso não se vê. Sombra (`shade`) translúcida; sentinela imóvel.
- **Edifícios**: obra em 3 estágios (`progress` < 33 / 66 / 100 %), completo, dano em 2 níveis (`hp/maxHp` < 0,66 / 0,33: rachaduras + fumaça), escombros (`collapse`), desabilitado (tint lilás por `disabledUntil`), guarnição (ícone como hoje). Muralha em **16 variantes por bitmask** de vizinhança (`buildingAt`) + 2 retas com estandarte (`05f`/`10f`, uma a cada 3 tiles), portão aberto/fechado × 2 orientações (casa de guarda com telhado e flâmula no alto: o portão norte-sul só é visto pelo topo), portal dos titãs com abertura animada, fazenda em 3 estágios de plantio. Estandartes e toldos na máscara de time — também na muralha (pilares das pontas/cantos e as retas marcadas).
- **Cor de time**: `team.tint = PLAYER_COLORS[owner]` sobre o sprite de máscara (cinza iluminado). Opção "contorno de time" desligada por padrão — acessibilidade e zoom baixo. Implementada nos edifícios (Etapa 3): a silhueta do quadro (alfa do atlas, branca) tingida com a cor do dono atrás do corpo, deslocada nas 4 direções (4 sprites, só com a opção ligada) de ≈ 1,8 px de tela em qualquer zoom (0,8–6 px de mundo); as unidades seguem com a máscara de time.
- **Seleção e vida**: elipse de seleção com a mesma inclinação da falsa perspectiva (razão 0,84), sob a sombra; barras deslocadas pela altura do quadro (`frame.h · (1 − anchor.y)`); fantasma de construção = quadro `complete` (na variante que teria ali) com alfa e tint verde claro (pode) ou vermelho forte `0xff5a5a` (não pode: o vermelho claro quase não mudava a terracota), sobre o retângulo do footprint — mais leve (0,2) onde pode, 0,35 onde não pode.
- **Pick**: dois estágios — primeiro a **caixa do sprite** (quem contém o cursor em coordenadas de tela, o de maior `y` ganha), depois o chão como hoje. Resolve o clique no telhado/torso que hoje cairia no tile de trás. Retângulo de arrasto testa a âncora (pé) como hoje. Nos **edifícios** a caixa só vale onde o pixel do quadro é opaco (alfa ≥ 40 lido do próprio atlas na primeira consulta, cache por textura: `src/render/art/alphaMask.ts`): grama e unidades vistas atrás de um edifício alto não viram o edifício (clique direito na grama acima do Centro Cívico = mover).
- **Névoa**: amostrada **no pé** da entidade (o renderizador já decide visibilidade por tile); sprites altos na borda da névoa não ficam "meio cobertos" porque a névoa suave (1.3, regra 8) tem transição de ≈ 1 tile. Edifícios de outro time explorados-mas-fora-de-vista (tile do centro com vis < 2) ficam na **última versão vista** (Etapa 3): estado, variante, fumaça e brilho não mudam sob a névoa, e o portão só abre por unidade que o jogador vê — senão o portão abrindo, o dano ou a muralha nova vazariam o que a névoa esconde. Só no renderizador; não toca o núcleo. (A barra de vida dos edifícios ainda mostra a vida atual, como antes.)

### 1.9 Efeitos

Projéteis (flecha, dardo, pedra, espinho, bola de fogo, raio) como sprites de 8 direções; partículas em `ParticleContainer` (poeira de pés/cascos, fumaça de obra/dano/escombros, fogo em flipbook 8 quadros por ruído, faíscas, folhas, respingos, cinza de pestilência, brilho dourado de heróis/bronze) com blend `add` onde emite luz; decalques por chunk (queimadura, escombros, trilhas; sangue só se o dono aprovar — pergunta 5). Cada um dos 16 tipos de `VisualEffect` e dos 12 poderes tem arte própria (hoje `nodeGone` e `bronze` caem em `default`). Morte = animação `die` + corpo desvanecendo 8 s; petrificação = passe de bake com material pedra + rachadura; desabamento = escombros + poeira.

### 1.10 Interface e ícones

Ícones 48×48 e retratos 128² renderizados **dos mesmos modelos** (câmera frontal 3/4, luz de estúdio, fundo de pergaminho): todas as unidades de `UNITS`, edifícios de `BUILDINGS`, tecnologias de `TECHS` (composição de ícones de material/arma), 12 poderes de `POWERS`, 5 recursos, posturas/formações; retratos dos 12 deuses (3 maiores + 9 menores) como bustos paramétricos em mármore com atributo (raio, tridente, elmo…). Molduras mármore/bronze via `border-image` (nine-slice em CSS), cursores próprios (normal, atacar, construir, poder, inválido), fonte com acentos PT/EN. Menus, telas de carregamento/vitória, cápsulas da Steam e trailer pertencem a 2.5/2.7 do roteiro e reutilizam este pipeline (render de cena + composição), mas não estão nas horas da seção 5.

### 1.11 O que fica inevitavelmente estilizado (e como disfarçar)

Rostos e mãos (elmos e capuzes); tecido e cabelo (capas como placas rígidas com leve balanço); animações procedurais por senoides em pivôs (mitigação: antecipação + golpe + recuo, pés alternados, "bob" vertical; formato de poses editável em JSON, ver 3.4); míticas orgânicas como "esculturas de primitivas" deformadas por ruído com pele/escama — críveis a 40–60 px com sombra e especular corretos, não fotográficas. É exatamente onde um `.glb` profissional entra depois sem tocar no jogo.

---

## 2. Abordagem técnica escolhida

### 2.1 As três abordagens avaliadas

| | A — Realismo procedural 2D (510 h) | B — Bake 3D→sprites + Pixi 2D (248 h declaradas) | C — Mundo 3D real em three.js (280 h declaradas) |
|---|---|---|---|
| Realismo (média dos juízes) | 8,0 | 7,3 | 7,5 |
| Esforço | 3,0 | 6,2 | 4,0 |
| Desempenho | 8,2 | 8,0 | 6,2 |
| Compatibilidade (editor, câmera, minimapa) | 7,7 | 8,8 | 4,2 |
| Futuro (arte profissional) | 8,2 | 8,7 | 8,5 |
| **Total** | **7,25** | **7,7** | **6,4** |

Todas as três usam three.js só onde cabe: A e B o usam **em tempo de build** (mesmo protótipo `scratchpad/bake/`: 191 quadros, atlas 2048² 64 % ocupado, hoplita com bronze/linho e sombra SE, 0,39–0,45 ms de CPU por quadro com 926 sprites no Pixi 8.21); C o usa em runtime (protótipo `scratchpad/three-c/`: 38 draw calls com 300 ou 600 unidades instanciadas, mas unidades como cápsulas e caixas bege).

### 2.2 Decisão e justificativa

**B é a espinha dorsal** porque chega ao mesmo destino visual de A com a arquitetura mais incremental e menos invasiva (todos os juízes): fallback procedural **por asset** (o jogo nunca quebra durante meses de migração), preservação dos chunks e do contrato `invalidateRect`/`chunkCacheLimit`/`TERRAIN_PALETTE` que o editor recém-entregue já usa, **manifesto por asset com `source: param | glb`** (o gancho mais concreto para arte profissional), cache por hash e `--only`. **De A entram** os itens já prototipados que rendem mais realismo por hora e que B não tinha: texture bombing e relevo macro no shader (sem isso o protótipo mostrou repetição a cada 2 tiles), névoa como `Mesh` com `smoothstep` (some o borrão quadrado sem filtro de tela cheia), fronteiras no shader, decalques por chunk só quando sujo, partículas com orçamento por preset, `quality.ts` com presets, teste `art-manifest`, ícones/retratos/cursores/molduras da HUD, e a **estimativa honesta de horas por lote** (humanos ≈ 60 h, míticas/titãs ≈ 70 h, edifícios ≈ 50 h — B tinha 24/30/30 h, otimistas). **C fica guardada** (2.4).

Correções ao que as propostas assumiram (o relatório de base estava desatualizado): `renderer.ts` tem 723 linhas e **já desenha** a camada do editor (`updateEditor`: regiões/passabilidade como texturas w×h, grade, inícios, fantasmas, pincel, linha de pré-visualização); `TERRAIN_PALETTE` **já está centralizada** em `src/render/palette.ts`; `scripts/renderperf.mjs` **já existe** (mede ms/quadro em 4 cenários) e será estendido em vez de criado; `Settings` não tem campos de qualidade além de `renderScale`. As sobreposições do editor são preservadas tal como estão (ficam na camada `editor`, acima de tudo menos névoa) e `playtest-editor.mjs` é critério de pronto de toda etapa que toca terreno.

### 2.3 O que NÃO fazer

- **Não** reescrever o renderizador em 3D agora (C), **não** mudar a câmera do jogo (top-down ortográfica), **não** usar three.js em runtime nem contexto GL compartilhado com o Pixi.
- **Não** trocar os chunks por um único `Mesh` do mapa inteiro (A): mantemos 1 mesh por chunk 16×16 compartilhando shader e texturas w×h, para que culling, `invalidateRect` e o editor continuem simples.
- **Não** ligar MSAA (`antialias: false` — sprites não precisam), **não** renderizar a 2× de `resolution` em integrada/Deck, **não** usar filtros de tela cheia por quadro (blur de névoa, bloom); a névoa é um mesh com shader e o pós é um `ColorMatrixFilter` opcional.
- **Não** assar a 2× por padrão, **não** 16 direções, **não** carregar todos os atlas no início (carregamento por tipo com pré-aquecimento por Idade).
- **Não** rodar o bake em CI: os atlas são artefatos versionados; os testes validam só o JSON.
- **Não** baixar assets de sites (bloqueados e de licença incerta), **não** usar a ferramenta de imagem por IA (`atm_render_image`) sem autorização explícita e registro em `docs/LEGAL.md`; se autorizada, só para referências internas de paleta/material (que não entram no jogo) ou para retratos/ilustrações com divulgação na Steam.
- **Não** tocar em `src/core` (determinismo, replays, multiplayer). `Math.random` só em partículas/tremor, fora do núcleo.
- **Não** manter dois renderizadores; **não** remover `textures.ts` — ele vira `ProceduralSource`, o fallback consistente.
- **Não** sangue realista nem cadáveres persistentes sem decisão do dono (classificação etária IARC, `docs/LEGAL.md` §6).

### 2.4 Quando (e como) a Abordagem C voltaria à mesa

Só se **(a)** o dono aprovar a câmera 3/4 em perspectiva vendo capturas (`scratchpad/three-c/c-persp-*.png`) sabendo que edifícios altos escondem tropas e a seleção passa a ser projetada em tela, **e (b)** houver orçamento para artista 3D (glTF com esqueleto; R$ 400–1 500 por unidade humana animada). O manifesto `.glb` de B mantém a porta aberta: os mesmos modelos alimentam o bake 2D hoje e um renderizador 3D amanhã. Até lá, C não é iniciada.

---

## 3. Pipeline e arquitetura

### 3.1 Visão geral

```
art/manifest/*.json  ──┐                                   (fora do bundle)
scripts/bake/page/rigs ─┼─► scripts/bake/bake.mjs ──► art/cache/<hash>/ ──► public/art/**  (PNG + JSON)
art/src/*.glb (opcional)┘   (Chromium headless + three.js)                     │
                                                                               ▼
src/core (GameState) ──► src/render/renderer.ts ──► ArtLibrary (AtlasSource | ProceduralSource) ──► PixiJS 8
                          │ ChunkMesh (shader de terreno)   │ UnitView / BuildingView / props / particles / decals
                          │ fog.ts (mesh)  │ quality.ts     │ minimap.ts (RenderTexture 2 px/tile + TERRAIN_PALETTE)
scripts/renderperf.mjs · scripts/artshot.mjs · scripts/artdiff.mjs · tests/art-manifest.test.ts
```

### 3.2 Contrato de câmera e luz do bake (`scripts/bake/page/camera.js`)

Único arquivo com os números que amarram arte e jogo; mudar qualquer um invalida o cache inteiro (correto):

```js
export const PX_PER_TILE = 32;            // 1×; --scale 2 → 64
export const PITCH_DEG   = 50;            // 90 = topo puro
export const STRETCH_Y   = 1 / Math.sin(PITCH_DEG * Math.PI / 180); // chão 1:1
export const SUN_DIR     = [-0.55, 1.0, 0.35];   // three.js; sombras para SE
export const SUN_COLOR   = 0xfff0d8, SUN_INTENSITY = 2.6;
export const SKY = 0xbfd4ff, GROUND = 0x8a7a5a;  // HemisphereLight
export const DIRS = 8;                    // índice 0 = E, sentido horário na tela (E, SE, S, SO, O, NO, N, NE)
export const FPS = 10;
export const PAD = 8;                     // px de borda por quadro (mipmaps sem sangramento)
export const PIPELINE_VERSION = 1;
```

Os mesmos valores vão para `meta.aoe` de cada JSON de atlas e são conferidos no carregamento (`ArtLibrary` recusa atlas com `pxPerTile`/`pitchDeg` diferentes do esperado e cai no fallback com aviso no console).

### 3.3 Formato dos atlas

PNG RGBA 2048² + JSON no formato **Spritesheet do PixiJS** (hash de `frames`, `animations`, `meta`), carregado com `Assets.load`. Três canais lógicos por asset em atlas separados com o mesmo nome de quadro: `units-1x-0.png` (cor), `units-team-1x-0.png` (máscara de time, cinza iluminado), `units-shadow-1x-0.png` (sombra, só alfa). Grupos: `units`, `buildings`, `props`, `fx`, `icons`; `terrain/*.png` são texturas tileáveis, não atlas.

```json
{
  "frames": {
    "hoplite/walk/3/05": { "frame": {"x":0,"y":0,"w":48,"h":51}, "sourceSize": {"w":48,"h":51},
                            "spriteSourceSize": {"x":0,"y":0,"w":48,"h":51}, "anchor": {"x":0.5,"y":0.82} }
  },
  "animations": { "hoplite/walk/3": ["hoplite/walk/3/00", "…", "hoplite/walk/3/07"] },
  "meta": { "image": "units-1x-0.png", "scale": "1", "format": "RGBA8888",
            "aoe": { "version": 1, "pass": "color", "pxPerTile": 32, "pitchDeg": 50, "sun": [-0.55,1,0.35],
                     "dirs": 8, "fps": 10, "pad": 8, "mirror": false } }
}
```

Nomes: `<id>/<anim>/<dir>/<quadro>` para unidades; `<id>/<estado>[/<variante>]` para edifícios (`temple/build0`, `temple/complete`, `temple/damage1`, `temple/rubble`, `wall/complete/13` para bitmask 13, `gate/open/ns`); `<kind>/<variante>` para props (`olive/2/big`, `stump/1`, `berry/full`, `gold/2`). Empacotamento *shelf* com `PAD = 8` e bordas extrudadas (mipmaps ligados para minificação em zoom < 0,8 sem sangramento). Um `manifest.json` por grupo lista os arquivos, o tamanho total e o hash de cada atlas.

### 3.4 Manifestos por asset e troca por arte profissional

`art/manifest/<id>.json`, um por asset, lido pelo bake e pelo teste:

```json
{ "kind": "unit", "id": "hoplite", "footprintTiles": [1.5, 1.6], "anchor": [0.5, 0.82], "dirs": 8,
  "source": { "type": "param", "rig": "human",
              "params": { "helmet": "corinthian", "shield": "hoplon", "weapon": "spear", "cape": "short", "armor": "linothorax" },
              "poses": "art/poses/human.json" },
  "animations": { "idle": 4, "walk": 8, "attack": 6, "die": 6 },
  "team": ["tunic", "cape", "shieldCenter"] }
```

Para usar um modelo comprado ou comissionado, só o `source` muda:

```json
"source": { "type": "glb", "file": "art/src/hoplite.glb", "scale": 0.53, "forward": "+x",
            "clips": { "idle": "Idle", "walk": "Walk", "attack": "Attack01", "die": "Death" },
            "teamMaterials": ["Tunic", "Cape", "ShieldCenter"] }
```

`bake.js` carrega com `GLTFLoader`, amostra os clipes com `AnimationMixer` nos N instantes, marca como time os materiais listados (ou com prefixo `team_`) e produz **os mesmos três passes no mesmo atlas/JSON**. O jogo só conhece `frames(id, anim, dir)`. O `.glb` fica em `art/src/` (fora da distribuição); só o atlas entra na build. Um artista 2D também pode entrar: pintar quadros seguindo este contrato (32/64 px por tile, pitch 50°, sol NO, âncora no pé) e usar só o empacotador (`bake.mjs --pack-only pasta/`). `docs/ART_ASSETS.md` será reescrito na Etapa 8 como esse briefing, com os dois caminhos.

As poses das animações procedurais ficam em JSON editável (`art/poses/<rig>.json`: ângulos por pivô e por quadro-chave, interpolados no bake), para que ajustar um "andar" não exija código.

### 3.5 Cache, reprodutibilidade e onde ficam os artefatos

- `bake.mjs` calcula SHA-256 de (manifesto + fonte do rig/poses + `camera.js` + `materials.js` + `PIPELINE_VERSION`); se `art/cache/<hash>/` existe, só reempacota. `--only hoplite,temple`, `--scale 1,2`, `--dirs 8`, `--mirror`, `--pack-only`.
- Tempo medido: ≈ 150 ms/quadro em swiftshader (sem GPU). Conjunto completo ≈ 35 unidades × 8 dir × ~25 quadros ≈ 7 000 quadros + edifícios/props/efeitos ≈ 500 → **≈ 20 min sem GPU, 1–2 min no PC do dono com GPU**. Com cache, o dia a dia leva segundos.
- Reprodutibilidade: o mesmo hash de entrada gera o mesmo JSON sempre; os pixels podem variar entre drivers, por isso **o teste compara só o manifesto e o JSON**, nunca pixels, e o bake **não roda em CI**.
- Onde vivem os PNG: `public/art/**` (o Vite copia `public/` para `dist/`, e `desktop/package.json` já empacota `../dist` → nada a mudar no Electron). Versionamento: **git LFS** para `public/art/**/*.png` (75–150 MB a 1×); se a cota do LFS for problema, `npm run art:fetch` baixa de um *release asset* do GitHub (pergunta 9). `art/cache/` e `art/src/` ficam no `.gitignore` (o `.glb` só entra no LFS se comprado).

### 3.6 Terreno: `ChunkMesh`, texturas e `invalidateRect`

- `src/render/terrain/ChunkMesh.ts`: um `Mesh` (geometria de 2 triângulos ou 16×16 quads no preset alto, para o relevo macro por vértice) por chunk de 16×16 tiles, todos com o **mesmo `Shader`** e os mesmos uniforms: `uWeights` (textura w×h RGBA: pesos grama/terra/areia/rocha, bilinear), `uKind` (textura w×h RG: água rasa/profunda e "profundidade" para espuma/cor), `uOwner` (textura w×h R8 de dono do território, para fronteira e tingimento), `uFog` (não — a névoa é camada própria), materiais `uGrass/uGrassDry/uDirt/uSand/uRock` (albedo+altura) e `uN*` (normais), `uMacro` (ruído 256² RGB: tom, colinas, seleção de bomb), `uTime`, `uSun`, `uQuality`.
- `src/render/terrain/shaders.ts`: GLSL ES 3.00 (Pixi `GlProgram`); dois níveis: **completo** (bombing em duas grades de 4 tiles, normal map, relevo macro, água animada com especular e espuma, fronteira) e **simples** (sem bombing/normal, água estática, ≤ 5 amostras por pixel) escolhidos pelo preset. `preference: 'webgl'` fixo; WGSL fica para quando o WebGPU for necessário.
- `src/render/terrain/materials.ts`: gerador fBm/ridged usado pelo bake (`page/terrain.js`) e como fallback em runtime.
- `invalidateRect(x0, y0, x1, y1)` (assinatura mantida): reescreve só os bytes do retângulo em `uWeights`/`uKind`/`uOwner` (`source.update()`), re-sincroniza os sprites de props do retângulo (3.7) e limpa decalques; os meshes de chunk **não** são recriados. `chunkCacheLimit` vira no-op mantido por compatibilidade com o editor. A recontagem de nós por chunk desaparece (props são sincronizados por tile).
- Custo: 81 chunks × 2 triângulos; só os visíveis são desenhados (culling pelo `visibleTiles` como hoje). Texturas: 5 materiais 512² albedo + 5 normais (≈ 10 MB, mipmaps) ou 256² no preset baixo (2,5 MB) + 3 texturas w×h (≈ 100 KB).

### 3.7 Camadas do renderizador (nova ordem) e views

`world → [terrain (ChunkMesh) → decals (RenderTexture 512² por chunk, só quando sujo) → territory (tingimento leve, já no shader → camada removida) → shadows (sprites da pass de sombra) → ground (Graphics: seleção, waypoints, fantasma) → entities (props + buildings + units num só container ordenável por zIndex = y, voadoras +1000) → fx (ParticleContainer + sprites) → hp (Graphics) → editor (como hoje) → fog (Mesh)] → post (ColorMatrixFilter opcional na stage) → overlay`.

- `src/render/art/ArtLibrary.ts` (`AtlasSource` + `ProceduralSource`): `frames(id, anim, dir)`, `teamFrames`, `shadowFrames`, `building(id, state, variant)`, `prop(kind, variant)`, `icon(id)`; carregamento **preguiçoso por tipo** na primeira aparição (com pré-aquecimento dos tipos treináveis na Idade atual do jogador local, para evitar o travamento de 20–60 ms do upload de um atlas 2048² em integrada) e escolha 1×/2× pelo preset; qualquer chave sem quadro no atlas cai no `ProceduralSource` (o `textures.ts` de hoje, com a paleta e as sombras da Etapa 0 para o placeholder ficar coerente ao lado dos sprites assados).
- `src/render/views/UnitView.ts`: `body: AnimatedSprite`, `team: AnimatedSprite` (tint), `shadow: Sprite` na camada `shadows`, `dir` quantizada de `angle`, máquina de estados `idle/walk/attack/carry/gather/die` a partir de `u.state`, `moving`, `attackTick` (inicia `attack` no quadro 0), `carry`, `lastDamageTick` (flash), `bronzeUntil`, `disabledUntil`; `rank` e `carry` como hoje.
- `src/render/views/BuildingView.ts`: estado por `progress`/`hp`/`disabledUntil`/`garrison`, bitmask de muralha por `buildingAt`, portão, fumaça de dano (emissor), estandarte de time.
- `src/render/props.ts`: mapa `tile → sprite` de árvores/nós/rochas/decoração, escala/variante por `decor`, estágio por `amount/max`, toco ao cortar (`nodeGone`), sombra na camada `shadows`; culling por `visibleTiles` (mapas 144×144 têm milhares de árvores: só as visíveis existem como sprites; o resto é dado).
- `src/render/particles.ts` (emissores sobre `ParticleContainer`, orçamento 2 000 / 800 / 200 por preset), `src/render/decals.ts`, `src/render/shadows.ts`, `src/render/fog.ts` (mesh w×h com `smoothstep` + ruído nas bordas; `revealAll` mantido), `src/render/quality.ts` (3.9), `src/render/perf.ts` (overlay `?perf=1`).

### 3.8 Névoa, fronteiras, minimapa, seleção e pick

- Névoa: textura w×h R8 por `fogVersion` (upload de 20 KB), shader com `smoothstep` em ≈ 1 tile e ruído leve; sem `BlurFilter`.
- Fronteiras: linha por diferença de vizinhos em `uOwner` no shader do terreno + tingimento de 6 % da cor do dono; some o `stroke()` por aresta (hoje milhares por mudança de `territoryVersion`).
- Minimapa (`minimap.ts`, canvas 2D, independente do Pixi): base da partida a partir de um `RenderTexture` do terreno a 2 px/tile (uma vez por mapa e por `invalidateRect`), territórios/névoa/unidades como hoje; `TERRAIN_PALETTE` continua para o editor e legenda. Retângulo da câmera inalterado (câmera não mudou).
- Seleção/vida: `ground` e `hp` continuam `Graphics` por quadro (custo medido baixo); elipse inclinada e barras deslocadas (1.8). Pick em dois estágios (1.8) implementado em `renderer.pick`, sem mudar `input.ts` além da chamada.

### 3.9 Qualidade e opções

`src/render/quality.ts`:

```ts
export interface Quality { preset: 'auto'|'low'|'medium'|'high'; atlasScale: 1|2; shadows: boolean; particles: 0|1|2;
  water: 'static'|'animated'; terrainShader: 'simple'|'full'; normalMaps: boolean; post: boolean;
  resolutionCap: number; antialias: false; showFps: boolean; teamOutline: boolean }
```

Presets: **low/Deck** (1×, sombras on, partículas 1, água estática, shader simples, sem normais, cap 1), **medium** (1×, animada, completo, normais, cap 1), **high** (2× se disponível, cap `min(2, dpr)`, post). `auto` = `medium`, mede 120 quadros no início da partida e desce um nível se p95 > 12 ms; sobe nunca automaticamente. `Settings` ganha `quality: 'auto'`, `showFps: false`, `teamOutline: false` (com padrão no `loadSettings`); `options.ts` mostra preset + toggles avançados; `main.ts` aplica no `Renderer.setQuality`. `antialias` passa a `false` na `Application.init`; `resolution = min(cap, dpr) · renderScale`.

### 3.10 Arquivos novos e alterados

| Arquivo | Novo/alterado | O quê |
|---|---|---|
| `scripts/bake/bake.mjs`, `server.mjs`, `page/index.html`, `page/camera.js`, `page/materials.js`, `page/bake.js`, `page/atlas.js`, `page/terrain.js`, `page/icons.js`, `page/rigs/{human,horse,quadruped,biped_large,flyer,serpent,siege,titan}.js`, `page/props.js`, `page/buildings.js` | novo | Pipeline de bake (three.js MIT em `devDependencies`) |
| `art/manifest/*.json`, `art/poses/*.json`, `art/cache/` (ignorado), `art/src/` (ignorado/LFS) | novo | Manifestos, poses, cache, modelos externos |
| `public/art/{units,buildings,props,fx,icons}-{1x,2x}-N.{png,json}`, `public/art/terrain/*.png`, `public/art/manifest.json` | novo (LFS) | Artefatos assados |
| `src/render/quality.ts`, `perf.ts`, `fog.ts`, `shadows.ts`, `props.ts`, `particles.ts`, `decals.ts`, `terrain/{ChunkMesh,shaders,materials}.ts`, `art/{ArtLibrary,AtlasSource,ProceduralSource,types}.ts`, `views/{UnitView,BuildingView}.ts` | novo | Renderizador |
| `src/render/renderer.ts` | alterado | Remove `buildChunk`/`refreshChunksIfNeeded`/`TCOL`/`borders`; delega a `ChunkMesh`, views, props, particles, fog; mantém `RenderUI`, `pick` (2 estágios), `invalidateRect` (nova semântica, mesma assinatura), `fitMap`, `chunkCacheLimit` (no-op), `updateEditor` (intocado), `portrait` (lê do atlas de ícones), `revealAll`, `setRenderScale`; ganha `setQuality` |
| `src/render/textures.ts` | movido → `art/ProceduralSource.ts` | Fallback; paleta e sombra separada (Etapa 0) |
| `src/render/palette.ts`, `minimap.ts`, `camera.ts` | alterado / alterado / intocado | Paleta recalibrada + `SUN_DIR`/`TEAM_TINT`; base por RenderTexture; — |
| `src/game/settings.ts`, `display.ts`, `src/ui/options.ts`, `src/main.ts`, `src/ui/hud.ts`, `src/ui/input.ts`, `src/i18n/strings.ts` | alterado | Campos de qualidade/fps/contorno, `?perf=1`, ícones/retratos do atlas com fallback a emoji, pick, textos PT/EN |
| `scripts/renderperf.mjs` (existente) | alterado | + draw calls (wrapper de `drawElements/drawArrays` via `addInitScript`), MB de texturas (`renderer.texture.managedTextures`), cenário fixo 144×144 com `debugSpawn` ≥ 260 unidades, saída JSON em `docs/perf/` |
| `scripts/artshot.mjs`, `scripts/artdiff.mjs` | novo | Capturas de referência (semente fixa, 3 zooms + editor + cidade + batalha) e diff com tolerância (`pixelmatch`, MIT) |
| `tests/art-manifest.test.ts`, `tests/quality.test.ts`, `tests/terrain-shader.test.ts` | novo | Todo tipo de `UNITS`/`BUILDINGS`/`NodeType` tem manifesto e quadros; presets e padrões; GLSL com uniforms esperados e `invalidateRect` alterando só os bytes certos |
| `package.json` | alterado | `devDependencies: three, pixelmatch`; scripts `art:bake`, `art:check`, `art:shot`, `art:diff`, `art:fetch`, `perf:render` |
| `docs/ART_ASSETS.md`, `docs/QA.md`, `docs/STEAM.md`, `docs/LEGAL.md`, `docs/ROADMAP.md`, `CLAUDE.md`, `docs/art/` (capturas) | alterado / novo | Briefing, metas e números, tamanho do pacote (+80–150 MB), licenças (three.js build-only, pixelmatch), passos 2.1–2.4 |

### 3.11 Testes automáticos e capturas

- **A cada etapa**: `npm test` (inclui `art-manifest`, `quality`, `terrain-shader`, `determinism`), `npm run typecheck`, `npm run smoke 20 42`, `node scripts/playtest.mjs` e `playtest-editor.mjs` (toda etapa que toca terreno/props), `node scripts/renderperf.mjs` (números em `docs/QA.md`), `node scripts/artshot.mjs` → `docs/art/<etapa>-{antes,depois}-{z035,z13,z22,editor,cidade,batalha}.png` lidos com a ferramenta Read, `node scripts/artdiff.mjs` contra `docs/art/ref/` (tolerância 2 % de pixels; `--update` só em mudança visual intencional, commitada junto).
- **Critério visual fixo**: as 10 regras de 1.3 conferidas nas capturas a zoom 0,35 / 1,3 / 2,2.
- **Regressão de determinismo**: nenhuma alteração em `src/core`; `tests/determinism.test.ts` e `lockstep.test.ts` intocados.

### 3.12 Integração com o que já existe

- **Editor de mapas**: `invalidateRect` e `minimap.invalidate` continuam sendo o contrato; `updateEditor` e a camada `editor` não mudam; o editor ganha props reais e pincel "decoração" (opcional). `fitMap`/`minZoom` iguais.
- **Determinismo, replays, multiplayer**: renderização não entra no hash; nada muda.
- **Electron/Steam**: `public/art` vai no `dist/` já empacotado; Pixi com `preference: 'webgl'` (WebGL2 disponível no Chromium do Electron e no Deck); CSP sem `unsafe-eval` (os shaders são strings, não `eval`; se necessário, `pixi.js/unsafe-eval`). Pacote cresce 80–150 MB (documentar em `docs/STEAM.md`).
- **Licenças** (`docs/LEGAL.md` §4): three.js MIT (build), pixelmatch MIT (dev), PixiJS MIT; arte gerada por código próprio; `.glb` comprados ficam fora da distribuição com licença conferida.

---

## 4. Lista completa de assets (P0 = jogo básico jogável com a nova arte; P1 = completo; P2 = polimento)

**Terreno (P0)**: 5 materiais tileáveis 512² (grama, grama seca, terra, areia, rocha) albedo+altura+normal; ruído macro 256²; água rasa/profunda por shader; espuma; neve de topo. **P2**: cascalho de transição, lama de margem.

**Nós e decoração**: **P0** árvore 3 espécies × 4 variantes × 2 escalas (24) + tocos (3) + estágio "esgotando" (copa menor, ×2); arbusto de frutas (cheio/meio/vazio); veio de ouro (3 estágios); cervo (parado/comer, 4 dir); javali (4 dir); Pedra de Poseidon (com brilho). **P1** rochas (6), flores (4), grama alta (4), colunas caídas/ruínas (4), conchas (2).

**Unidades (35)** — cada uma: parado 4, andar 8, atacar 6, morrer 6 × 8 dir, cor + máscara + sombra:
- **P0**: villager (+ carregar 6, coletar 4 com machado/picareta/foice), hoplite, toxotes, hippeus, militia, kataskopos.
- **P1**: hypaspist, myrmidon, basileus (coroa, manto), cretan_archer, peltast, hetairoi, petrobolos (braço), helepolis, heróis jason (velo), odysseus (arco), heracles (clava, pele de leão), achilles (escudo), perseus (cabeça da medusa) + halo em partícula; míticas minotaur, centaur, cyclops, pegasus (voa, sombra no chão), medusa, hydra (×5 por `heads`), nemean_lion, chimera, cerberus, manticore, colossus (bronze), sentinel (parado/atacar), shade (alfa 0,6); titãs prometheus, oceanus, cronus (+ ascensão 8).
- Total ≈ 7 000 quadros de cor + máscaras + sombras a 1× ≈ 9 atlas 2048² (≈ 144 MB se tudo carregado; 50–70 MB numa partida típica com carregamento por tipo).

**Edifícios (21)** — obra 3 estágios, completo, dano 2, escombros; cor + máscara (estandarte/toldo) + sombra:
- **P0**: town_center 3×3, house 2×2, farm 2×2 (3 estágios), granary, lumber_camp, mine (2×2), barracks 3×3, temple 3×3, tower 1×1, wall 1×1 (16 variantes), gate (aberto/fechado × 2).
- **P1**: market, stable, siege_workshop, academy (3×3), fortress 4×4, wonder_zeus, wonder_artemis, wonder_colossus (4×4), titan_gate 5×5 (fechado/abrindo 6 quadros/aberto), cornucopia 2×2. ≈ 21 × 7 + 16 + 12 ≈ 175 sprites; 2 atlas.

**Efeitos**: **P0** projéteis flecha, dardo, pedra (8 dir); partículas poeira, fumaça, faísca; `hit`, `death`, `collapse`, `nodeGone`, `spawn`, `heal`. **P1** espinho, bola de fogo, raio; `splash` (fogo flipbook), `petrify`, `curse`, `pestilence`, `quake` (poeira + rachadura decal), `titanRise`, `bolt` (aditivo + queimadura), `ability`, `bronze` (brilho global); os 12 poderes com arte própria (bolt, lure, sentinel, restoration, ceasefire, pestilence, oracle, bronze, curse, lightning_storm, plenty, earthquake). **P2** decalques de escombros/trilhas, sangue (se aprovado), folhas ao vento, pássaros.

**Interface**: **P1** ícones 48² de todas as unidades, edifícios, tecnologias, 12 poderes, 5 recursos, posturas/formações; retratos 128² dos 12 deuses; cursores (5); molduras mármore/bronze (nine-slice). **P2** telas de menu/carregamento/vitória, cápsulas da Steam, ilustrações da campanha (2.5/2.7 do roteiro).

---

## 5. Plano por etapas

Cada etapa = commits em português com o rodapé de atribuição, testes verdes, `renderperf` registrado em `docs/QA.md`, e **par de capturas antes/depois em `docs/art/`** lido com a ferramenta Read e mostrado ao dono. Ordem escolhida: base → terreno (muda 80 % da tela cedo) → pipeline com 3 peças no jogo → cidade → exército humano → efeitos → bestiário → HUD → QA.

| # | Etapa | Horas | Entregas visíveis | Critério de pronto |
|---|---|---|---|---|
| **0** ✅ | **Base, medição e limpeza visível** (concluída em set/2026: `fog.ts`, `shadows.ts`, `palette.ts`, `quality.ts`, `perf.ts`, `artshot`/`artdiff`, capturas em `docs/art/etapa0-*`) | **12** | Névoa suave (`fog.ts` mesh + `smoothstep`, sem blocos); paleta terrosa em `TERRAIN_PALETTE` e no placeholder; grade dos tiles eliminada (variação contínua pelo `decor` em vez de 2 tons); sombras SE **separadas** para árvores e unidades no placeholder (camada `shadows`, sem girar com o corpo); fronteira fina e suave (1,5 px, alfa 0,6, junções arredondadas); `quality.ts` + `Settings.quality/showFps/teamOutline` + `antialias:false` + teto de `resolution`; overlay `?perf=1` (fps, ms de render, draw calls, MB); `renderperf.mjs` estendido; `artshot.mjs`/`artdiff.mjs` com referências; par de capturas do protótipo de bake a 50° e 90° para a pergunta 1 | Capturas antes/depois a 3 zooms mostram névoa sem blocos, sem grade e sombras coerentes; `npm run perf:render` imprime ms/quadro, draw calls e MB no cenário 144×144/260+ unidades; opções persistem (`playtest-options.mjs`); `artdiff` verde contra as novas referências; o dono roda `?perf=1` no PC dele (e no Deck, se tiver) e devolve os números de base |
| 1 ✅ | **Terreno por shader e props** (concluída: `src/render/terrain/*` — 1 Mesh com recorte por índice, 3 grades de bombing, materiais gerados em segundo plano, água animada, fronteira em curva suave; nós em atlas único com ordenação global por y; capturas `docs/art/etapa1-*`; rolagem p95 17,9 → 5,3 ms; texturas 134 → 14 MB. Pendente para a 1b: props assados do bake no lugar do atlas de nós procedural e sombras de nós na areia) | 36 | `ChunkMesh` + shaders (completo/simples), materiais gerados (`page/terrain.js` → `public/art/terrain/`) + fallback runtime, bombing, normais + sol, relevo macro, água animada com espuma/margem molhada/cor por profundidade, montanha rocha+neve, fronteira no shader, camada `props` (árvores/nós/rochas/decoração como sprites por tile com sombra e oclusão por y), `invalidateRect` por bytes, minimapa por RenderTexture; correção da areia "papel amassado" e das costuras do bombing | Sem grade a zoom 2,2 nem repetição visível a 0,35; água com normal animada e espuma; zero `generateTexture` de chunk (grep + perf); rolar a câmera e cortar 50 árvores sem pico > 4 ms; `playtest-editor.mjs` e `playtest-fixedmap.mjs` verdes; capturas dos 5 tipos de mapa (`MAP_TYPES`) e do editor pintando |
| 2 ✅ | **Pipeline de bake + primeiras peças no jogo** (parte A ✅: `scripts/bake/*`, manifestos, atlas 1×/2× de hoplita, cidadão, templo e props em `public/art/`, folhas de contato `docs/art/etapa2-*-contato.png`, 11 testes; parte B ✅: `src/render/art/` — `ArtLibrary` (= `AtlasSource` + `ProceduralSource`) com funções puras em `logic.ts` —, `src/render/views/UnitView.ts`/`BuildingView.ts`, `src/render/props.ts` (props assados com sombra, espécie por mancha, árvore em corte/toco, frutas e ouro por estágio), props + edifícios + unidades ordenados juntos pelo pé nas faixas de chunk, pick em 2 estágios, barras acima do quadro, opção "Arte assada (beta)", 2× no preset alto, `scripts/artparade.mjs` e capturas `docs/art/etapa2b-*`, 18 testes em `tests/art-library.test.ts`; números em `docs/QA.md`) | 46 | `scripts/bake/*` (CLI, servidor, contrato de câmera, materiais PBR, 3 passes, packer, JSON, cache por hash, `--only/--scale/--dirs/--mirror/--pack-only`), manifestos + poses JSON, `.glb` via manifesto (testado com um modelo de teste gerado no próprio bake), rig humano → **hoplita e cidadão** (todas as animações), **templo** (3 estágios + completo), **árvores/tocos/rochas assados** substituindo o placeholder; `ArtLibrary` + `AtlasSource`/`ProceduralSource`, `UnitView`/`BuildingView`, 8 direções, máscara de time, sombras, pick por caixa, névoa no pé, padding/mipmaps, carregamento por tipo com pré-aquecimento; `tests/art-manifest.test.ts` | `npm run art:bake -- --only hoplite,villager,temple,props` reproduzível (mesmo JSON em duas rodadas); hoplita anda/ataca/morre nas 8 direções com sombra SE e cor de time; cidadão carrega/coleta; templo em obra e completo; demais tipos continuam procedurais sem erro; `perf:render` com 300 hoplitas dentro do orçamento (seção 6); captura "desfile" a zoom 1 e 2,2 |
| 3 ✅ | **Edifícios (21)** (concluída em set/2026: os **21 edifícios do jogo assados** em obra 0–2, pronto, dano 1–2 e escombros, com máscara de time, sombra e ícone no HUD — base genérica + lote 1 (Centro Cívico ×3 Idades, casa, muralha ×16, portão, torre, templo) + lote economia (fazenda ×3 plantações, celeiro, serraria, mina, mercado, academia, cornucópia) + lote militar (quartel, estábulo, oficina de cerco, fortaleza, 3 maravilhas, portal dos titãs com vórtice animado); `ProceduralSource` não desenha mais nenhum edifício com a arte ligada; atlas `buildings` 1× em 2 páginas de cor (259 quadros) + máscara + sombra e 2× em 4 + 1 + 3; 26 atlas, 12,6 MB de PNG, VRAM 53,8 MB a 1× (71,7 MB com mipmaps) e 153 MB a 2× (204 MB) se tudo carregado; bake completo 1×+2× em 106 s do zero, duas rodadas byte a byte iguais; perf no preset Baixo: fps −11 % a +1 %, CPU do renderizador +0,03–0,24 ms, texturas 26 → 74,5 MB (`docs/QA.md`); capturas por Idade `docs/art/etapa3-cidade-{arcaica,classica,heroica,mitica,maravilhas}.png` aguardando o dono; ver Apêndice D) | 50 | Rigs de edifícios: obra 3 estágios, dano 2 + fumaça, escombros, muralha por bitmask (16), portão, portal dos titãs animado, fazenda 3 estágios, estandartes, fantasma de construção, desabilitado; ícones assados de cada um no HUD (com fallback) | `ProceduralSource` deixa de ser usado para edifícios em partida normal; muralhas contínuas sem costura; obra visível 0/33/66 %; captura de uma cidade completa por Idade (4 capturas) aprovada pelo dono |
| 4 | **Unidades humanas, montadas e cerco (22)** | 60 | 5 infantaria + basileus, 3 à distância, 2 cavalaria + kataskopos, 2 cerco, 5 heróis (capa longa, halo em partícula); ícones | Todas no manifesto e no atlas; cada uma reconhecível a zoom 1 na captura "desfile"; VRAM residente ≤ 100 MB no cenário de perf; aprovação por lote (infantaria → distância/cavalaria → cerco/heróis) |
| 5 | **Efeitos e luz** | 30 | `particles.ts`, `decals.ts`, atlas `fx`, 6 projéteis em 8 dir, os 16 tipos de `VisualEffect` e os 12 poderes com arte própria, poeira de marcha, morte/petrificação/desabamento; `ColorMatrixFilter` opcional (entardecer) | Nenhum `default` em `updateEffects`; ≤ 2 000 partículas em "alto"; batalha 100×100 dentro do orçamento; captura de cada poder em `docs/art/` |
| 6 | **Míticas (13) e titãs (3)** | 70 | Rigs quadrúpede/bípede grande/voador/serpente/titã, hidra por `heads`, Pégaso voando com sombra no chão, sombra translúcida, ascensão do titã | Idem Etapa 4; hidra muda com cabeças; titãs com sombra longa; aprovação por lote (3 unidades + capturas antes de assar as 13) |
| 7 | **HUD e ícones** | 25 | Ícones de tecnologias/recursos/posturas, retratos 128² dos 12 deuses (bustos), cursores, molduras mármore/bronze, `teamOutline` | Zero emoji na partida em PT e EN (`playtest-i18n.mjs`); retratos no painel de deuses; HUD legível a escala 130 % |
| 8 | **QA de desempenho, Deck e documentação** | 15 | Preset `auto` calibrado com os números do dono, verificação em integrada e Deck, KTX2 opcional se VRAM apertar, `docs/ART_ASSETS.md` reescrito como briefing (param/glb/2D), `ROADMAP` 2.1–2.4 marcados, `QA.md`/`STEAM.md`/`LEGAL.md` atualizados | ≥ 60 fps no preset médio em integrada 1080p e no Deck 1280×800 (medido pelo dono com `?perf=1`, ≥ 40 fps garantidos em qualquer preset); todas as etapas com pares de capturas em `docs/art/`; `CLAUDE.md` atualizado |
| | **Total** | **≈ 344 h** | faixa 300–380 h | ≈ 14–17 semanas a 20–25 h/semana de agente; o roteiro (Fase 2, semanas 3–14) precisa de 2–4 semanas a mais ou de cortar P2 |

Regras de fatiamento: cada etapa é jogável ao terminar (mistura placeholder + atlas permitida); lotes de unidades só são assados depois de 2–3 peças aprovadas em captura; a rotina semanal de correções continua em paralelo.

---

## 6. Desempenho: orçamentos e medição

**Meta**: 60 fps a 1280×800 no Steam Deck (RDNA2, 8 CU) e em GPU integrada Intel/AMD a 1080p no preset **médio**, com mapa 144×144, 4 IAs e 260+ unidades; 40 fps é o mínimo em qualquer preset (alinha `docs/QA.md`, que passa a dizer "60 alvo / 40 mínimo").

**Orçamento por quadro (16,7 ms)**:

| Item | Orçamento | Como se garante |
|---|---|---|
| Simulação (já medida: 1–2 ms/tick a 20 Hz, pico 28 ms) | ≤ 3 ms médios por quadro | `scripts/perf.ts` (inalterado) |
| CPU de `renderer.render` (JS) | ≤ 3 ms (p95 ≤ 6 ms) | medido: 0,39–0,45 ms com 926 sprites; `ground`/`hp` Graphics ≤ 0,6 ms |
| GPU: terreno (1 Mpx, ≤ 22 amostras no completo, ≤ 5 no simples) | ≤ 1,5 ms | preset; `EXT_disjoint_timer_query_webgl2` quando disponível |
| GPU: sprites (≈ 1 500 visíveis, ~3 Mpx de overdraw) | ≤ 1 ms | 1× em integrada; batches de ≤ 16 texturas |
| GPU: partículas + névoa + pós | ≤ 1 ms | orçamento de partículas; sem filtros de tela cheia além do pós opcional |
| **Total GPU** | **≤ 6 ms** | folga para o driver/compositor do Electron |
| Draw calls | ≤ 40 (hoje ≈ 40–60 com picos) | chunks visíveis 12–20 + sombras 1 + entidades 2–6 + fx 1–2 + hp 1–3 + fog 1 |
| Picos | ≤ 4 ms em rolagem, corte de árvore, mudança de território ou pintura no editor | sem `generateTexture` de chunk; fronteira no shader; upload de atlas fatiado/pré-aquecido |
| Texturas residentes | ≤ 160 MB típico, ≤ 250 MB pior caso (1×) | carregamento por tipo; KTX2 (`pixi.js/compressed-textures`) se ultrapassar |

**Como medir**: (1) `node scripts/renderperf.mjs` (Chromium swiftshader: os ms são pessimistas e **não** representam GPU; valem draw calls, MB e o custo de CPU; comparação antes/depois) — saída JSON em `docs/perf/<data>.json` e tabela em `docs/QA.md`; (2) `?perf=1` na build (fps, ms de render p50/p95, draw calls, MB, GPU ms quando o timer query existe) — o dono roda no PC e no Deck e o "Exportar diagnóstico" inclui esses números; (3) preset `auto` desce um nível se p95 > 12 ms nos primeiros 120 quadros. **Hoje não existe nenhuma medição de GPU real**: a Etapa 0 produz os números de base do renderizador atual, e as Etapas 1, 2 e 5 exigem nova medição do dono antes de avançar.

---

## 7. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Números de GPU só estimados (swiftshader mede CPU) | Etapa 0 entrega `?perf=1` + `renderperf`; medição do dono nas Etapas 0/1/2/5; preset `auto`; shader simples como rede |
| Míticas/titãs paramétricos caírem no "vale da estranheza" | Sombra, especular e proporção dão credibilidade a 40–60 px; deformação por ruído; lotes de 3 aprovados em captura antes dos 13; `.glb` profissional entra pelo manifesto |
| VRAM/pacote (≈ 144 MB de unidades a 1× se tudo carregado; +80–150 MB no pacote) | 1× padrão, carregamento por tipo com pré-aquecimento, quadros enxutos, `--mirror`, KTX2, medição de MB no perf com limite no teste |
| GLSL custom em drivers antigos/Proton/WebGPU | Dois níveis de shader; `preference: 'webgl'`; compilação testada em swiftshader no CI; fallback ao `ProceduralSource` de terreno (chunks atuais) se o mesh falhar |
| Sprites "em pé" mudarem a leitura de clique/seleção/névoa | Pick em 2 estágios, névoa no pé, elipse sob a sombra, barras deslocadas; playtests do dono nas 2–3 primeiras partidas após a Etapa 2 |
| Cintilação/legibilidade a zoom 0,35 | `PAD = 8` + bordas extrudadas + mipmaps; capturas obrigatórias a 0,35; contorno de seleção em pixels de tela; opção `teamOutline` |
| Editor/mapas fixos divergirem do novo terreno | Assinatura `invalidateRect` mantida; `updateEditor` intocado; `playtest-editor.mjs` e `playtest-fixedmap.mjs` no critério de pronto |
| Tempo de bake (≈ 20 min sem GPU) e reprodutibilidade de pixels | Cache por hash, `--only`, bake na GPU do dono (1–2 min); artefatos versionados (LFS/release); teste só do JSON |
| Regressão visual passar despercebida na rotina semanal | `artshot`/`artdiff` com referências commitadas; `--update` só com captura lida e justificada no commit |
| Escopo (≈ 344 h) atrasar balanceamento e rotina | Etapas jogáveis e independentes; placeholder convive com atlas; revisão quinzenal do roteiro; P2 cortável |
| Licenças/IA | Só código próprio + npm MIT; IA apenas com autorização, escopo definido e divulgação na Steam; `docs/LEGAL.md` atualizado na Etapa 8 |
| Determinismo por acidente | Nenhuma alteração em `src/core`; `determinism.test.ts`, `smoke` e playtests em cada etapa |

---

## 8. Perguntas ao dono (as marcadas ★ bloqueiam a Etapa 2)

1. ★ **Inclinação dos sprites**: 50° "3/4" (recomendado; prévia `scratchpad/bake/out_preview.png`, nova captura na Etapa 0) ou topo puro (mais próximo do atual)? É uma constante, mas define toda a arte.
2. ★ **Direções**: 8 reais (padrão) ou 5 + 3 espelhadas (metade da memória; escudo troca de lado)?
3. **Resolução**: aceita 1× (32 px/tile) como base, com pacote 2× opcional para GPU dedicada depois?
4. **Cores de time**: manter azul/vermelho/verde/amarelo saturados ou os tons tingidos (índigo, carmim, oliva, ocre) da tabela 1.6? Quer a opção "contorno de time" ligada por padrão?
5. **Sangue e cadáveres persistentes**: sim / não / opção desligada por padrão? (Afeta a classificação etária; `LEGAL.md` diz hoje "combate estilizado sem sangue realista".)
6. **IA generativa (`atm_render_image`)**: não é usada em nenhuma etapa. Autoriza (a) só referências internas de paleta/material que não entram no jogo (sem divulgação), (b) retratos dos deuses/ilustrações de menu e campanha (custo + divulgação obrigatória na Steam), ou (c) nada?
7. **Orçamento de arte**: há previsão de contratar artista (2D para pintar sprites no contrato de câmera, ou 3D para `.glb` com esqueleto, R$ 400–1 500 por unidade humana animada) e quando? Define se as Etapas 4 e 6 assam 35 rigs ou só o suficiente para jogar.
8. **Hardware de referência**: qual GPU integrada (modelo do PC) e tem Steam Deck? Os números de `?perf=1` na Etapa 0 calibram o preset `auto` e as metas 60/40 fps.
9. **Artefatos**: aceita git LFS para `public/art/**/*.png` (75–150 MB) ou prefere release assets + `npm run art:fetch`? O pacote Steam cresce 80–150 MB.
10. **Ciclo de luz**: luz fixa de meio-dia ou amanhecer/entardecer só por cor (barato, Etapa 5)?
11. **Prioridade**: confirma terreno + cidade antes das unidades (ordem proposta) ou quer o exército primeiro?
12. **Briefing para artista**: reescrever `docs/ART_ASSETS.md` no formato "manifesto param/glb + contrato de câmera" (recomendado) mantendo a alternativa de sprites 2D pintados?
13. **Horas de aprovação**: quantas horas por semana pode dedicar a olhar capturas e aprovar lotes? O gargalo das Etapas 3–6 é a aprovação visual, não o código.
14. **Escala das unidades assadas** (Etapa 2B, `docs/art/etapa2b-desfile-*.png`): no contrato (1 tile = 32 px, humano 1,8 m ≈ 0,9 tile) o hoplita tem ≈ 1 tile de altura até o elmo e ≈ 0,45–0,6 tile de largura com o escudo (até ≈ 0,9 com a lança na diagonal) — realista ao lado do templo, mas menor que o disco procedural a zoom 1. Manter assim ou exagerar as unidades (1,2–1,4×, como AoE2) só no renderizador?
15. **Cor de time no sprite assado**: hoje a máscara é tingida com `PLAYER_COLORS` (saturadas, melhor leitura a zoom 1); as folhas de contato usaram os tons de `TEAM_TINT`. Qual prefere (liga com a pergunta 4)?
16. **Preenchimento da luz** (Etapa 3): nos edifícios a luz do céu/chão subiu de 0,9 para 2,1 (`HEMI_INTENSITY_BUILDINGS`) porque as fachadas sul — as que a câmera vê — nunca pegam o sol de noroeste e saíam quase pretas. Unidades e props seguem com 0,9 (lado de sombra mais escuro). Igualar tudo em 2,1 (reassar hoplita/cidadão/props e atualizar `docs/art/ref/`) ou manter assim?
17. **Muralha em diagonal** (Etapa 3): arrastar a muralha usa uma linha 8-conexa (degraus diagonais); o bitmask N/L/S/O não liga vizinhos só pela quina, então a diagonal sai como pilares encostados. Trocar a linha por 4-conexa (mais tiles e custo, mas contínua) ou assar peças diagonais (mais variantes)?
18. **Maravilhas acima do teto de altura** (Etapa 3, regra 3): Colosso ≈ 2,7 tiles, Ártemis ≈ 2,3 (o resto ≤ 2,2). Ficou registrado como exceção — são marcos 4×4 de fim de partida e o pick por alfa deixa clicar quem está atrás. Prefere baixar a estátua e o pedestal do Colosso (e o telhado de Ártemis) para ≤ 2,2?

---

## Apêndice A — Evidências dos protótipos (não estão no repositório; `scratchpad/` desta sessão)

- `bake/index.html` + `run.mjs`: hoplita, cavaleiro, templo, oliveiras e rochas paramétricos em three.js r0.186, câmera ortográfica 50° com estiramento 1/sin 50°, sol NO com PCF 2048², ACES; 191 quadros em 3 passes, atlas 2048² (64 %), JSON Spritesheet com âncora por quadro; `out_preview.png` (composição a 32 px/tile), `out_zoom.png`, `out_atlas.png`, `out_shadows.png`. Benchmark Pixi 8.21 (`perf-small.html`): 926 sprites → 0,45 ms de CPU por `render()` (p95 0,90).
- `exp/terrain2.html` + `run2.mjs`: terreno 144×144 em um mesh Pixi com splat + bombing + normais + água; 1 draw call, 2,43 MB de texturas; `terreno2-so.png`, `cena2-300u-120a.png` (problemas anotados em 1.7).
- `three-c/index.html` + `run.mjs`: mundo 3D em three.js; `c-persp-300u.png` (38 draw calls), `c-persp-600u.png` (38), `c-persp-zoom2.png` (cápsulas), `c-persp-zoom06.png`, `c-terreno-so.png`.
- Estado atual: `atual.png`; relatório do renderizador: `render-map.md`.
- **Prévia do bake para a pergunta 1 (Etapa 0, no repositório):** `docs/art/etapa0-bake-50.png` (3/4 a 50°), `docs/art/etapa0-bake-90.png` (topo puro) e `docs/art/etapa0-bake-lado-a-lado.png` (as duas com legendas "50° (3/4)" / "90° (topo)", barra de 1 tile, seta do sol e recortes ampliados do hoplita/cidadão a 2× e do templo). Como foram feitas: página `scratchpad/bake0/index.html` (three.js r0.186 via `npm i three`, fora do repositório) + `run.mjs` (Playwright, Chromium headless com swiftshader; servidor HTTP local; ≈ 1 s por vista) + `compose.html` (canvas 2D para o lado a lado). Cena de amostra com o contrato de §1.4–§1.5: chão 12×12 tiles com grama por ruído (verde `0x5f7a33` e seco `0x8a8a4a` de §1.6), hoplita paramétrico (elmo coríntio com crina, couraça e grevas de bronze `0x8c6a2e` metal 0,9/rough 0,35, saiote de linho `0xe8dcc0`, hoplon de bronze com centro azul de time `0x2f4fa8`, lança de 2,4 m, capa azul), cidadão (túnica de linho, cabelo, cesto de vime com frutas), templo 3×3 (estilóbato de 3 degraus e 20 colunas — 6 por lado — em mármore `0xd9cdb4`, cela com porta, entablamento com friso escuro, frontão voltado para o sul e telhado de terracota `0xa3552e` com fileiras de telhas), oliveira (tronco retorcido em 5 segmentos + 11 esferas cinza-esverdeadas), cipreste (perfil por `LatheGeometry`) e carvalho (copa de 14 esferas), mais 3 rochas; `MeshStandardMaterial` em tudo, `DirectionalLight` `0xfff0d8` × 2,6 com sombras 2048², `HemisphereLight` `0xbfd4ff`/`0x8a7a5a`, ACES, sRGB; câmera ortográfica com pitch 50° e `projectionMatrix` pré-multiplicada por `scale(1, 1/sin 50°, 1)` (chão 1:1, verticais ×0,84), 768×768 = 64 px/tile (2×); a vista de topo é o mesmo pipeline com `PITCH = 90°`. Escalas: humano 1,8 m = 0,9 tile; templo 4,75 m de altura real = 2,4 tiles → 2,0 tiles de altura visual (≤ 2,2). Duas observações para §3.2 e §1.5: (1) com a câmera no lado +z do three.js (padrão: +x = direita, +z = baixo da tela) o vetor `(−0,55; 1,0; 0,35)` joga a sombra para **nordeste**; a prévia usa `(−0,55; 1,0; −0,35)` para as sombras caírem a sudeste como manda a regra 1 — ao escrever `camera.js` fixe a convenção (câmera em +z e z do sol negativo, ou câmera em −z com a tela espelhada); (2) three r0.186 removeu `PCFSoftShadowMap` (cai em `PCFShadowMap` com aviso) — use `PCFShadowMap` + `shadow.radius`, ou VSM, no bake real.

## Apêndice B — Como rodar (após a Etapa 2)

Pipeline de bake (Etapa 2, parte A: só pipeline e artefatos; a integração no renderizador — `ArtLibrary`/`AtlasSource`/`UnitView`/`BuildingView` — é a parte B):

```
npm run art:bake -- --only hoplite,villager,temple,props   # assa o que mudou (cache por hash) e reempacota public/art
npm run art:bake -- --scale 1,2                             # 1× (32 px/tile, obrigatório) e 2× (64 px/tile); padrão: 1
npm run art:bake -- --mirror                                # 5 direções assadas + 3 espelhadas (= --dirs 5); padrão: 8
npm run art:bake -- --pack-only                             # só reempacota a partir de art/cache (sem navegador)
npm run art:bake -- --only hoplite --contact docs/art        # + folhas de contato docs/art/etapa2-<nome>-contato.png
node scripts/bake/bake.mjs --selftest-glb                   # prova do caminho .glb (exporta um cidadão com clipe e o assa)
npm run art:check                                           # valida manifestos + atlas (também roda em npm test)
npm run art:shot && npm run art:diff                        # capturas de referência (exige npm run preview) e diff
npm run perf:render                                         # = node scripts/renderperf.mjs (exige npm run preview)
http://localhost:4173/?perf=1                               # contador de fps / ms / draw calls / MB na build
```

Opções de `bake.mjs`: `--only a,b` (id exato, prefixo com hífen — `props` casa `props-trees` e `props-nodes` — ou grupo `units|buildings|props`), `--out public/art`, `--cache art/cache`, `CHROME_PATH=…` (padrão: o Chromium do Playwright deste ambiente, com `--use-gl=swiftshader --enable-unsafe-swiftshader`). Tempo medido aqui (swiftshader, sem GPU): hoplita 192 quadros em ≈ 7 s, cidadão 272 em ≈ 9–11 s, templo 4 em 0,5 s, 51 props em 2 s; o conjunto `hoplite,villager,temple,props` em 1× e 2× leva ≈ 80 s do zero e 2 s com cache.

**Arquivos**: `scripts/bake/bake.mjs` (CLI), `server.mjs` (estático, porta livre: `page/`, `node_modules/three/`, `art/`), `manifest.mjs` (esquema, expansão em quadros, animações), `check.ts` (`art:check`), `page/index.html` + `page/bake.js` (três passes por quadro, super-amostragem 2×, folha de contato, exportador do `.glb` de teste), `page/camera.js` (contrato de câmera e luz — único lugar com os números), `page/materials.js` (PBR + cor de time), `page/rigs/human.js` (+ poses em `art/poses/human.json`), `page/props.js`, `page/buildings.js`, `page/atlas.js` (recorte, prateleiras, extrusão, JSON do Pixi). Manifestos em `art/manifest/<id>.json`; cache em `art/cache/<id>/<escala>x-<hash>/` (`frames.json` + um PNG recortado por quadro e passe; ignorado pelo git); `.glb` em `art/src/` (ignorado).

**Decisões desta etapa (conferir na parte B)**:
- *Sol*: com a convenção do bake (+x = leste, **+z = sul**, câmera ao sul) o vetor de §3.2 vira `SUN_DIR = (−0,55; 1,0; −0,35)` — sombras para SE na tela, como manda a regra 1 (ver Apêndice A). Consequência visível: faces voltadas para a câmera (sul) ficam na meia-sombra; o lado oeste/topo é o iluminado.
- *Espaçamento*: `PAD = 2` px entre quadros + `EXTRUDE = 1` px de borda repetida (não 8 px como em §3.2); a margem de render fica na caixa `size.tiles` do manifesto e é recortada.
- *Passes em atlas separados* com os mesmos nomes de quadro: `<grupo>-<e>x-<n>` (cor), `<grupo>-team-<e>x-<n>` (máscara de time: cinza/branco iluminado, só as partes de time, oclusão pelo corpo; o jogo multiplica pela cor do jogador) e `<grupo>-shadow-<e>x-<n>` (sombra projetada: RGB = 0, alfa = intensidade 0–1; o jogo desenha com alfa 0,45). Cada passe é empacotado à parte (retângulos diferentes), mas **`sourceSize` e `anchor` são iguais nos três** — basta posicionar os três sprites no mesmo ponto.
- *Âncora*: `anchor` é relativo ao `sourceSize` (Pixi 8 aplica o recorte `spriteSourceSize` sozinho); o `sourceSize` é a união dos recortes de todos os quadros e passes do asset (unidade/edifício) ou do item (prop), então é estável entre quadros. Unidades: o pé; edifícios: o **centro da área ocupada** (= `x/y` do edifício no núcleo); props: a base.
- *Espelhamento* (`--mirror`): E/SE/NE não estão no atlas; as animações `<id>/<anim>/0|1|7` apontam para os quadros de O/SO/NO e `meta.aoe.mirrored = {0:4, 1:3, 7:5}`; o jogo desenha com `scale.x = −1` e `anchor.x' = 1 − anchor.x`.
- *Reprodutibilidade*: duas rodadas do zero geraram PNG, JSON e folhas de contato **byte a byte idênticos** (mesma máquina/driver swiftshader). Entre máquinas os pixels podem variar; o teste só compara JSON/estrutura.

Integração no renderizador (Etapa 2, parte B):

```
node scripts/artparade.mjs http://localhost:4173/     # "desfile": docs/art/etapa2b-desfile-{z10,z22,z22-2x}.png + etapa2b-procedural-z10.png
node scripts/renderperf.mjs http://localhost:4173/ 20 --quality low --measure 12000 --reveal [--baked off] [--label x]
node scripts/rendercpu.mjs http://localhost:4173/ --modes papa --label x   # só CPU (render + Pixi), sem o ruído da rasterização
window.aoe.renderer.art.status() / await window.aoe.renderer.art.ready()   # estado da ArtLibrary (console/scripts)
Opções → "Arte assada (beta)" (Settings.bakedArt, padrão ligada; desligada = o visual procedural de antes, idêntico)
```

**Arquivos**: `src/render/art/types.ts` (contrato do manifesto/atlas), `logic.ts` (puras: direção 8 com histerese, animação por estado, quadro a 10 fps, nomes, estágio de obra, espécie/variante/estágio de props, checagem de `meta.aoe`, espelhamento, cor composta), `AtlasSource.ts` (manifesto + atlas por grupo e escala com `Assets.load`, prefixo de cache por arquivo, mipmaps, recusa de `pxPerTile`/`pitchDeg`/versão/passe fora do contrato; sem fetch para `file://` cai em XHR + `<img>` + `Spritesheet`), `ProceduralSource.ts` (o `TextureCache` de sempre), `ArtLibrary.ts` (`unit(id)`, `frames/teamFrames/shadowFrames(art, anim, dir)`, `building(id, estágio)`, `prop(nome)`, `prewarm()`, `ready()`, `generation`), `src/render/views/UnitView.ts` e `BuildingView.ts`, `src/render/props.ts` (a camada de nós saiu de `renderer.ts`), `tests/art-library.test.ts`, `tests/render-pick.test.ts` (pick com sprites assados), `scripts/artparade.mjs` (desfile + conferência de animações/direções e dos golpes virados para o alvo num aglomerado), `scripts/rendercpu.mjs` (CPU do renderizador).

**Decisões da parte B**:
- *Carregamento*: com a opção ligada, o `setQuality` (ainda no menu) lê o manifesto (≈ 5 KB) e em seguida os atlas de units/buildings/props da escala do preset, em paralelo; cada atlas pronto sobe para a GPU (`renderer.texture.initSource`, com os mipmaps) um por quadro no ticker do Pixi. A primeira partida já começa assada — sem trocar o visual nem reconstruir nada no meio do jogo — e o primeiro quadro que usa a arte não paga o upload. O `setState` só confere (`prewarm`, idempotente); se a partida começar antes de a arte chegar, tudo sai procedural até lá. A `generation` só muda quando o que é **servido** muda e nada mais está carregando: uma reconstrução por leva; trocar para uma escala que ainda vai carregar (1× ↔ 2×, preset alto) ou religar a opção com os atlas descarregados **não** reconstrói nada na hora — serve o que já havia e reconstrói uma vez só quando a nova leva chega; depois `collect()` descarrega a escala que saiu de uso (texturas do atlas são compartilhadas e nunca destruídas por vista). Os props nascem por chunk na primeira vez que ele entra na tela (`PropLayer.reset` não cria sprites): reconstruir por troca de arte refaz só o que já foi visto (0,3–0,5 ms no `reset` do mapa 144×144, contra 30–53 ms antes).
- *Ordem global por y*: com a arte assada, unidades (não voadoras) e edifícios entram nas faixas de chunk dos props, com `zIndex` = y do pé (props = centro do tile, edifícios = centro da área, edifício plano e pisável — fazenda — na borda de cima do footprint, para ficar sob o cidadão que colhe na metade de cima dela, tocos meio tile acima para ficarem sob quem pisa neles); voadoras continuam na camada `units`, acima. Uma moldura na cor do fundo em volta do mapa, logo acima das faixas, corta copas e sombras que passariam da borda (a névoa cobre só o retângulo do mapa). A camada `ground` (seleção, waypoints, relíquias, colina) passa para baixo das faixas; o fantasma de construção e o alvo de poder vão para a camada `hp` (senão árvores e o templo os cobririam). Com a opção desligada a ordem das camadas é exatamente a de antes.
- *No posto*: a unidade com o alvo ao alcance — atacando (também entre golpes), coletando ou construindo, pelas mesmas distâncias da simulação (alcance + raios, 1,0 do nó, 0,9 da fazenda, 0,95 da obra) com 0,15 tile de folga — fica parada virada para o alvo. O empurrão da separação entre vizinhos (`applySeparation`, que mexe no x/y todo tick num aglomerado) não vira passo nem direção: antes, 18–28 % dos ticks de coleta saíam como `walk`/`carry` virados para o lado do empurrão e ~40–50 % dos golpes num corpo a corpo misturado apontavam a 90° ou mais do alvo (`artparade` confere isto no aglomerado 5 × 5).
- *Direção*: pela projeção NA TELA (`Camera.worldDeltaToScreen`, hoje identidade em escala), `dir = ((round(ângulo/(π/4)) % 8) + 8) % 8` com histerese de 0,12 rad além da borda do octante (sem piscar em diagonais): no posto, para o alvo; andando de fato, pela velocidade; senão mantém a última. Andar = deslocamento do tick ≥ 30 % do passo (15 % para continuar andando; `isWalking`).
- *Animação*: ataque em curso > andar (ou `carry`, só com comida: o quadro é um cesto de frutas e ainda não há carga por recurso — madeira e ouro andam com `walk`) > `gather` (no posto coletando/construindo/reparando) > parado. Um golpe só recomeça o ataque no quadro 0 se o `attackTick` for novo **e** recente (≤ duração do ataque): a vista que volta à tela ou sai da névoa não toca um golpe antigo. Relógio das animações = tempo de **jogo**, `(tick + alpha)/TICK_RATE`, que não volta: congela na pausa e na espera do lockstep (ninguém anda no lugar) e acelera em 2×/3× junto com o movimento; loops com uma fase por unidade. Morte: a vista que some deixa a direção para o efeito `death`, que toca `die` na faixa do pé a partir do tick da morte e só apaga depois do último quadro (em qualquer velocidade); petrificada = estátua cinza (quadro parado) no lugar da queda; colapso do templo usa o quadro completo em cinza. Disco de carga na cor do recurso ao lado da cabeça, também na assada.
- *Espelhamento* (`--mirror`, ainda não usado pelos atlas): `scale.x = −1` gira em torno da âncora, então o pé fica no lugar **sem** trocar a âncora (o `1 − anchor.x` do Apêndice B da parte A vale para quem espelha a textura); a sombra não espelha (o sol é fixo).
- *Cor de time*: `tint` da máscara = `PLAYER_COLORS[dono]` composto com o flash de dano/bronze (`mulColor`); pergunta 15.
- *Barras de vida e patente*: 6 px acima da cabeça — o topo visível do parado na direção em que ele é mais **baixo** (a cabeça tem a mesma altura em todas; a lança só sobe o topo em algumas: hoplita 31 px na crista contra 43 px com a lança, cidadão ≈ 25 px) —, não em `anchor.y · sourceSize.h` (a moldura inclui lança deitada, morte e sombra). Templo: acima do telhado do estágio atual.
- *Pick*: 1º voadoras pelo círculo (camada acima das faixas), 2º unidades procedurais pelo círculo (pequenas: a caixa larga do hoplita vizinho não as esconde — botão direito no inimigo encostado ataca), 3º as caixas — quadro de cor atual das unidades assadas, quadro do edifício assado (telhado) e o footprint de qualquer edifício — e ganha a desenhada na frente (maior y de desenho: pé da unidade, centro do edifício, borda de cima da fazenda), 4º o círculo de qualquer unidade. O telhado do templo cobre o cidadão atrás dele; quem está na frente do edifício continua ganhando; a névoa decide pelo pé (`tests/render-pick.test.ts`).
- *Props*: espécie em manchas de ≈ 12 tiles (ruído) com 12 % de intrusas por hash, variante 0–3 e porte (70 % grande) por hash do tile, escala 0,94–1,06; `<espécie>/0/thin` quando `amount < max` (a troca de quadro vem na conferência periódica dos chunks, ≈ 30 quadros); toco quando a árvore esgota (`amount ≤ 0,001` no objeto do nó), só no renderizador, some sob edifício novo ou nó novo; frutas full/half/empty e ouro 0–2 por `amount/max` (> ⅔, > ⅓); cervo/javali com a direção fixa por id; `rock/*` não tem `NodeType` e fica para decoração numa etapa futura. Sombras dos props em faixas espelhadas na camada `shadows`, com o mesmo culling.
- *Mipmaps* nos atlas (`autoGenerateMipmaps`) para zoom < 1, com filtro entre níveis `nearest` no 1× (na renderização por software o trilinear custava ~40 % do fps da cena) e trilinear no 2×; `atlasScale` 2 só no preset alto.
- *Desempenho* (números em `docs/QA.md`): o mundo é um grupo de render do Pixi 8 (mover a câmera não recalcula a transformação de cada sprite) e props e sombras dos props são grupos próprios. As faixas **não** são grupos: cada grupo é um lote (≥ 1 draw call por faixa na tela) e, com unidades andando, elas refaziam as instruções a cada quadro de qualquer jeito — sem ganho de CPU medido; tirá-las levou os draw calls do mapa inteiro de 15 para 9 (zoom 1: 8 → 6). Árvores no miolo do bosque (E, S e SE também árvores) não desenham a sombra (cairia sob as copas vizinhas; volta quando a vizinha é cortada): −20 % de sprites num bosque denso. Com isso nosso código custa o mesmo que antes e o Pixi fica perto da base a zoom 1 e na rolagem (+0–0,1 ms), +0,2 ms no aglomerado e +0,8 ms (+50 %) no mapa inteiro com ~4 900 sprites; o fps por software no preset baixo empata ou melhora. Draw calls: 3–6 antes da arte assada → 6–9 (eram 8–15 com as faixas como grupos), dentro do orçamento de 40.
- *Árvores*: a base de cada árvore é deslocada ±0,18 × ±0,14 tile por hash (bosques sem a grade dos centros dos tiles; o tile bloqueado não muda) e o toco nasce no mesmo ponto.
- *Retratos* (`renderer.portrait`) continuam procedurais nesta etapa (Etapa 7).

## Apêndice C — Glossário

*Bake/assar*: renderizar um modelo 3D em imagens 2D em tempo de build. *Atlas*: uma imagem grande com muitos quadros + JSON com as coordenadas. *Máscara de time*: quadro em cinza que o jogo tinge com a cor do jogador. *Splatting*: misturar várias texturas de terreno por pesos. *Texture bombing*: deslocar/rotacionar a textura por células aleatórias para esconder a repetição. *Normal map*: textura que diz "para onde a superfície aponta" para o sol iluminar relevo sem geometria. *Chunk*: bloco de 16×16 tiles. *Preset*: conjunto de opções de qualidade. *Manifesto*: arquivo JSON que descreve um asset para o pipeline.

## Apêndice D — Etapa 3 (concluída): a base dos edifícios, os lotes e como adicionar um edifício

**O que a base fez (set/2026)** — estrutura genérica do bake e do renderizador para qualquer edifício, e o lote 1 de modelos: **Centro Cívico** (3 variantes por Idade), **casa**, **muralha** (16 variantes por bitmask), **portão** (eixos ew/ns, aberto/fechado) e **torre**; o **templo** da Etapa 2 ganhou dano e ícone; **escombros** genéricos 1×1…5×5. Os outros 15 edifícios seguem procedurais (lotes seguintes). Capturas: `docs/art/etapa3-base-{cidade,cidade-z22,fantasma,hud-icones,cidade-procedural}.png` (`scripts/artcity.mjs`), folhas de contato `docs/art/etapa3-{centro-civico,casa,muralha,templo,escombros,icones}-contato.png`, prévia sem o jogo `docs/art/etapa3-composicao.png` (`scripts/bake/compose.mjs`).

- **Estados** (`<id>/<estado>[/<variante>]`): `build0/1/2` (obra < 33 / < 66 / < 100 %: alicerce, meia altura, estrutura sem telhas; andaime com bandeirola de time), `complete`, `damage1` (≥ 1/3 da vida perdida) e `damage2` (≥ 2/3) — o `complete` com rachaduras, telhas faltando (buracos com ripas à mostra), marcas de fogo (fuligem), peças quebráveis caídas (merlões, acrotérios) e entulho na base; o portão tem também `open`. O dano é **genérico** (`applyDamage` em `page/buildings.js`): raios na direção da câmera acham paredes e telhados visíveis e os decalques só entram se os quatro cantos caem na mesma superfície; quantidade proporcional ao tamanho. A **fumaça é partícula no renderizador** (`src/render/particles.ts`), não assada.
- **Variantes** (`variants` + `variantBy` no manifesto): `wallMask` (muralha: bitmask N = 1, L = 2, S = 4, O = 8 dos vizinhos muralha/portão/torre **do mesmo dono**, `00`–`15`), `gateAxis` (portão: `ns` se liga só ao norte/sul, senão `ew`), `ageTier` (Centro Cívico: `a0` Arcaica, `a1` Clássica/Heroica, `a2` Mítica/Titãs pela Idade do dono). As variantes multiplicam todos os estados.
- **Muralha sem costura**: braços do centro até a borda do tile (+ 8 cm de sobreposição na cor), fiadas horizontais e merlões em posições periódicas de 0,5 m; retas (`05`, `10`) contínuas, demais com pilar no centro. Os vizinhos oeste e norte entram no bake como **geometria de contexto** (`userData.context`: invisível, só projeta sombra — a sombra do vizinho cai nesta peça como no jogo) e a **sombra no chão é recortada** à região da peça (`group.userData.shadowClip`, recorte em pixels em `page/bake.js`, porque o `ShadowMaterial` do three não aceita `clippingPlanes`): a sombra de um trecho contínuo é desenhada uma vez só, sem as faixas escuras dobradas do multiply. Limite conhecido: no canto interno de um L duas sombras ainda se somam numa área de ≈ ½ tile. A **torre** também é por bitmask (`wallMask`, 16 variantes que só mudam a sombra: cor e máscara saem idênticas e o empacotador guarda um retângulo só) e tira do recorte a faixa que o vizinho leste/sul já sombreia (`shadowClip.cut`, só no tile do vizinho); sobra a ponta da sombra da torre sobre a muralha do tile seguinte (≈ 0,15 tile) e um vão claro a sudoeste da torre (a sombra do vizinho oeste, recortada na peça dele, não entra na torre).
- **Portão**: aberto quando uma unidade do mesmo time **que o jogador local vê** está a ≤ 1,3 tile do centro (`gateNear`; o núcleo já deixa o time passar por `gateTeam` — o renderizador só lê; um inimigo sob a névoa não abre o portão na tela). No eixo `ew` as folhas fechadas ficam de frente para a câmera e abertas somem de perfil (passagem vazada); no `ns` as folhas abertas giram para leste, onde a câmera as vê. Nos dois eixos, uma **casa de guarda** com telhado de quatro águas e flâmula de time no alto (≈ 2 tiles visuais): no `ns` a câmera só vê o topo, e sem ela o portão fechado era igual à muralha.
- **Escala e luz**: casa 2×2 (cumeeira 3,5 m ≈ 1,5 tile visual), torre 1×1 (≈ 2,2 tiles com a bandeira), muralha 2,4 m + merlões (≈ 1,3 tile), portão 3,5 m; Centro Cívico = pequena ágora (pátio aberto para o sul com altar, pritaneu ao fundo com telhado de cumeeira leste-oeste, alas de pórtico e torre de guarda no canto nordeste). Nos **edifícios** a luz do céu/chão é `HEMI_INTENSITY_BUILDINGS = 2,1` (unidades e props seguem com 0,9): as fachadas sul nunca pegam o sol de noroeste e saíam quase pretas (≈ 25 % do topo); agora ficam na "meia-sombra" de §1.5 (pergunta 16). Muralhas e torres em cantaria clara de calcário (`ashlar*`).
- **Ícones** 64×64 (128 no 2×) no atlas `icons` (cor + máscara de time; moldura fixa): mesma câmera do contrato enquadrada no modelo, sem chão. No HUD (`hud.ts` `bIcon`): menu de construção, painel e miniaturas da seleção e tooltip, com os estandartes na cor do dono; composição em canvas 2D direto da imagem do atlas (`Renderer.iconUrl`, cache por tipo e cor até a próxima geração da arte); sem arte → o emoji de sempre.
- **Renderizador** (`src/render/views/BuildingView.ts` genérico, `renderer.ts`): `ArtLibrary.buildingArt(id)` (serve o tipo só se os 6 estados existirem em todas as variantes), `building(id, estado, variante)`, `rubble(w, h)`, `icon(id)`; estado de reserva `damage2 → damage1 → complete`, `open → complete`; o bitmask é recalculado só quando a topologia das muralhas muda (assinatura dos ids muralha/portão/torre → `wallVersion`); tint lilás de desabilitado e flash de dano como antes; sombra na camada `shadows`; **escombros** (`rubble/<w>x<h>`) no lugar do edifício por 12 s de jogo (apagando nos últimos 2,5 s, some se um edifício novo ocupar o lugar), com o quadro `damage2` afundando e poeira no colapso; **fumaça** de 1,2 / 3,2 baforadas/s × √área nos danificados prontos, até 35 % do orçamento de partículas do preset (`smokeBudget`), relógio de jogo (congela na pausa); **fantasma de construção** = quadro `complete` translúcido tingido de verde/vermelho na variante que teria ali (a linha de muralha já sai com os bitmasks entre si e com as muralhas existentes do jogador), por cima do retângulo do footprint mais leve. O interruptor "Arte assada (beta)" continua desligando tudo (vistas, escombros, fumaça, fantasma e ícones voltam ao procedural/emoji).
- **Números**: atlas `buildings` 1× 2048×1024 (151 quadros) e 2× 2048² (o próximo lote abre a página 2 — o empacotador nunca divide um asset entre páginas); 20 atlas no total, 6,5 MB de PNG, 96,5 MB de VRAM se tudo carregado (orçamento 150 / 250 MB). Bake do lote: ≈ 7 s a 1× e 12 s a 2× (swiftshader).

**Como um lote adiciona um edifício** (ex.: `barracks`):

1. `scripts/bake/page/buildings.js`: um construtor `BUILDERS.barracks = (k, p) => { … }` em metros, origem no centro da área ocupada, chão em y = 0, +z = sul (frente para a câmera). Use o kit: `k.block/box/cyl`, `k.room` (paredes com porta), `k.column`, `k.gable` (`axis: 'x'` = cumeeira leste-oeste, que esta câmera lê melhor; `frame: true` = só caibros), `k.shed`/`k.shedX` (alpendre), `k.scaffold` (andaime + bandeirola), `k.pile`, `k.banner` (estandarte de time), `k.amphora`, `k.breakable(mesh)` (cai no dano), `k.context(mesh)` (só sombra) e `k.debris`/`k.debrisMats` (onde e de que cai o entulho). Trate `p.stage` 0–2 (obra) e 3 (pronto); `p.variant` se houver variantes; o dano é automático. Materiais em `page/materials.js` (paleta §1.6; `M.team` = máscara de time). Faces sul ficam na meia-sombra: prefira materiais claros nas fachadas.
2. `art/manifest/barracks.json` (copie `house.json`): `kind: "building"`, `source: { type: "param", rig: "building", params: { style: "barracks" } }`, `footprint`, os 6 estados em `anims`, `icon: { anim: "complete" }`, `team`/`shadow`, `size.tiles` + `anchor` (caixa de render em tiles e o centro da área nela: largura ≈ pegada + 1 tile + sombra a leste ≈ 0,55 × altura em tiles; altura ≈ pegada + 0,84 × altura + sombra ao sul ≈ 0,35 × altura) e, se preciso, `variants` + `variantBy`.
3. `npm run art:bake -- --only barracks --scale 1,2 --contact docs/art` (≈ 5–10 s; reempacota tudo a partir do cache — as outras peças precisam estar no cache, senão rode sem `--only` uma vez, ≈ 65 s do zero) e olhe `docs/art/etapa3-<nome>-contato.png`; o bake avisa se algum passe "encosta na borda da caixa" (aumente `size.tiles`). `node scripts/bake/compose.mjs` monta a cidade de teste sem o navegador.
4. `npm run art:check` e `npx vitest run tests/art-manifest.test.ts tests/art-library.test.ts` (`art-library.test.ts` "edifícios assados (os 21 do jogo)" confere todo tipo de `BUILDINGS` em todos os estados, variantes e passes, nas duas escalas); `npm run build`, `npm run preview` e `node scripts/artcity.mjs` (ou uma cena própria) com a captura olhada com Read. Nenhuma linha do renderizador muda: o tipo passa a sair assado quando o atlas tiver os 6 estados.

**Lote economia (set/2026)** — fazenda, celeiro, serraria, mina, mercado, academia e cornucópia, num módulo próprio (`scripts/bake/page/rigs/buildings-economy.js`, registrado em `buildings.js` por `Object.assign(BUILDERS, ECONOMY_BUILDERS)`; o bake põe no hash de todo edifício os módulos `page/rigs/buildings-*.js`, então um lote novo não mexe no registro). Folha `docs/art/etapa3-economia-contato.png` (campo `contact: "economia"` no manifesto dá o nome da folha; as linhas de edifício da folha agora terminam com os escombros da pegada), capturas `docs/art/etapa3-economia-{cidade,z22,procedural}.png` (`node scripts/artcity-economia.mjs [url]`: a vila do lote em todos os estados, a procedural é o "antes"), testes `tests/art-economy.test.ts`.

- **Fazenda** (plana e pisável, ≤ 1,8 m): leito lavrado com camalhões arredondados e torrões, cerca de estacas e travessas com vão ao sul, espantalho com túnica de time; obra = estacas, arado e o campo sendo lavrado de norte a sul. Variante **`farmCrop`** (`sown`/`growing`/`ripe`, em todos os estados). O núcleo não tem estoque na fazenda (fonte infinita para 1 cidadão), então a plantação segue um **ciclo de colheita** cosmético de `FARM_CYCLE` = 150 s de jogo contado da colocação (`farmCrop` em `logic.ts`: semeada < 30 %, crescendo < 65 %, madura; defasagem por id ≤ 12 % para fazendas de mapa/cenário não trocarem juntas; a obra de 25 s termina na semeada); o fantasma mostra a semeada. Se a fazenda ganhar estoque no núcleo, troque o tempo pela fração restante no mesmo ponto do renderizador (`updateEntities`). Dano: manchas de plantação queimada/pisoteada, espantalho tombado, travessas caídas.
- **Celeiro**: armazém sobre soco alto (reboco, respiros, telhado leste-oeste, guincho), dois silos-colmeia de calcário com fiadas (o reboco branco saía cinza na meia-sombra), escada até a escotilha, pithoi, sacos e cesto de grão. **Serraria**: galpão de tábuas com telhado de uma água, pilha de toras curtas com os topos claros para a câmera (toras longas liam como colunas), cavalete com serrote, cepo com machado; o dano rola as toras de cima e tomba o cavalete. **Mina**: morro de rochas com a galeria escorada e a boca escura, veios de ouro postos por raios nas faces que a câmera vê, poço com sarilho, carrinho de minério. **Mercado** 3×3: stoa de 6 colunas com ânforas, quatro bancas (dois toldos de time, dois de linho listrado), a balança de bronze no meio. **Academia** 3×3: salão de mármore com pórtico de 6 colunas, frontão central cruzando o telhado leste-oeste, tríglifos, estandartes; êxedra com a esfera armilar e duas oliveiras. **Cornucópia**: chifre de ouro (tubo de raio variável ao longo de uma curva, anéis de bronze, faixa de time) transbordando frutas, uvas, trigo, moedas e toras sobre pedestal redondo.
- Materiais próprios do lote (terra lavrada, brotos, trigo, palha, frutas, madeira cortada) ficam no módulo (`mats(k)`), não em `materials.js` (que invalidaria o cache de tudo); paredes e telhados usam os de `materials.js` para o dano genérico achá-los. Nada abaixo de y = 0 (o passe de cor não tem chão).
- Números: 54 quadros por escala (fazenda 18) + 7 ícones; `buildings` 1× 2048×1024 (205 quadros), 2× em 2 páginas; 22 atlas, 8,6 MB de PNG, 126,6 MB de VRAM se tudo carregado (orçamento 150 / 250 MB). Os quadros do lote 1 saíram byte a byte idênticos.

**Lote militar (set/2026)** — `scripts/bake/page/buildings-military.js` (registrado em `buildings.js` por `Object.assign(BUILDERS, MILITARY_BUILDERS)`; o hash dos edifícios passou a incluir todo `page/buildings*.js`), manifestos `art/manifest/{barracks,stable,siege_workshop,fortress,titan_gate,wonder_zeus,wonder_artemis,wonder_colossus}.json`, folha de contato `docs/art/etapa3-militar-contato.png` (estados, escombros da pegada e, no portal, o brilho somado ao pronto) e capturas no jogo `docs/art/etapa3-militar-{cidade,portal-a,procedural}.png` (`node scripts/artmilitary.mjs [url]`: os 8 prontos, obras, dano, escombros, o brilho do portal trocando de quadro, fantasma da fortaleza e ícones no HUD; falha se algo sair procedural). Os quadros do lote 1 saíram idênticos pixel a pixel.
- **Quartel** 3×3: salão de reboco com alpendre de 6 colunas dóricas diante de uma parede pintada de vermelho com escudos de time, telhado leste-oeste; pátio de treino em areia com muro baixo, entrada entre pilares com estandartes, cavalete de hoplons (time), lanças no muro e bonecos de palha. **Estábulo** 3×3: cocheira com 4 baias de meia-porta, piquete de madeira com dois cavalos (um com xairel de time, outro pastando), bebedouro, telheiro de tábuas com feno e mantas de sela (time) na cerca. **Oficina de cerco** 3×3: galpão aberto com sanefa de time, aríete em montagem, cabrilha de 4 m içando uma viga, litóbolo pronto, balas de pedra e toras. **Fortaleza** 4×4: muralhas de cantaria (2,5 m) recuadas entre quatro torres salientes (3,7 m) com merlões, portão entre pilones com estandartes, pátio com poço e rampa, torre de menagem com telhado ao fundo.
- **Maravilhas** 4×4 (até ≈ 3 tiles de altura visual, a parte alta no meio/fundo da área): **Estátua de Zeus** (sentado no trono, marfim e ouro, Nike e cetro com a águia, sobre pedestal; êxedra de colunas jônicas atrás; espelho de azeite na frente; na obra, a armação de madeira da estátua), **Templo de Ártemis** (jônico, octastilo e díptero na frente, tambores esculpidos, friso e tímpano azuis com ouro, telhas de terracota escura com cumeeira e antefixas douradas — o templo comum tem a clara), **Colosso** (Hélio de bronze com 6 m, tocha acesa e coroa radiada, sobre pedestal de dois tambores; obra = pernas e depois o corpo com o esqueleto de ferro/pedra à mostra). As figuras são uma `figure()` de primitivas (proporções do rig humano, em pé ou sentada) — um `.glb` entra pelo manifesto como nos demais.
- **Portal dos Titãs** 5×5: plataforma de pedra escura com lajeado e fendas de brasa, anel colossal com faixas de bronze e runas entre pilones ciclópicos (correntes partidas, braseiros), vórtice do Tártaro no anel; obra = alicerces e estacas → cimbre de madeira com o anel subindo pelos lados. **Animação**: o manifesto tem, além dos 6 estados, `glow` (6 quadros, 8 fps, loop) — uma **sobreposição** só com a energia (braços do vórtice girando 1/3 de volta no loop, chamas, runas e fendas pulsando), com o resto do modelo como oclusor e sem sombra/máscara; o `complete` traz o vórtice estático (ícone, fantasma e reserva ficam bons sem animação). No jogo, `BuildingArt.glow` (só se os quadros existirem) e `BuildingView.showGlow` desenham o quadro `glowVariant(relógio de jogo)` com blend aditivo por cima do pronto **e** do danificado (congela na pausa, acelera com a velocidade); o sprite extra só nasce em quem tem `glow`. `art:check` não exige sombra nos quadros `glow`.
- **Números**: 25 atlas, 10,5 MB de PNG, 181,5 MB de VRAM se tudo carregado (orçamento 250); `buildings` 1× numa página 2048² (205 quadros, cheia — o próximo lote abre a segunda) e 2× em 4 páginas; o lote assa em ≈ 7 s a 1× e ≈ 12 s a 2×. Folha de contato: o bake acrescenta à linha de cada edifício os escombros da sua pegada e, para uma animação (o `glow`), uma linha própria somada ao `complete`.

**Integração (26/09/2026)** — os dois lotes entraram juntos sobre a base. Os módulos de estilos ficaram onde cada lote os pôs (`page/rigs/buildings-economy.js` e `page/buildings-military.js`, ambos registrados em `buildings.js`), e o hash de todo edifício inclui os dois padrões (`page/buildings*.js` e `page/rigs/buildings-*.js`); a folha de contato usa o `contact` do manifesto (economia) e a tabela do bake (militar), e os escombros da pegada entram no fim da linha de todo edifício — também nos com variantes (muralha, portão, Centro Cívico, fazenda), o que atualizou as folhas `etapa3-{casa,centro-civico,escombros,icones,muralha,templo}-contato.png`.

- **Bake completo** (`npm run art:bake -- --scale 1,2 --contact docs/art`, 26 manifestos, sem cache): 106 s (swiftshader); duas rodadas do zero (uma com cache e saída no rascunho) deram os 53 arquivos de `public/art` e o cache **byte a byte idênticos**; os quadros do lote 1 são idênticos aos da base. Atlas: `buildings` 1× = cor 2048² (247 quadros) + 2048×512 (12: Estátua de Zeus e Colosso, que já não cabem na primeira página — o empacotador não divide um asset entre páginas), máscara 2048×512, sombra 2048²; 2× = cor 4 × 2048², máscara 2048×1024, sombra 3 × 2048²; `icons` 21 (512×256 a 1×). Total: 26 atlas, 12,64 MB de PNG, 206,8 MB de VRAM se as duas escalas estiverem carregadas (orçamento 250) — **53,8 MB a 1×** (71,7 MB com mipmaps) e **153 MB a 2×** (204 MB). `art:check`: ok, com 4 avisos esperados (obras da fortaleza e quadros `glow` do portal sem máscara de time).
- **Testes**: `art-library.test.ts` confere os **21 tipos de `BUILDINGS`** (todo estado × variante na cor e na sombra, máscara em quem tem time, ícone, âncora e moldura fixas, nas duas escalas) e `art-manifest.test.ts` exige um manifesto de edifício com a pegada do jogo para cada tipo — critério "o `ProceduralSource` deixa de ser usado para edifícios em partida normal".
- **Capturas para o dono** (`node scripts/artages.mjs [url]`): uma cidade murada completa por Idade — `docs/art/etapa3-cidade-{arcaica,classica,heroica,mitica}.png` — com todos os edifícios que a Idade libera (Centro Cívico na variante da Idade, casas, fazendas nas 3 plantações, armazéns, templo, quartel; mercado, estábulo e academia na Clássica; oficina de cerco e fortaleza na Heroica; a Estátua de Zeus, o Colosso em obra e a cornucópia na Mítica), obras nos três estágios, danificados com fumaça, uma casa derrubada (escombros), muralha com torres nos cantos e ladeando o portão sul (aberto, um cidadão passando), portão leste norte-sul e trechos da muralha em obra e danificados; e `etapa3-cidade-maravilhas.png` com as 3 maravilhas e o Portal dos Titãs (vórtice aceso) na Idade dos Titãs. O script espera 4 s de **jogo** (não de relógio) antes da captura (colapso concluído) e escolhe uma área em que a tela inteira fique dentro do mapa. Referências do `artshot` atualizadas (`docs/art/etapa3-{antes,depois}-*.png`, `docs/art/ref/`; as da Etapa 2B já não batiam nem com a `main`, que mudou a partida depois do viés de posição).
- **Desempenho** (`docs/QA.md`, "Etapa 3"): preset Baixo, `main` × integração, mediana de 4 rodadas: fps 7,4 → 6,6 (zoom 1), 9,3 → 8,8 (mapa inteiro), 8,0 → 8,1 (aglomerado), 8,1 → 7,9 (rolagem); `renderer.render` 0,66 → 0,69 / 0,96 → 1,20 / 0,70 → 0,81 / 0,69 → 0,80 ms (o `rendercpu`, só CPU, dá +7 % no mapa inteiro); draw calls +1–2; texturas 26 → 74,5 MB. A integração tirou o lixo por quadro da vista de edifício (chave de estado, variante da muralha e da fazenda).

**Revisão (26/09/2026)** — correções dos achados da revisão da integração:

- **Névoa**: o portão só abre por unidade visível ao jogador local, e edifício de outro time fora de vista fica na última versão vista (estado, variante, fumaça, brilho); teste em `tests/render-pick.test.ts`.
- **Pick por alfa** (`src/render/art/alphaMask.ts`, `BuildingView.contains`): grama e unidades vistas atrás de edifícios altos deixam de ser o edifício — clique direito na grama acima do Centro Cívico inimigo dá `move`, o hoplita atrás do Centro Cívico e do Colosso é clicável (conferido no navegador); sem o alfa (Node, recurso ausente) vale a caixa.
- **Colapso** na faixa do edifício, com o `zIndex` dele (quem estava na frente continua na frente); poeira e fumaça seguem na camada de efeitos.
- **Fantasma inválido** vermelho forte (`0xff5a5a`, alfa 0,5) e retângulo a 0,35 onde não pode.
- **Muralha movida no editor** (mesmo id): a assinatura da topologia inclui a posição; `playtest-editor.mjs` confere o bitmask das vistas antes e depois de mover.
- **Portão norte-sul** legível (casa de guarda + flâmula), **muralha com cor de time** (`team: true`; estandarte nos pilares e nas retas `05f`/`10f`, uma a cada 3 tiles por `wallFlagAt`), **contorno de time** implementado (§1.8), **sombra dupla das torres** resolvida (acima), exceção de altura das maravilhas registrada (§1.3, pergunta 18).
- **Dano estrutural** das maravilhas e do portal (`k.onDamage` em `page/buildings-military.js`, antes do dano genérico): o Colosso apaga a tocha e tomba sobre os pés (no nível 2 o antebraço, a clâmide e a estela caem), a Estátua de Zeus perde a Nike, o cetro e colunas/entablamento das pontas da êxedra (no nível 2 também a cabeça), Ártemis perde colunas da frente e esculturas do tímpano, o portal perde faixas de bronze, correntes e a quina dos pilones (nada do que brilha sai do lugar: a sobreposição `glow` é a mesma no danificado). Pixels alterados (|ΔRGBA| > 60) em relação ao `complete`, a 1×: Colosso 0,3/2,8 % → 10,5/21,3 %, Ártemis 0,9/3,8 → 2,9/9,2, Zeus 0,9/3,6 → 6,1/23,7, Portal 1,8/2,8 → 3,9/14,9.
- **Empacotador**: quadros idênticos de um mesmo asset dividem o retângulo no atlas (a torre por bitmask; de quebra, quadros repetidos das animações das unidades): 26 atlas, 12,25 MB de PNG, 193,8 MB de VRAM com as duas escalas (antes 206,8) — `units` 1× 2048×512 → 2048×256. Bake 1×+2× do zero em 91 s; `--pack-only` reproduz os mesmos PNG.
- **Capturas**: `docs/art/etapa3-maravilhas-dano.png` (as 3 maravilhas e o portal em pronto, dano 1 e dano 2, no jogo) e as cidades refeitas (`etapa3-cidade-{arcaica,classica,heroica,mitica}.png`, `etapa3-base-*.png`, `etapa3-militar-{cidade,portal-a}.png`, `etapa3-composicao.png`, folhas `etapa3-{muralha,militar,icones}-contato.png`).
- **Testes**: o teste das sortidas da m10 virou um por dificuldade (≈ 26 s num `it` passava de 60 s com a máquina carregada e o worker do vitest perdia o RPC `onTaskUpdate` — saída 1 com todos os testes passando).

**Pendências da Etapa 3**: aprovação do dono das 5 capturas de cidade; CPU do renderizador no mapa inteiro +0,24 ms (+24 % no `renderperf`, +7 % no `rendercpu`) — se incomodar, pular a atualização por quadro dos edifícios parados (assinatura de estado/variante/tint) e trocar o `updateGatesOpen` O(unidades) por uma busca a partir dos portões; texturas 1× em 74,5 MB (sombras a ½ resolução, KTX2 ou páginas por Idade se a Etapa 4 apertar o orçamento de 160 MB); as estátuas (Zeus, Colosso) são figuras de primitivas — boas a zoom 1, bonecas a 2,2 (candidatas a `.glb`) — e os ícones do Colosso e do portal enquadram o modelo inteiro; os módulos dos lotes em pastas diferentes (`page/` × `page/rigs/`) — unificar quando mexer num deles (muda o hash, reassa os edifícios); retratos (`renderer.portrait`) ainda procedurais (Etapa 7); a linha de muralha arrastada usa Bresenham 8-conexo — degraus diagonais não se ligam no bitmask N/L/S/O (pergunta 17); sombras que se sobrepõem entre peças diferentes (cantos internos, a ponta da sombra da torre no tile seguinte) ainda somam no multiply — a saída geral seria compor as sombras dos edifícios numa textura com mistura por máximo antes do multiply; o dano 1 de alguns edifícios grandes ainda é discreto (mercado 0,8 %, academia 1,2 %, quartel 1,6 %); a fronteira de território cruza as cidades de teste montadas por `debugBuild` (fora do território, o que o jogo normal não permite).
