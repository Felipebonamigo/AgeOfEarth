# E8 — Arte por Era (kit de Era nos edifícios, unidades novas, navios, criaturas, maravilhas e efeitos)

- Estado: pendente · Pré-requisitos: E1, E2, E3, E4, E5, E6 e E7 concluídas (a E9 pode correr junto) · Estimativa: 28 dias de agente (infraestrutura + lote 1, Eras I–IV: 13,5 dias; lote 2, Eras V–VIII: 14,5 dias; cabe nas 6 semanas da E8 em `docs/ROADMAP.md`)

> Como usar este guia: siga os blocos na ordem (0, A, B, C, R, U, F, G, P, H, J, K, L, M; as letras D, E e I ficaram de fora para não confundir com as decisões D1–D30, as etapas E1–E10 e a Era I). Cada passo `- [ ]` cabe num
> commit e diz como conferir. Os números de tamanho, cor e tile são **valores iniciais**: se uma captura mostrar que
> não funcionam, ajuste o número e anote em `docs/ART.md` (Apêndice J), sem mudar a decisão. Todo bake longo roda em
> segundo plano com log (`run_in_background`), nunca em primeiro plano.

## Objetivo e resultado jogável

Ao fim da E8 nada na partida sai com arte provisória (alias da E2/E3/E4/E5/E7 ou procedural):

- **Edifícios por Era**: os 21 edifícios de hoje e os novos (Pedreira, Estaleiro, Poço de nafta, Poço de petróleo,
  Refinaria e, se existirem, Universidade e Fábrica) mudam de aparência com a Era do **dono**: madeira e adobe (I) →
  pedra e telha dórica (II, a arte de hoje) → mármore coríntio (III) → tijolo e cúpula bizantina (IV) → reboco e
  baluarte (V) → neoclássico (VI) → tijolo, ferro e chaminé (VII) → concreto e aço (VIII). Obra 0–2, pronto, dano 1–2,
  escombros, fumaça, fantasma, ícone, pick pelo alfa e contorno de time continuam como hoje. Ao avançar de Era, os
  edifícios do jogador trocam com uma nuvem de poeira; os do inimigo mostram a Era dele.
- **Evolução de função**: muralha paliçada → pedra → teodosiana → baluarte → concreto; torre → torre de canhão →
  casamata; fortaleza → castelo → forte estrelado → forte de tijolo → forte de concreto; fazenda com cerca de vime,
  muro de pedra com moinho e cerca de arame com cata-vento.
- **Cidadão por Era** (6 aparências) e barcos de pesca/transporte em 3 aparências (remo, vela, vapor).
- **As 41 unidades de linha da E3** com arte própria (arma de fogo com mira e disparo, couraças, uniformes, cavalaria de
  couraça, canhões, obus, **tanque**, artilharia autopropulsada, motociclista), **os 8 navios de guerra e o navio
  mercante** com remos, velas ou vapor e esteira, a **caravana** (mula de carga) e o **Mercador**.
- **As 9 criaturas novas da E6** e o **Talos** (Colosso na Era VII).
- **As 17 maravilhas novas da E7**, procedurais no rig de edifício.
- **Efeitos**: bala traçante, granada, obus, clarão de boca, fumaça de pólvora, explosão, vapor e fumaça de chaminé,
  poeira da troca de Era, "+N ouro" na chegada da caravana.
- **VRAM**: cada partida carrega só as Eras em jogo; `art:check` mede por Era e o pior caso de uma partida.
- A **campanha** continua limitada à Helenística (`config.visualEraMax: 2`, da E1): nenhuma cúpula bizantina nas
  missões.

## Decisões já tomadas (não reabrir; cite docs/ERAS.md)

| # | Decisão | Por quê |
|---|---|---|
| D1 | O asset **base** de cada edifício é a aparência de hoje e vale como **Era II (índice 1)**. As outras Eras são **cópias** `<id>_e<n>` geradas do mesmo manifesto pelo campo `eras` (lista de índices). Era base = `source.params.era ?? 1` (Poço de nafta: 3; Poço de petróleo e Refinaria: 6). | §5 "cada edifício descreve a planta uma vez e o kit da Era a veste". A arte de hoje não muda (byte a byte), e o base sempre existe para cair nele. |
| D2 | Escolha do asset: a **maior Era ≤ a pedida** entre {Era base} ∪ {cópias prontas}; se nenhuma, o base. Função pura `buildingEraId` em `src/render/art/logic.ts`. | Uma Era sem cópia (ex.: fazenda na III) herda a anterior; uma cópia ainda carregando não deixa o edifício procedural. |
| D3 | Cada Era de edifícios é um **grupo de atlas próprio** `buildings_e<n>` (n = 0…7), carregado **sob demanda** (na primeira consulta de um id dele) e liberado 20 s de jogo depois de nenhum edifício usá-lo. O grupo `buildings` (base) continua sempre carregado. As 17 maravilhas novas vão no grupo sob demanda `wonders`. | §5 "cada partida só carrega as Eras em jogo". O `merge-group` pede todos os assets do grupo no rascunho: grupos por Era deixam assar uma Era sem reassar as outras. |
| D4 | Era visual de um edifício = `visualEra(dono.age, config.visualEraMax)` (E1). A troca só acontece com o edifício "vivo" para o jogador local (regra da névoa de hoje). O fantasma usa a Era do jogador local. | §5 "a aparência segue a Era do dono"; a névoa não pode vazar o avanço do inimigo. |
| D5 | O kit de Era mora em `scripts/bake/page/rigs/buildings-era.js` (novo): **troca de materiais por Era** (`ERA_REMAP`), **forma do telhado/coluna por Era** (`ERA_KITS`, lida por `k.gable`, `k.column` e pelos builders) e **acessórios** (cúpula, chaminé). A Era **não** entra na semente do edifício: a planta e o dano são os mesmos em todas as Eras. | Uma planta, oito roupas (§5). Semente igual = cópias comparáveis e a base idêntica à de hoje. |
| D6 | Eras com **evolução de função** (planta própria): muralha/portão/torre `[0, 3, 4, 7]`; fortaleza `[3, 4, 6, 7]`; fazenda `[0, 4, 6]`. Os outros edifícios ganham cópias em todas as Eras ≥ `def.age` (D10). | §5 lista as cinco muralhas, as três torres e os quatro fortes; nas Eras sem mudança de função a anterior vale (D2). |
| D7 | Centro Cívico: as variantes `a0/a1/a2` (`variantBy: 'ageTier'`) saem do manifesto; o base é o `a1` de hoje, `town_center_e0` é o `a0` e `town_center_e2` o `a2`, **byte a byte** (parâmetro `seedVariant` mantém a semente antiga; `eraOwn = [0, 1, 2]` no builder desliga o remapeamento nessas Eras). | Um critério só (a Era) para todos os edifícios; nada de rebake visível do CC. |
| D8 | Casa e templo continuam `.glb` do Meshy na Era base; as cópias são **procedurais** (`eraParams: { "*": { "style": "house", "glb": null } }`, `eraNoVariants: true`). | O `.glb` não se veste por Era; o builder procedural `house`/`temple` já existe. |
| D9 | **Sem cópias**: as 20 maravilhas, `titan_gate`, `cornucopia` e `rubble`. | Maravilha e portal têm aparência própria; os escombros são de pedra genérica. |
| D10 | Cópias só para Eras **≥ `def.age`** do edifício (o base existe sempre). | Não assar o que nunca aparece. |
| D11 | Unidades novas: campo `era` no manifesto (= `UNITS[id].age`) → grupo de atlas `units_e<era>`; carregamento **por tipo** como hoje (`ensureAsset`). As 35 de hoje ficam no grupo `units` sem mudança. | O cache do contêiner não tem as unidades antigas: grupos por Era deixam fundir uma Era sem reassar as 35. |
| D12 | Cidadão, barco de pesca e transporte têm **variantes de unidade por Era** (`unitVariants.by: 'era'`): cidadão `[0, 1, 3, 4, 6, 7]`, pesca e transporte `[0, 4, 6]`, navio mercante `[2, 4, 6]`. A Era da unidade sai de `unitArtEra` (`src/render/art/era.ts`, novo): Era visual do dono, limitada pelo próximo estudo `evo_<linha>_<n>` não feito nas linhas que não trocam de tipo. | §10 "aparência do cidadão por Era"; §4 os barcos evoluem "a vapor" sem trocar de tipo (E3/E4). |
| D13 | Cidadão por Era (rig humano, `eraLook: 'citizen'` + `era`): 0 = o de hoje (túnica, cabelo); 1 = pílos de feltro e ferramenta de ferro; 3 = túnica longa de time, gorro frígio e calça; 4 = gibão acolchoado, chapéu de aba, calção e meia, faixa de time; 6 = jaqueta de trabalho de time, boné e calça; 7 = macacão de time e boné. | Silhueta legível por Era sem trocar o rig. |
| D14 | O rig humano ganha **valores novos** no `KIT` (elmos, armaduras, escudos, armas de fogo, pernas, costas) e **poses novas** em `art/poses/human.json` (tabelas em "Dados prontos"). Nada muda nos valores de hoje. | As 35 unidades antigas continuam idênticas se forem reassadas. |
| D15 | Cerco: estilos novos no rig `siege` (`trebuchet`, `bombard`, `field_gun`, `howitzer`, `ram`, `siphon`) com o pivô `barrel` e o escalar `recoil`. | Mesma máquina de hoje (rodas, servos). |
| D16 | Rig novo **`vehicle`** (`scripts/bake/page/rigs/vehicle.js`): `tank`, `spg` e `motorcycle` (cavaleiro humano aninhado `rider`, como o cavalo). Esteiras e rodas giram pela passada medida (`wheels`). | §10 "tanque" é rig novo; o motociclista reaproveita o cavaleiro. |
| D17 | Rig novo **`ship`** (`scripts/bake/page/rigs/ship.js`): linha d'água em y = 0, nada abaixo dela; remos animados, velas, rodas de pás/chaminé; `page: 'own'` e `mirror: true`; anda por deslizamento (`glide`). A esteira é efeito (Bloco P), não sprite. | §8; navios são grandes e poucos: página própria liberada quando somem. |
| D18 | Caravana = **mula de carga** no rig `horse` (`build: 'light'`, `coat: 'grey'`, `pack: 'mule'`, `rider: false`). Mercador = humano (pétaso de feltro, túnica de time, capa longa, bolsa). | Reuso de rig; leitura imediata. |
| D19 | Criaturas: ids da E6 (`satyr`, `empusa`, `lampad`, `harpy`, `hippocampus`, `triptolemus_dragon`, `phoenix`, `griffin`, `erinys`); rig novo `bird` (`scripts/bake/page/rigs/bird.js`) para a Fênix; Grifo no `beast` com `face: 'eagle'` e asas; Talos = variante do Colosso por Era (`[0, 6]`) se `UNITS.talos` não existir. Se a E6 usou outros ids, **os da E6 valem** (`grep -n "satyr\|harpy\|phoenix" src/core/data/units.ts`). | §6. |
| D20 | Maravilhas: **procedurais** em `scripts/bake/page/rigs/buildings-wonders.js` (novo), 4×4, altura ≤ 3 tiles, `size.tiles` ~[6.2, 7.6], com `onDamage`. O Meshy só entra depois, se ganhar na prévia (como na Etapa 9). | §10 "17 maravilhas (procedural; o Meshy onde ganhar)". |
| D21 | Efeitos: projéteis novos `bullet` (traçante), `shell` e `grenade`, escolhidos pela tag `gunpowder` (E3); clarão de boca e fumaça de pólvora no disparo; explosão no impacto de `shell`/`grenade`; chaminés como fumaça de trabalho (`WORK_SMOKE`) nas Eras ≥ VII; fumaça de motor pela tag `mechanical`; esteira de navio. | §10 "efeitos de tiro, fumaça de pólvora, vapor e chaminés". |
| D22 | Troca de Era do dono: poeira em cada edifício que troca (`FxSystem.eraChange`), sem som novo. | §5 "trocam com poeira". |
| D23 | Pré-carga: unidades = `lineUnitOf` das linhas do jogador local + as presentes + as sem linha da Era (`warmUnitTypes`); edifícios = grupos das Eras visuais de todos os jogadores + a próxima Era do jogador local. | Gancho da E3 ("pré-carregar só o degrau atual"); a troca de Era não pisca. |
| D24 | Orçamento: PNG total ≤ **500 MB**; VRAM **por Era** (grupos `buildings_e<n>` + `units_e<n>`) ≤ **40 MB a 1×**; **pior caso de uma partida** ≤ **260 MB a 1×** (×4 a 2×). Medido pelo `art:check` e registrado em `docs/ART.md` §6. | §5 "o `art:check` mede por Era". |
| D25 | Ordem: **lote 1 = Eras I–IV** (edifícios, unidades, navios, maravilhas de I–IV) e **lote 2 = Eras V–VIII**; efeitos entre os dois lotes de unidades. | §11 "E8 em lotes (I–IV, depois V–VIII)". |
| D26 | Bake sempre num **rascunho** (`--out scratch/e8/<lote>`) e fusão com `merge-group --groups <lista explícita>`. Os PNG em `public/art` só entram em commit no **fim de cada bloco de arte**, depois das capturas olhadas. | O cache do contêiner é parcial; reassar sem `--out` apagaria os atlas que faltam no cache. PNG intermediário incha o git. |
| D27 | Capturas: `scripts/artages.mjs` passa a cobrir as **8 Eras** + a campanha (teto 2) + as 20 maravilhas; script novo `scripts/artlines.mjs` (linhas por Era: roda, combate, naval, desfile). | Prova visual de cada Era antes do commit. |
| D28 | Ícones: os HUD de unidade/edifício novos saem dos modelos do jogo no `art:hud` (como na Etapa 7); um ícone **por degrau** nos estudos de evolução; Idades V–VIII com ícones próprios (canhão, tricórnio, engrenagem, vulcão já existe). Os ícones de edifício **não** mudam por Era. | Gancho da E3 ("ícone por degrau"); o HUD lê melhor com um ícone estável. |
| D29 | **Nada muda no núcleo** (`src/core`): `SIM_VERSION` não sobe; o hash do `smoke 20 42` fica igual antes e depois. | A E8 é só renderização. |
| D30 | Áudio: `deathRecipe` (`src/audio/events.ts`) — tags `mechanical` e navios usam `'treeFall'` (sem relincho). O som próprio de pólvora/motor é da trilha de áudio, fora desta etapa. | Gancho da E3/E4. |

## Arquivos que mudam

| Caminho | O que muda |
|---|---|
| `scripts/bake/manifest.mjs` | `ERA_GROUPS`, `atlasGroupOf`; validação de `eras`, `eraParams`, `eraNoVariants`, `atlasGroup`, `era` (unidade), `unitVariants.by: 'era'`; `expandEraVariants`, `expandAll`; `loadAssets` passa por elas; `atlasOf`/`matchesOnly` aceitam o grupo; `RIGS` + `vehicle`, `ship`, `bird`; `UNIT_VARIANT_BY` + `'era'` |
| `scripts/bake/manifest.d.mts` | tipos dos campos novos |
| `scripts/bake/bake.mjs` | empacota `ATLAS_GROUPS` + `ERA_GROUPS` + `wonders`; `--only` aceita grupo de Era; índice com `eraOf`, `eraValue`, `era`, `baseEra` |
| `scripts/bake/check.ts` | tipo do grupo por prefixo; `vramByEra`, `vramWorstMatch`; `BUDGET.maxPngMB = 500`, `maxEraVramMB = 40`; o teto de VRAM passa a valer para o pior caso |
| `scripts/bake/merge-group.mjs` | nada (só uso) |
| `scripts/bake/cache-diff.mjs` (novo) | compara dois caches quadro a quadro (prova byte a byte) |
| `scripts/bake/page/materials.js` | materiais novos no **fim** de `PALETTE` e de `createMaterials` |
| `scripts/bake/page/bake.js` | `steel` e `castIron` na lista do reflexo de ambiente; `renderer.localClippingEnabled = true` (navios) |
| `scripts/bake/page/buildings.js` | `buildBuilding` com a Era (vista de materiais, `ERA_KITS`, `eraDress`); `k.M0`; `k.gable`/`k.column`/`k.shed` lêem o kit; `applyDamage` usa `k.M0`; `WALL_MATS`/`ROOF_MATS` ampliados; Centro Cívico com `seedVariant`; muralha/portão/torre por Era |
| `scripts/bake/page/rigs/buildings-era.js` (novo) | `ERA_REMAP`, `ERA_KITS`, `eraView`, `eraDress` (cúpula, chaminé) |
| `scripts/bake/page/rigs/buildings-economy.js` | fazenda por Era (`[0, 4, 6]`), Pedreira, Poço de nafta, Poço de petróleo, Refinaria, (Universidade, Fábrica) |
| `scripts/bake/page/buildings-military.js` | fortaleza por Era (`[3, 4, 6, 7]`), Estaleiro |
| `scripts/bake/page/rigs/buildings-wonders.js` (novo) | as 17 maravilhas |
| `scripts/bake/page/buildings-textures.js` | geradores `brick`, `thatch`, `slate`, `concrete`; `TEXTURED` com os materiais novos |
| `scripts/bake/page/rigs/human.js` | `KIT` ampliado, peças novas, `ERA_LOOKS.citizen` |
| `scripts/bake/page/rigs/horse.js` | `KIT` + `barding`, `pack`, `tail`, `swim`, coat `sea`; `rider: false` |
| `scripts/bake/page/rigs/siege.js` | estilos novos, pivô `barrel`, escalar `recoil` |
| `scripts/bake/page/rigs/beast.js` | `face: 'eagle'` (grifo) e `face: 'dragon'` (dragão de Triptólemo), asas de `wings.js`, carro de trigo |
| `scripts/bake/page/rigs/biped.js` | acabamentos `satyr`, `empusa`, `erinys`, `lampad`, `talos` |
| `scripts/bake/page/rigs/vehicle.js` (novo) | tanque, autopropulsada, motocicleta |
| `scripts/bake/page/rigs/ship.js` (novo) | 11 cascos (pesca, transporte, mercante, 8 de guerra) |
| `scripts/bake/page/rigs/bird.js` (novo) | Fênix (a harpia é `biped` com asas) |
| `scripts/bake/page/rigs/units.js` | registro de `vehicle`, `ship`, `bird` (poses, kits, `NESTED_HUMAN.vehicle = 'rider'`, `RIG_FILES`) |
| `scripts/bake/page/props.js` | nós da E2 (`limestone`, `naphtha`, `oil_field`, `olive_grove`, `vineyard`, `paros_marble`, `salt`, `wild_horses`, `copper`, `incense`) |
| `scripts/bake/gait.mjs` | poses de voo do grifo e do dragão (gera `art/poses/beast.json`; nunca editar o JSON à mão) |
| `scripts/bake/measure.mjs` | mede `muzzles` (boca da arma por direção), como os `tops` |
| `scripts/bake/fx/catalog.mjs` | projéteis `bullet`, `shell`, `grenade`; família `flash` |
| `scripts/bake/hud/catalog.mjs`, `scripts/bake/page/hud-objects.js` | ícones das unidades/edifícios/maravilhas novos, por degrau, Idades V–VIII |
| `art/manifest/*.json` | ~20 edifícios com `eras`; ~54 unidades novas; 9–10 criaturas; 17 maravilhas; `props-nodes.json` |
| `art/poses/human.json`, `art/poses/siege.json`, `art/poses/biped.json` | poses novas (acrescentar; nada de mudar as de hoje) |
| `art/poses/vehicle.json`, `art/poses/ship.json`, `art/poses/bird.json` (novos) | poses dos rigs novos |
| `public/art/*` | atlas gerados (só no fim de cada bloco de arte) |
| `src/render/art/types.ts` | `ArtGroup` com `buildings_e<n>`, `units_e<n>`, `wonders`; `UnitArt.muzzles?` |
| `src/render/art/logic.ts` | `buildingEraId`, `unitArtId(..., era)`, `UNIT_ERA_VALUES`; `nodeFrameName`/`nodeStage` dos nós novos; `projectileKind` não (fica em fx/logic) |
| `src/render/art/era.ts` (novo) | `unitArtEra`, `buildingArtEra`, `erasInPlay` |
| `src/render/art/AtlasSource.ts` | `LoadKind` + `'era'`; `unloadGroup(group)` |
| `src/render/art/ArtLibrary.ts` | grupos sob demanda; `eraGen`; `buildingEras(type)`; `releaseEras`; `unitId(type, heads, era)` |
| `src/render/art/alias.ts` | as tabelas de **arte** ficam vazias no fim; os aliases de **procedural** continuam (`UNIT_PROCEDURAL_ALIAS`, `BUILDING_PROCEDURAL_ALIAS`) |
| `src/render/views/BuildingView.ts` | `artId` mutável, `era`, `setArt(id, era)` |
| `src/render/renderer.ts` | Era dos edifícios e unidades; fantasma; `RecentGone.artId`; poeira de troca; pré-carga por Era; liberação dos grupos |
| `src/render/fx/types.ts` | `FxHost.goneArt?` |
| `src/render/fx/handlers/collapse.ts` | desabamento com o asset da Era |
| `src/render/fx/logic.ts`, `src/render/fx/handlers/projectile.ts`, `src/render/fx/FxTextures.ts` | `projectileKind`, `arcHeight`, clarão, explosão |
| `src/render/fx/recipes.ts`, `src/render/fx/unitFx.ts`, `src/render/fx/rules.ts`, `src/render/fx/FxSystem.ts`, `src/render/particles.ts` | fumaça de pólvora, motor, chaminés (`WORK_SMOKE` com `minEra`), esteira, `eraChange` |
| `src/render/textures.ts` | `drawShip` e aliases procedurais continuam como reserva (sem mudança de comportamento) |
| `src/ui/icons.ts` | ícone por degrau; Idades V–VIII; sai o `SHIP_ICONS` |
| `src/audio/events.ts` | `deathRecipe` de `mechanical`/navio |
| `src/main.ts` | `debugSpawn` aceita `layer` (navio na água) e `era` de teste; `debugSetAge(player, age)` |
| `scripts/artages.mjs` | 8 Eras + campanha + 20 maravilhas |
| `scripts/artlines.mjs` (novo) | desfile das linhas por Era |
| `scripts/artparade.mjs`, `scripts/artmyth.mjs`, `scripts/artfx.mjs`, `scripts/renderperf.mjs` | listas de tipos lidas dos dados (inclui os novos); cenas novas (`tiro`, `naval`, `troca`) |
| `tests/art-manifest.test.ts`, `tests/art-library.test.ts`, `tests/art-etapa6.test.ts`, `tests/fx-atlas.test.ts`, `tests/fx-logic.test.ts`, `tests/hud-icons.test.ts` | contagens e regras novas |
| `tests/art-eras.test.ts` (novo) | expansão, escolha por Era, unidade por Era, orçamento |
| `docs/ART.md` | Apêndice J (E8), §6 orçamento |
| `docs/eras/PROGRESSO.md`, `docs/ROADMAP.md`, `CLAUDE.md` | estado |

## Dados prontos

### 1. As 8 roupas (kit de Era; nomes e arquitetura de `docs/ERAS.md` §1)

| Era (índice) | Nome | Paredes | Telhado (`ERA_KITS.roof` / `pitch` / `tileRows`) | Coluna (`column`) | Acessório | Em uma frase |
|---|---|---|---|---|---|---|
| I (0) | Arcaica | adobe e pau a pique (`mudbrick`), base de pedra crua | sapé (`thatch`), 1,35 × a inclinação, sem fileiras | poste de madeira (`post`) | — | casas de barro com telhado de palha e esteios |
| II (1) | Clássica | a de hoje | telha (`tile`), 1, 7 fileiras | dórica (`doric`) | — | **a arte de hoje, sem mudança** |
| III (2) | Helenística | mármore (`marble`) | telha, 1 | coríntia (`corinthian`) | — | mármore e capitéis de folhas |
| IV (3) | Bizantina | tijolo com faixas de pedra (`brick`, `brickLight`) | telha, 0,75 | bizantina (`byzantine`, capitel cesto) | cúpula de chumbo (`eraDome`) | tijolo e cúpula |
| V (4) | Pólvora | reboco (`render`) com cunhais de calcário | telha, 0,9 | toscana (`tuscan`) | — | reboco ocre e cantos de pedra |
| VI (5) | Iluminismo | estuque claro (`stucco`) | telha, 0,6 | coríntia | frontão de estuque | branco, frontões baixos |
| VII (6) | Industrial | tijolo vermelho (`brick`) | ardósia (`slate`), 1,1 | ferro fundido (`iron`) | chaminé (`eraChimney`) | tijolo, ardósia, ferro e chaminé |
| VIII (7) | Moderna | concreto (`concrete`) | laje plana (`flat`) com platibanda | pilar quadrado (`pillar`) | vidro (`glass`) nas janelas largas | concreto, aço e vidro |

### 2. Materiais novos (`scripts/bake/page/materials.js`, no FIM de `PALETTE` e de `createMaterials`)

| Nome | Cor | Rugosidade | Metal | Textura (`TEXTURED`) |
|---|---|---|---|---|
| `thatch` | `0xb39a5e` | 0.95 | 0 | `thatch` |
| `thatchDark` | `0x8c7440` | 0.95 | 0 | `thatch` |
| `mudbrick` | `0xb48c64` | 0.95 | 0 | `plaster` |
| `mudbrickDark` | `0x93714f` | 0.95 | 0 | `plaster` |
| `brick` | `0x9c4f36` | 0.9 | 0 | `brick` |
| `brickDark` | `0x733a28` | 0.92 | 0 | `brick` |
| `brickLight` | `0xb8705a` | 0.9 | 0 | `brick` |
| `leadDome` | `0x777c80` | 0.55 | 0.35 | — |
| `render` | `0xd6b88a` | 0.9 | 0 | `plaster` |
| `renderDark` | `0xb79870` | 0.92 | 0 | `plaster` |
| `stucco` | `0xe8e2d2` | 0.85 | 0 | `plaster` |
| `stuccoDark` | `0xcdc6b4` | 0.88 | 0 | `plaster` |
| `slate` | `0x4e555b` | 0.75 | 0 | `slate` |
| `slateDark` | `0x383d42` | 0.8 | 0 | `slate` |
| `castIron` | `0x36393c` | 0.5 | 0.7 | — (reflexo de ambiente) |
| `steel` | `0x8a9096` | 0.35 | 0.85 | — (reflexo de ambiente) |
| `concrete` | `0xaaa89f` | 0.95 | 0 | `concrete` |
| `concreteDark` | `0x86847b` | 0.97 | 0 | `concrete` |
| `glass` | `0x405a66` | 0.15 | 0.3 | — |
| `sandbag` | `0xab9c74` | 1 | 0 | — |
| `khaki` | `0x8a7f55` | 0.95 | 0 | — (unidades) |
| `navy` | `0x2a3346` | 0.9 | 0 | — (unidades) |
| `pitch` | `0x2a221a` | 0.7 | 0 | — (cascos calafetados) |
| `sail` | `0xe2d6b8` | 0.95 | 0 | — (`side: DoubleSide`) |
| `rubber` | `0x232323` | 0.9 | 0 | — (pneus, esteiras) |
| `paintGreen` | `0x4d5a3a` | 0.7 | 0.2 | — (tanque, autopropulsada) |

Código para o fim de `createMaterials` (depois do último `Object.assign` que existe hoje):

```js
  // E8 (arte por Era, docs/eras/E8-arte-por-era.md): também no FIM — a ordem de criação decide o id do material e os
  // antigos não podem mudar de ordem (edifícios e unidades de hoje saem idênticos)
  Object.assign(M, {
    thatch: std(PALETTE.thatch, 0.95), thatchDark: std(PALETTE.thatchDark, 0.95),
    mudbrick: std(PALETTE.mudbrick, 0.95), mudbrickDark: std(PALETTE.mudbrickDark, 0.95),
    brick: std(PALETTE.brick, 0.9), brickDark: std(PALETTE.brickDark, 0.92), brickLight: std(PALETTE.brickLight, 0.9),
    leadDome: std(PALETTE.leadDome, 0.55, 0.35), render: std(PALETTE.render, 0.9), renderDark: std(PALETTE.renderDark, 0.92),
    stucco: std(PALETTE.stucco, 0.85), stuccoDark: std(PALETTE.stuccoDark, 0.88), slate: std(PALETTE.slate, 0.75), slateDark: std(PALETTE.slateDark, 0.8),
    castIron: std(PALETTE.castIron, 0.5, 0.7), steel: std(PALETTE.steel, 0.35, 0.85),
    concrete: std(PALETTE.concrete, 0.95), concreteDark: std(PALETTE.concreteDark, 0.97), glass: std(PALETTE.glass, 0.15, 0.3),
    sandbag: std(PALETTE.sandbag, 1), khaki: std(PALETTE.khaki, 0.95), navy: std(PALETTE.navy, 0.9), pitch: std(PALETTE.pitch, 0.7),
    sail: std(PALETTE.sail, 0.95, 0, { side: THREE.DoubleSide }), rubber: std(PALETTE.rubber, 0.9), paintGreen: std(PALETTE.paintGreen, 0.7, 0.2),
  });
```

### 3. `scripts/bake/page/rigs/buildings-era.js` (novo) — pronto para colar

```js
// Kit de Era dos edifícios (E8, docs/eras/E8-arte-por-era.md): o builder descreve a planta uma vez; a Era troca os
// materiais (ERA_REMAP), a forma do telhado e da coluna (ERA_KITS, lidos por k.gable/k.column/k.shed) e acrescenta
// acessórios (eraDress: cúpula, chaminé). Era 1 (Clássica) = identidade: a arte de hoje sai byte a byte.
export const ERA_REMAP = [
  /* 0 */ { limestone: 'mudbrick', limestoneDark: 'mudbrickDark', plaster: 'mudbrick', plasterDark: 'mudbrickDark', marble: 'limestone', marbleDark: 'limestoneDark',
           ashlar: 'stoneWarm', ashlar2: 'stoneLight', ashlarDark: 'stoneDark', terracotta: 'thatch', terracottaDark: 'thatchDark', gold: 'bronze' },
  /* 1 */ {},
  /* 2 */ { limestone: 'marble', limestoneDark: 'marbleDark' },
  /* 3 */ { limestone: 'brick', limestoneDark: 'brickDark', stoneWarm: 'brickLight' },
  /* 4 */ { limestone: 'render', limestoneDark: 'renderDark', plaster: 'render', plasterDark: 'renderDark', marble: 'limestone', marbleDark: 'limestoneDark', bronze: 'iron' },
  /* 5 */ { limestone: 'stucco', limestoneDark: 'stuccoDark', plaster: 'stucco', plasterDark: 'stuccoDark', bronze: 'iron' },
  /* 6 */ { limestone: 'brick', limestoneDark: 'brickDark', plaster: 'brickLight', plasterDark: 'brick', marble: 'limestone', marbleDark: 'limestoneDark',
           ashlar: 'brick', ashlar2: 'brickLight', ashlarDark: 'brickDark', terracotta: 'slate', terracottaDark: 'slateDark', bronze: 'castIron', iron: 'castIron' },
  /* 7 */ { limestone: 'concrete', limestoneDark: 'concreteDark', plaster: 'concrete', plasterDark: 'concreteDark', marble: 'concrete', marbleDark: 'concreteDark',
           ashlar: 'concrete', ashlar2: 'concrete', ashlarDark: 'concreteDark', stoneWarm: 'concreteDark', stoneLight: 'concrete',
           terracotta: 'concreteDark', terracottaDark: 'concreteDark', bronze: 'steel', iron: 'steel', gold: 'steel' },
];
export const ERA_KITS = [
  { era: 0, roof: 'thatch', pitch: 1.35, tileRows: 0, column: 'post' },
  { era: 1, roof: 'tile', pitch: 1, tileRows: 7, column: 'doric' },
  { era: 2, roof: 'tile', pitch: 1, tileRows: 7, column: 'corinthian' },
  { era: 3, roof: 'tile', pitch: 0.75, tileRows: 6, column: 'byzantine', dome: true },
  { era: 4, roof: 'tile', pitch: 0.9, tileRows: 7, column: 'tuscan' },
  { era: 5, roof: 'tile', pitch: 0.6, tileRows: 6, column: 'corinthian' },
  { era: 6, roof: 'slate', pitch: 1.1, tileRows: 0, column: 'iron', chimney: true },
  { era: 7, roof: 'flat', pitch: 0, tileRows: 0, column: 'pillar' },
];
/** Vista dos materiais na Era: o próprio M quando não há troca (Era 1 ou Era própria do builder). */
export function eraView(M, era, own = false) {
  const remap = own ? null : ERA_REMAP[era];
  if (!remap || !Object.keys(remap).length) return M;
  const V = Object.create(M);
  for (const [from, to] of Object.entries(remap)) { if (!M[to]) throw new Error(`ERA_REMAP[${era}]: material ${to} não existe`); V[from] = M[to]; }
  return V;
}
export function eraKit(era) { return ERA_KITS[era] ?? ERA_KITS[1]; }
```

`eraDress(k, B, p)` (no mesmo arquivo; chamado por `buildBuilding` depois do builder e antes do dano, só com
`stage === 3` — pronto, danificado ou portão aberto — e se `B.eraDome`/`B.eraChimney` estiverem ligados no builder):

- **cúpula** (Era 3, `B.eraDome === true`): ache a maior caixa de telhado (`k.roofs`, lista que `k.gable`/`k.shed`
  passam a preencher com `{ cx, cz, w, len, y, rise }`); ponha um tambor `k.cyl(r, r, 0.35, M.brick, cx, y + rise * 0.5, cz, 16)`
  com `r = min(w, len) × 0.28` e uma semiesfera `SphereGeometry(r × 1.04, 16, 8, 0, 2π, 0, π/2)` de `M.leadDome` em cima,
  mais uma cruz pequena de `M.bronze` (0,06 × 0,3). Edifícios com cúpula: `town_center`, `temple` (procedural), `academy`,
  `market` e `university`.
- **chaminé** (Era 6, `B.eraChimney === true`): caixa de `M.brick` 0,22 × 0,9 × 0,22 a 70 % do comprimento da maior
  caixa de telhado, saindo 0,6 acima da cumeeira, com o anel de `M.castIron` no topo; grava `k.chimneys.push([x, y, z])`
  (só documentação: a fumaça é do renderizador, Bloco P). Edifícios: `house`, `barracks`, `siege_workshop`,
  `lumber_camp`, `mine`, `quarry`, `shipyard`, `factory`.

### 4. Eras por edifício (o campo `eras` de cada manifesto)

Confira as `age` antes (`npx tsx -e "import {BUILDINGS} from './src/core/data'; for (const b of Object.values(BUILDINGS)) console.log(b.id, b.age, b.w+'x'+b.h)"`):
a regra é **todas as Eras n de 0 a 7 com n ≠ Era base e n ≥ `def.age`**, menos as listas fixas de função e os sem cópia.
A tabela é o resultado esperado com as `age` depois da E1–E7.

| id | Era base | `eras` (cópias) | extras | o que muda além do kit |
|---|---|---|---|---|
| `town_center` | 1 | `[0, 2, 3, 4, 5, 6, 7]` | builder com `eraOwn = [0, 1, 2]`, `eraParams: { "0": { "seedVariant": "a0" }, "2": { "seedVariant": "a2" } }`, base `seedVariant: "a1"`, `B.eraDome` | e0/e2 = a0/a2 de hoje; e3+ partem do tier 2 |
| `house` | 1 (`.glb`) | `[0, 2, 3, 4, 5, 6, 7]` | `eraParams: { "*": { "style": "house", "glb": null } }`, `eraNoVariants: true`, `B.eraChimney` | e0 cabana redonda de adobe com sapé (planta própria: `p.era === 0`) |
| `farm` | 1 | `[0, 4, 6]` | variantes `farmCrop` continuam nas cópias | 0 cerca de vime e cabana de sapé; 4 muro baixo de pedra seca + moinho de vento de 4 pás; 6 cerca de arame (postes de `castIron` + fio) + cata-vento de chapa |
| `granary` | 1 | `[0, 2, 3, 4, 5, 6, 7]` | — | 6 silo cilíndrico de chapa ao lado; 7 dois silos de concreto |
| `lumber_camp` | 1 | `[0, 2, 3, 4, 5, 6, 7]` | `B.eraChimney` | 6 serra a vapor (caldeira `castIron`); 7 galpão de chapa |
| `mine` | 1 | `[0, 2, 3, 4, 5, 6, 7]` | `B.eraChimney` | 6 e 7 castelete de ferro (torre de treliça 1,4 de altura com roda) |
| `quarry` | 1 | `[0, 2, 3, 4, 5, 6, 7]` | `B.eraChimney` | 6 guindaste de ferro; 7 britador de concreto |
| `market` | 1 | `[2, 3, 4, 5, 6, 7]` | `B.eraDome` | 6 galeria de ferro e vidro (telhado `glass` em arco) |
| `temple` | 1 (`.glb`) | `[0, 2, 3, 4, 5, 6, 7]` | `eraParams: { "*": { "style": "temple", "glb": null } }`, `eraNoVariants: true`, `B.eraDome` | 3 vira basílica com cúpula (o kit já faz) |
| `barracks` | 1 | `[0, 2, 3, 4, 5, 6, 7]` | `B.eraChimney` | 7 alojamento de concreto com sacos de areia (`sandbag`) |
| `stable` | 1 | `[2, 3, 4, 5, 6, 7]` | — | 7 garagem: portão largo de chapa |
| `siege_workshop` | 1 | `[2, 3, 4, 5, 6, 7]` | `B.eraChimney` | 4 fundição de canhões (forno de tijolo); 7 oficina de concreto |
| `academy` (Biblioteca) | 1 | `[0, 2, 3, 4, 5, 6, 7]` | `B.eraDome` | 6 observatório: cúpula de ferro pequena |
| `tower` | 1 | `[0, 3, 4, 7]` | variantes `wallMask` | 0 torre de madeira sobre estacas; 3 torre de tijolo com faixas; 4 torre de canhão baixa e larga, canhoneira; 7 casamata de concreto (cubo baixo com seteira) |
| `wall` | 1 | `[0, 3, 4, 7]` | variantes `wallMask` (16 + `05f`/`10f`) | 0 paliçada de troncos apontados; 3 teodosiana (tijolo e pedra em faixas, ameias); 4 baluarte (talude de terra revestido de reboco, sem ameias); 7 concreto com arame no topo |
| `gate` | 1 | `[0, 3, 4, 7]` | variantes `gateAxis` + `open` | portão no estilo da muralha da mesma Era |
| `fortress` | 1 | `[3, 4, 6, 7]` | — | 3 castelo (torres redondas de tijolo); 4 forte estrelado (4 pontas de baluarte); 6 forte de tijolo com casamatas; 7 forte de concreto com cúpulas de aço baixas |
| `shipyard` | 1 | `[0, 2, 3, 4, 5, 6, 7]` | `B.eraChimney` | 0 rampa de troncos; 4 carreira coberta; 6 doca seca com guindaste; 7 doca de concreto |
| `naphtha_well` | 3 | `[4, 6]` | `params.era: 3` | 3 poço com sarilho de madeira e jarras; 4 bomba de alavanca; 6 torre de sondagem de madeira |
| `oil_well` | 6 | `[7]` | `params.era: 6` | 6 torre de treliça de madeira; 7 cavalo de pau (bomba de balancim de aço) |
| `refinery` | 6 | `[7]` | `params.era: 6` | tanques cilíndricos e alambiques; 7 colunas de aço mais altas |
| `university` (se existir) | 3 | `[4, 5, 6, 7]` | `params.era: 3`, `B.eraDome` | — |
| `factory` (se existir) | 6 | `[7]` | `params.era: 6`, `B.eraChimney` | galpão de tijolo com telhado em dente de serra e 2 chaminés |
| `wonder_*`, `titan_gate`, `cornucopia`, `rubble` | — | — (D9) | — | — |

Total de cópias esperado: 10 × 7 (CC, casa, celeiro, serraria, mina, pedreira, templo, quartel, Biblioteca, estaleiro)
+ 3 × 6 (mercado, estábulo, oficina) + 3 (fazenda) + 3 × 4 (muralha, portão, torre) + 4 (fortaleza) + 2 + 1 + 1 (poços,
Refinaria) = **111** cópias (116 com Universidade e Fábrica), cada uma com os 6 estados (e as variantes da muralha).

### 5. Cidadão por Era (`art/manifest/villager.json`)

```json
"unitVariants": { "by": "era", "param": "era", "values": [0, 1, 3, 4, 6, 7] },
"variantContactDirs": [1, 2],
```

e em `source.params`: `"eraLook": "citizen"`. `ERA_LOOKS.citizen` em `human.js` aplica, **por cima** dos `params` do
manifesto, só quando `era > 0`:

| `era` | elmo/chapéu | roupa | pernas | ferramenta | time |
|---|---|---|---|---|---|
| 0 | (o de hoje) | túnica de hoje | — | machado de hoje | `tunicTeam: 'upper'` |
| 1 | `helmet: 'pilos', helmetMat: 'felt'` | `armor: 'tunic'` | `legs: 'bare'` | `toolMetal: 'iron'` | `tunicTeam: 'upper'` |
| 3 | `helmet: 'phrygian', helmetMat: 'felt'` | `armor: 'robe'` | `legs: 'trousers'` | `toolMetal: 'iron'` | `armor` de time (`tunicTeam: 'full'`) |
| 4 | `helmet: 'brimhat'` | `armor: 'quilted'` | `legs: 'breeches'` | `toolMetal: 'iron'` | `sash: 'team'` |
| 6 | `helmet: 'flatcap'` | `armor: 'workcoat'` | `legs: 'trousers'` | `toolMetal: 'steel'` | jaqueta de time |
| 7 | `helmet: 'flatcap'` | `armor: 'overalls'` | `legs: 'trousers'` | `toolMetal: 'steel'` | macacão de time |

Ids gerados: `villager` (0), `villager_era1`, `villager_era3`, `villager_era4`, `villager_era6`, `villager_era7` (o
nome segue `unitVariantId`: `<id>_<by><valor>`). A cópia de cada valor vai para o grupo `units_e<valor>`; o base
continua no grupo `units` (não muda).

### 6. Kit humano novo (`KIT` de `scripts/bake/page/rigs/human.js`, valores ACRESCENTADOS no fim de cada lista)

| Chave | Valores novos | Geometria (m; o rig está em metros antes do `M2T`) |
|---|---|---|
| `helmet` | `spangen`, `kettle`, `morion`, `sallet`, `tricorne`, `bearskin`, `busby`, `shako`, `farion`, `adrian`, `beret`, `flatcap`, `brimhat`, `leathercap` | `spangen` cone de 4 gomos r 0,13 h 0,2 + nasal; `kettle` calota + aba 0,05 inclinada; `morion` calota com crista alta e aba em barco; `sallet` calota com rabo 0,12 para trás e viseira; `tricorne` aba 0,07 dobrada em 3 (feltro preto `hair`); `bearskin` cilindro r 0,12 h 0,34 de pele preta (`hair`); `busby` cilindro r 0,12 h 0,2 com saco de time; `shako` cilindro r 0,11→0,12 h 0,2, pala, placa `bronze`; `farion` gorro mole vermelho (`crest`) com borla preta caindo; `adrian` calota de aço (`steel`) com crista baixa e aba 0,03; `beret` disco mole de time inclinado; `flatcap` boné com pala; `brimhat` copa baixa + aba 0,09 (`felt`); `leathercap` touca de couro com óculos (`glass`) na testa |
| `helmetMat` | `steel`, `black` | `steel` = `M.steel`; `black` = `M.hair` |
| `armor` | `lamellar`, `mail`, `plate`, `buffcoat`, `coat`, `fustanella`, `tunicmil`, `robe`, `quilted`, `workcoat`, `overalls` | `lamellar` torso com 6 fileiras de placas `bronze`/`iron` e saia de tiras; `mail` torso de cota (`iron`, rugoso) até a coxa; `plate` peitoral e espaldar de `steel`, escarcela; `buffcoat` casaco de couro (`leather`) até o joelho com faixa de time; `coat` casaca de time com abas até o joelho, lapelas `linen`, cinto branco cruzado; `fustanella` saia branca pregueada até o joelho + colete de time; `tunicmil` túnica cáqui (`khaki`) com bolsos e braçadeira de time; `robe` túnica até a canela; `quilted` gibão acolchoado (`linen` com costuras); `workcoat` jaqueta curta de time; `overalls` macacão de time com alças |
| `legs` (chave nova) | `bare` (padrão), `trousers`, `breeches`, `puttees` | `trousers` calça até o tornozelo + bota; `breeches` calção ao joelho + meia `linen` + sapato; `puttees` calça cáqui com polainas enroladas + bota |
| `shield` | `kite`, `thureos`, `rotella`, `heater` | `kite` gota 0,45 × 0,9 (time); `thureos` oval alongado 0,5 × 0,95 com umbo de ferro; `rotella` redondo r 0,25 de `steel`; `heater` triângulo 0,5 × 0,6 com cruz de time |
| `weapon` | `sarissa`, `pike`, `sling`, `lance`, `saber`, `longsword`, `arquebus`, `musket`, `rifle`, `carbine`, `smg`, `mg`, `grenade` | `sarissa` haste 4,2 (2,1 tiles: cabe no quadro [3.6, 4.2]; parada e andando fica erguida a 70°); `pike` 3,6; `sling` corda 0,7 com bolsa; `lance` 3,2 com flâmula de time; `saber` curvo 0,85; `longsword` 1,1; `arquebus` 1,3 com mecha; `musket` 1,5 com baioneta 0,3; `rifle` 1,25; `carbine` 1,0; `smg` 0,8 com carregador lateral; `mg` 1,1 com bipé e cinta; `grenade` esfera r 0,05 preta com pavio na mão + mosquete às costas (`back: 'musket'` automático) |
| `back` (chave nova) | `none` (padrão), `musket`, `rifle`, `pack`, `quiver` | arma pendurada em diagonal; mochila 0,3 × 0,35 × 0,15 (`leather`/`khaki`) |
| `toolMetal` (chave nova) | `bronze` (padrão), `iron`, `steel` | só a lâmina das ferramentas do cidadão |
| `eraLook` (chave nova) | `none` (padrão), `citizen` | tabela 5 |
| `tunicTeam` (parâmetro de hoje) | `full` (se ainda não existir) | a túnica inteira na cor de time (hoje só `upper`); acrescente o ramo em `buildHuman` |

As armas de fogo têm o **ponto de boca** marcado (`items.muzzle`, um `Object3D` vazio na ponta do cano) para o bake
gravar a posição da boca por direção no índice (`muzzles`, igual aos `tops` de hoje); o renderizador usa para o clarão
(Bloco P). Se o `measure.mjs` não medir, use 0,9 × comprimento da arma à frente da mão direita.

### 7. Poses novas (`art/poses/human.json`, acrescentar)

| Pose | Quadros | Descrição |
|---|---|---|
| `idle_gun` / `walk_gun` | 4 / 8 | arma de fogo no ombro (cano para cima, 60°) |
| `aim_gun` | 2 | arma no rosto, cano horizontal, pé esquerdo à frente |
| `attack_gun` | 6 | 0 mira · 1 mira · 2 **disparo** (recuo de 0,04 no ombro) · 3 recuo · 4 baixa · 5 volta à mira |
| `idle_mg` / `walk_mg` | 4 / 8 | metralhadora no ombro |
| `aim_mg` / `attack_mg` | 2 / 6 | ajoelhado atrás do bipé; disparo nos quadros 1, 3 e 5 (rajada) |
| `attack_grenade` | 6 | arma às costas; braço direito atrás (0–2), arremesso por cima (3), segue (4–5); a granada sai no quadro 3 |
| `idle_pike` / `walk_pike` / `attack_pike` | 4 / 8 / 6 | lança longa a duas mãos baixada a 10° (sarissa e pique); estocada de 0,5 |
| `aim_sling` / `attack_sling` | 2 / 6 | funda girando acima da cabeça (0–3), solta (4) |
| `attack_saber` | 6 | golpe de cima para baixo em diagonal |
| `ride_attack_lance` | 6 | lança deitada sob o braço, investida |
| `ride_aim_carbine` / `ride_attack_carbine` | 2 / 6 | carabina no ombro sobre o cavalo |
| `ride_moto` / `ride_moto_attack` | 4 / 6 | sentado na moto, mãos no guidão; ataque = braço direito com a submetralhadora |

Cavalo (`art/poses/horse.json`): nada novo (a mula e o hipocampo usam as de hoje; o hipocampo nada com `trot` e a
cauda de peixe ondula pelo escalar `tailWave`, novo no rig).

Cerco (`art/poses/siege.json`): `idle_<estilo>`, `roll_<estilo>`, `fire_<estilo>`, `die_<estilo>` para os 6 estilos
novos; `fire_bombard/field_gun/howitzer` = 8 quadros com `recoil` 0 → 0,25 (quadro 1) → 0 (quadro 7) e o cano
(`barrel`) a 10° (bombarda), 15° (canhão), 40° (obus); `fire_trebuchet` = 10 quadros (braço de 0° a 110°);
`fire_ram` = 8 quadros (aríete 0 → 0,5 → 0); `fire_siphon` = 6 quadros (bico baixa, jato é efeito).

### 8. As 41 unidades de linha (manifesto por unidade; `era` = `UNITS[id].age`)

Todas: `kind: 'unit'`, `dirs: 8`, `team: true`, `shadow: true`, `stage: 8`, `era: <age>`. Humanas a pé:
`size.tiles [3.2, 3.6]`, `anchor [0.45, 0.58]`, sem `sizeClass` (unit). Montadas: `[4, 4.2]`. Cerco/veículos: indicado.
`anims` padrão por arma: corpo a corpo `idle/walk/attack/die` (+ `run` nas montadas); tiro `idle/walk/aim/attack/die`.

| id | Era | rig | parâmetros do kit | poses (idle · walk · aim · attack) | projétil |
|---|---|---|---|---|---|
| `prodromos` | 2 | horse | coat `bay`, build `light`, cloth true; rider `helmet: 'pilos', armor: 'tunic', cape: 'short', weapon: 'javelin'` | ride_idle · ride_trot · — · ride_attack_spear (+ run ride_gallop) | — (corpo a corpo) |
| `trapezites` | 3 | horse | coat `chestnut`, light; rider `helmet: 'spangen', armor: 'lamellar', weapon: 'javelin', sash: 'team'` | idem | — |
| `stradiot` | 4 | horse | coat `grey`, light; rider `helmet: 'kettle', armor: 'mail', weapon: 'lance', cape: 'short'` | … ride_attack_lance | — |
| `hussar` | 5 | horse | coat `bay`, medium; rider `helmet: 'busby', armor: 'coat', weapon: 'saber', cape: 'short'` | … ride_attack_sword | — |
| `mounted_scout` | 6 | horse | coat `chestnut`, medium; rider `helmet: 'brimhat', armor: 'tunicmil', legs: 'puttees', weapon: 'carbine'` | … ride_aim_carbine · ride_attack_carbine | `bullet` |
| `motorcyclist` | 7 | vehicle | `style: 'motorcycle'`; rider `helmet: 'leathercap', armor: 'tunicmil', legs: 'puttees', weapon: 'smg'` | ride_moto · ride_moto (anda) · ride_moto · ride_moto_attack; tiles [3.4, 3.4] | `bullet` |
| `phalangite` | 2 | human | `helmet: 'phrygian', crest: 'none', armor: 'linothorax', shield: 'pelte', weapon: 'sarissa', greaves: true` | idle_pike · walk_pike · — · attack_pike; tiles [3.6, 4.2] | — |
| `skoutatos` | 3 | human | `helmet: 'spangen', armor: 'lamellar', shield: 'kite', shieldTeam: 'full', weapon: 'spear', legs: 'trousers'` | idle_hoplite · walk_hoplite · — · attack_spear | — |
| `pikeman` | 4 | human | `helmet: 'morion', helmetMat: 'steel', armor: 'plate', weapon: 'pike', legs: 'breeches', sash: 'team'` | idle_pike · walk_pike · — · attack_pike; tiles [3.6, 4.2] | — |
| `grenadier` | 5 | human | `helmet: 'bearskin', armor: 'coat', weapon: 'grenade', back: 'musket', legs: 'breeches'` | idle_gun · walk_gun · aim_gun · attack_grenade | `grenade` |
| `fusilier` | 6 | human | `helmet: 'shako', armor: 'coat', weapon: 'musket', legs: 'trousers', back: 'pack'` | idle_gun · walk_gun · aim_gun · attack_gun | `bullet` |
| `modern_infantry` | 7 | human | `helmet: 'adrian', helmetMat: 'steel', armor: 'tunicmil', legs: 'puttees', weapon: 'rifle', back: 'pack'` | gun | `bullet` |
| `rhodian_slinger` | 2 | human | `helmet: 'none', armor: 'tunic', weapon: 'sling', sash: 'team'` | idle_javelin · walk_javelin · aim_sling · attack_sling | `stone` (o de hoje do petróbolo, menor: escala 0,5) |
| `byzantine_archer` | 3 | human | `helmet: 'spangen', armor: 'lamellar', weapon: 'bow', back: 'quiver', legs: 'trousers'` | bow (as de hoje) | `arrow` |
| `arquebusier` | 4 | human | `helmet: 'morion', armor: 'quilted', weapon: 'arquebus', legs: 'breeches', sash: 'team'` | gun | `bullet` |
| `musketeer` | 5 | human | `helmet: 'tricorne', armor: 'coat', weapon: 'musket', legs: 'breeches'` | gun | `bullet` |
| `sharpshooter` | 6 | human | `helmet: 'brimhat', armor: 'buffcoat', weapon: 'rifle', legs: 'trousers'` | gun | `bullet` |
| `machine_gunner` | 7 | human | `helmet: 'adrian', helmetMat: 'steel', armor: 'tunicmil', legs: 'puttees', weapon: 'mg'` | idle_mg · walk_mg · aim_mg · attack_mg | `bullet` (rajada) |
| `thureophoros` | 2 | human | `helmet: 'chalcidian', armor: 'linothorax', shield: 'thureos', weapon: 'javelin'` | javelin (as de hoje) | `javelin` |
| `akritas` | 3 | human | `helmet: 'kettle', armor: 'mail', shield: 'kite', weapon: 'javelin', legs: 'trousers'` | javelin | `javelin` |
| `rodelero` | 4 | human | `helmet: 'morion', helmetMat: 'steel', armor: 'plate', shield: 'rotella', weapon: 'sword', legs: 'breeches'` | idle_sword · walk_sword · — · attack_sword | — |
| `chasseur` | 5 | human | `helmet: 'shako', armor: 'coat', weapon: 'carbine', legs: 'trousers'` | gun | `bullet` |
| `light_infantry` | 6 | human | `helmet: 'kettle', helmetMat: 'felt', armor: 'tunicmil', weapon: 'rifle', legs: 'puttees'` | gun | `bullet` |
| `commando` | 7 | human | `helmet: 'beret', armor: 'tunicmil', weapon: 'smg', legs: 'puttees', back: 'pack'` | gun | `bullet` |
| `cataphract` | 3 | horse | coat `black`, heavy, `barding: 'scale'`, chamfron true; rider `helmet: 'spangen', armor: 'lamellar', weapon: 'lance'` | … ride_attack_lance | — |
| `cuirassier` | 4 | horse | coat `black`, heavy, cloth `long`; rider `helmet: 'sallet', helmetMat: 'steel', armor: 'plate', weapon: 'saber', legs: 'breeches'` | … ride_attack_sword | — |
| `dragoon` | 5 | horse | coat `bay`, medium; rider `helmet: 'tricorne', armor: 'coat', weapon: 'carbine', legs: 'breeches'` | … ride_aim_carbine · ride_attack_carbine | `bullet` |
| `lancer` | 6 | horse | coat `grey`, medium; rider `helmet: 'shako', armor: 'coat', weapon: 'lance', legs: 'trousers'` | … ride_attack_lance | — |
| `tank` | 7 | vehicle | `style: 'tank'`; tiles [4.4, 4.0]; `sizeClass: 'myth'` | idle_tank · roll_tank · aim_tank · fire_tank | `shell` |
| `athanatos` | 3 | human | `helmet: 'spangen', crest: 'tall', crestColor: 'team', armor: 'lamellar', shield: 'kite', weapon: 'sword', cape: 'long'` | sword | — |
| `knight_of_rhodes` | 4 | human | `helmet: 'sallet', helmetMat: 'steel', armor: 'plate', shield: 'heater', weapon: 'longsword', cape: 'long'` | sword | — |
| `guard_grenadier` | 5 | human | `helmet: 'bearskin', armor: 'coat', weapon: 'grenade', back: 'musket', legs: 'breeches', stature: 'tall'` | idle_gun · walk_gun · aim_gun · attack_grenade | `grenade` |
| `evzone` | 6 | human | `helmet: 'farion', armor: 'fustanella', weapon: 'rifle', legs: 'bare'` | gun | `bullet` |
| `sacred_band` | 7 | human | `helmet: 'adrian', helmetMat: 'steel', armor: 'tunicmil', weapon: 'smg', legs: 'puttees', sash: 'team', stature: 'tall'` | gun | `bullet` |
| `trebuchet` | 3 | siege | `style: 'trebuchet'`; tiles [4.2, 4.6] | idle/roll/fire/die_trebuchet | `stone` |
| `bombard` | 4 | siege | `style: 'bombard'`; tiles [3.8, 3.8] | idle/roll/fire/die_bombard | `shell` |
| `field_gun` | 5 | siege | `style: 'field_gun'`; tiles [3.8, 3.8] | …_field_gun | `shell` |
| `howitzer` | 6 | siege | `style: 'howitzer'`; tiles [3.8, 3.8] | …_howitzer | `shell` |
| `self_propelled_gun` | 7 | vehicle | `style: 'spg'`; tiles [4.4, 4.0]; `sizeClass: 'myth'` | idle_spg · roll_spg · aim_spg · fire_spg | `shell` |
| `covered_ram` | 3 | siege | `style: 'ram'`; tiles [4.0, 4.0] | …_ram | — |
| `greek_fire_siphon` | 3 | siege | `style: 'siphon'`; tiles [3.6, 3.6] | …_siphon | `fire` (jato: efeito, Bloco P) |

Os 2 da E2/E5:

| id | rig | parâmetros | poses |
|---|---|---|---|
| `merchant` | human | `helmet: 'petasos', helmetMat: 'felt', armor: 'tunic', tunicTeam: 'full', cape: 'long', carry: 'basket'` | idle_villager · walk_villager · — · attack_axe (+ carry) |
| `caravan` | horse | `coat: 'grey', build: 'light', cloth: false, pack: 'mule', rider: false` | idle_horse · trot · — · attack_horse |

Projéteis existentes hoje (`PROJECTILE_KINDS` em `src/render/fx/logic.ts`): confira os nomes com
`grep -n "PROJECTILE_KINDS" -A3 src/render/fx/logic.ts` antes de escrever o `projectileKind` (Bloco P).

### 9. Navios (rig `ship`; `page: 'own'`, `mirror: true`; `size.tiles = [L + 0.6, L + 0.6]` com L = comprimento, `anchor [0.5, 0.62]`)

| id | Era | estilo (`style`) | comprimento (tiles) | propulsão | `sizeClass` | `anims` | projétil |
|---|---|---|---|---|---|---|---|
| `fishing_boat` | 0 | `fishing` | 1,8 | remos (2 por lado) + vela latina | unit | idle 4 · walk 8 · gather 6 (rede) · die 6 | — |
| `fishing_boat_era4` | 4 | `fishing` + `rig: 'sail'` | 1,8 | vela de proa e popa | unit | idem | — |
| `fishing_boat_era6` | 6 | `fishing` + `rig: 'steam'` | 1,8 | chaminé fina | unit | idem | — |
| `transport_ship` | 0 | `transport` | 3,0 | remos (6 por lado) + vela quadrada | myth | idle · walk · die | — |
| `transport_ship_era4` / `_era6` | 4 / 6 | `rig: 'sail'` / `'steam'` | 3,0 | 2 mastros / roda de pás + chaminé | myth | idem | — |
| `merchant_ship` | 2 | `merchant` | 3,2 | vela quadrada, casco redondo | myth | idle · walk · die | — |
| `merchant_ship_era4` / `_era6` | 4 / 6 | `rig: 'sail'` / `'steam'` | 3,2 | carraca 3 mastros / vapor de rodas | myth | idem | — |
| `penteconter` | 0 | `penteconter` | 3,6 | 25 remos por lado, vela | myth | idle · walk · attack (abalroar) · die | — |
| `trireme` | 1 | `trireme` | 4,0 | 3 bancadas de remos, esporão de bronze | myth | idem | — |
| `quinquereme` | 2 | `quinquereme` | 4,4 | remos + torre de arqueiros | myth | idle · walk · attack · die | `arrow` |
| `dromon` | 3 | `dromon` | 4,2 | 2 velas latinas + sifão na proa | myth | idle · walk · attack · die | `fire` |
| `galleon` | 4 | `galleon` | 4,8 | 3 mastros, castelos, 2 baterias | titan | idle · walk · aim · attack · die | `shell` |
| `ship_of_the_line` | 5 | `ship_of_the_line` | 5,4 | 3 mastros, 3 baterias | titan | idem | `shell` |
| `ironclad` | 6 | `ironclad` | 4,8 | casco de ferro, chaminé, torre de canhão | myth | idem | `shell` |
| `battleship` | 7 | `battleship` | 6,0 | casco cinza, 2 torres duplas, 2 chaminés | titan | idem | `shell` |

Poses (`art/poses/ship.json`): `idle` → `idle_ship`; `walk` → `row` (galés e barcos a remo), `sail` (vela) ou `steam`
(vapor); `attack` → `ram_ship` (esporão: penteconter, trirreme) ou `fire_ship` (quinquerreme, dromon e os de
pólvora); `aim` → `idle_ship` com as portinholas abertas; `gather` (pesca) → `idle_ship` com a rede (escalar `net`);
`die` → `sink`. Pesca, transporte e mercante: **um manifesto** cada com `unitVariants: { by: 'era', param: 'era', values: [...] }`
(o rig lê `params.era` e escolhe `rig`). `attack` de navio a remo = o casco avança 0,3 e volta (esporão); a vela
infla nos quadros de `walk` (escalar `billow`). `die` = adernar 25° e afundar (clipping na linha d'água: o rig
recorta tudo com y < 0 — `material.clippingPlanes` com `renderer.localClippingEnabled = true` na página).

### 10. Criaturas (E6) e Talos

Todas `sizeClass: 'myth'`, `page: 'own'`, `era` = `UNITS[id].age`.

| id | Era | rig | descrição (valores iniciais) | `flying` | anims |
|---|---|---|---|---|---|
| `satyr` | 4 | biped | finish `satyr`: torso humano, pernas de bode (curvas, pelo `fur`), chifres curtos, siringe/tirso, faixa de time; estatura 1,0 | não | idle · walk · attack · die |
| `empusa` | 4 | biped | finish `empusa`: mulher espectral pálida, uma perna de bronze e outra de burro, cabelo de chamas (`glow` laranja), alfa 0,85 | não | idle · walk · attack · die |
| `lampad` | 4 | biped | finish `lampad`: ninfa com tocha em cada mão (chama emissiva), véu de time, flutua 0,15 acima do chão | não | idle · walk · aim · attack · die (projétil `fire`) |
| `harpy` | 5 | biped | finish `harpy`: corpo de ave com cabeça de mulher, asas de `rigs/wings.js` (penas escuras), garras | sim | idle · walk (voo) · attack · die |
| `hippocampus` | 5 | horse | `coat: 'sea'`, `tail: 'fish'`, `swim: true`, `wings: false`, cloth false, crina de barbatana; naval (camada água) | não | idle · walk · attack · die |
| `triptolemus_dragon` | 5 | beast | `face: 'dragon'`, asas grandes (`wings.js`), escamas verdes, carro de trigo dourado nas costas com cocheiro de time | sim | idle · walk (voo) · attack · die |
| `phoenix` | 6 | bird (novo) | ave de fogo: penas `gold`/laranja emissivas, cauda de 5 penas longas, chama nas pontas das asas | sim | idle · walk (voo) · attack · die · ability (renasce: ovo de fogo, 8 quadros, só se a E6 tiver o renascer) |
| `griffin` | 6 | beast | `face: 'eagle'`, corpo de leão, asas de águia, `wings: 'feather'`; poses de voo novas no `gait.mjs` (`fly`, `fly_attack`, `fly_die`) | sim | idle · walk · attack · die |
| `erinys` | 6 | biped | finish `erinys`: mulher alada de túnica preta, serpentes no cabelo, açoite de chamas; alfa 0,9 | sim | idle · walk · attack · die |
| `colossus_era6` / `talos` | 6 | biped | finish `talos`: o colosso em bronze escuro com veias de cobre brilhante e rebites; mesmo esqueleto | não | as do colosso |

Voadoras no `biped` (harpia, erínia): poses novas em `art/poses/biped.json` — `idle_fly_biped` (4: paira, asas
batendo devagar, pernas recolhidas), `fly_biped` (8), `attack_fly_biped` (6: mergulho com as garras/o açoite),
`die_fly_biped` (6: cai girando). No `beast` (grifo, dragão), as poses de voo saem do `gait.mjs` (J2).

Talos: se `UNITS.talos` existir (`grep -n "talos" src/core/data/units.ts`), crie `art/manifest/talos.json`; senão, o
`colossus.json` ganha `unitVariants: { by: 'era', param: 'era', values: [0, 6] }` e a cópia `colossus_era6` vai para
`units_e6` (o renderizador escolhe pela Era do dono).

### 11. Maravilhas (rig building, estilo = id; `scripts/bake/page/rigs/buildings-wonders.js`)

Todas: `footprint [4, 4]`, `size.tiles [6.2, 7.6]`, `anchor [0.5, 0.6]` (ajuste como as 3 de hoje: copie o `anchor`
de `art/manifest/wonder_artemis.json`), os 6 estados, `icon: { anim: 'complete' }`, `team: true`, `shadow: true`,
`atlasGroup: 'wonders'` (campo novo, Bloco A). Altura máxima 3 tiles acima do chão. Estandarte de time em todas.

| id | Lote | Planta (valores iniciais, metros do rig) |
|---|---|---|
| `wonder_lion_gate` | 1 | muralha ciclópica (blocos irregulares de `stoneWarm` 1,2 × 0,8) em L com o portão de verga monolítica e o triângulo dos dois leões em relevo (`limestone`) em cima; rampa de terra |
| `wonder_labyrinth` | 1 | palácio de Cnossos: pátio central, 3 alas de 2 andares com **colunas vermelhas afinando para baixo** (`crest`) e capitel preto, chifres de consagração no telhado plano, afrescos azuis (faixa `navy`) |
| `wonder_delphi` | 1 | templo dórico de Apolo sobre terraço em encosta (dois níveis) + tholos redondo de 10 colunas ao lado + trípode de bronze |
| `wonder_parthenon` | 1 | templo dórico octastilo de mármore, frontões com relevos, sobre a rocha da Acrópole (platô de calcário 0,6) com os Propileus menores à frente |
| `wonder_epidaurus` | 1 | teatro: cávea semicircular de 12 degraus (anel cortado em arco de 200°) de calcário, orquestra redonda, skene baixa com 3 portas |
| `wonder_mausoleum` | 1 | pódio alto (1,6) + colunata jônica de 9×11 + pirâmide de 24 degraus + quadriga de bronze no topo |
| `wonder_pharos` | 1 | 3 andares: base quadrada (2,2 × 2,2 × 2,4), octógono, cilindro; fogo emissivo no topo (estado `glow` de 6 quadros, como o portal dos titãs); estátua no topo |
| `wonder_great_library` | 1 | estoa em U de dois andares com 20 colunas, rolos em nichos (caixas `linen`), jardim com fonte no meio |
| `wonder_hagia_sophia` | 1 | basílica quadrada de tijolo e reboco com a **cúpula central grande** (r 1,6, 40 nervuras) e 2 semicúpulas, 4 contrafortes |
| `wonder_theodosian_walls` | 1 | trecho de muralha tripla em degraus (fosso, muro baixo, muro interno alto com 2 torres quadradas), faixas de tijolo vermelho |
| `wonder_meteora` | 1 | 3 pilares de rocha (cilindros irregulares de `stoneDark` 2,2–2,8 de altura) com mosteiros de telha vermelha no topo e uma escada de corda |
| `wonder_candia_arsenal` | 2 | 6 galpões abobadados lado a lado (`stoneWarm`), um com uma galé na carreira, leão de São Marcos na fachada |
| `wonder_knights_rhodes` | 2 | palácio-fortaleza: 2 torres redondas com ameias, muralha com machicólis, portão em arco, estandarte com cruz de time |
| `wonder_palamidi` | 2 | 3 baluartes de pontas em degraus subindo a encosta, guaritas redondas nos ângulos, escadaria |
| `wonder_corinth_canal` | 2 | corte reto de 4 tiles com paredes de rocha verticais (o chão do corte é água rasa pintada, a pegada é passável pela E7) e uma ponte de treliça de ferro atravessando por cima |
| `wonder_panathenaic` | 2 | estádio em U de mármore (pista 3,8 × 1,4, arquibancadas de 10 degraus), propileu com 4 colunas na entrada |
| `wonder_olympus_throne` | 2 | montanha (cone irregular 2,8 de altura, neve no topo) com trono de ouro gigante, raios de bronze cravados e nuvens (`linen`, alfa 0,7) em volta da base |

### 12. Efeitos (Bloco P)

| Coisa | Onde | Valores iniciais |
|---|---|---|
| projétil `bullet` | `scripts/bake/fx/catalog.mjs` (`FX_PROJECTILES`) + `PROJECTILE_KINDS` | traçante: risco 10 × 1,5 px laranja-claro emissivo (`0xffd890`), 8 direções; arco 0; velocidade ×2,5 da flecha |
| projétil `shell` | idem | esfera r 3 px ferro escuro com brilho; arco 0,16 |
| projétil `grenade` | idem | esfera r 2,5 px preta com faísca do pavio; arco 0,45 |
| família `flash` | `fxItems` | clarão de boca 4 quadros (estrela de 5 pontas amarela → branca), 16 px |
| `gunpowderProjectile(def)` | `src/render/fx/logic.ts` | `rhodian_slinger` → `stone`; tag `gunpowder`: `attackType === 'crush'` com área (`splash`) e sem tag `siege`/`ship`/`mechanical` → `grenade`; `crush` → `shell`; senão `bullet`; o resto como hoje |
| clarão + fumaça de pólvora | `recipes.ts` (`gunSmoke`) e `projectile.ts` | no disparo de `bullet`/`shell`: 1 clarão na boca (`muzzles` do índice; senão 0,6 tile à frente) + 3 baforadas cinza-claras (`0xd8d4cc`, alfa 0,5 → 0, 1,2 s, sobem 0,3 tile); grupo de orçamento `gunsmoke` com teto de 18 % do orçamento de partículas; prioridade "combate" |
| explosão | `projectile.ts` no impacto de `shell`/`grenade` | clarão laranja 0,4 tile + 8 faíscas + poeira (a do desabamento, 50 %) + decalque `scorch` (o de queimadura de hoje, escala 0,6) |
| fumaça de motor | `unitFx.ts` | tag `mechanical` andando: 1 baforada cinza-escura a cada 0,25 s na traseira; parado: 1 a cada 0,8 s |
| vapor de navio | `unitFx.ts` (tabela `STACKS`) | navio com `rig: 'steam'`/`ironclad`/`battleship`: fumaça preta da chaminé (posição relativa por estilo na tabela), 1 baforada a cada 0,3 s andando |
| esteira | `unitFx.ts` | navio andando: 2 traços em V de espuma (`0xeef6f8`, alfa 0,6 → 0, 1,5 s) atrás da popa, a cada 0,2 s; parado nada |
| chaminés | `rules.ts` (`WORK_SMOKE`) | edifício pronto com a cópia da Era ≥ 6 e com chaminé: fumaça de trabalho `kind: 'stack'` (mais escura e mais alta que a lareira), posição por tipo numa tabela `CHIMNEY_AT` (offset em tiles) |
| poeira da troca de Era | `FxSystem.eraChange(view)` | 10 partículas de poeira de obra ao redor da pegada + 1 anel de poeira, 0,8 s |
| "+N ouro" | `EFFECT_TYPES` (E5/E7) + handler | texto flutuante dourado "+N" sobre o Mercado de chegada, 1,5 s, sobe 0,6 tile (se a E5 já fez, só confira) |

### 13. Ícones (Bloco L)

- `unit/<id>` e `bld/<id>` para todos os tipos novos (unidades, navios, criaturas, maravilhas, Pedreira, poços,
  Refinaria, Estaleiro) saem dos modelos do jogo, como na Etapa 7: no catálogo `scripts/bake/hud/catalog.mjs`, cada
  entrada nova aponta para o manifesto do tipo (mesmo enquadramento de `unit/hoplite`; navios `unit/trireme` com o
  enquadramento de 3/4 de cima).
- Estudos de evolução: um ícone **por degrau** `tech/evo_<linha>_<n>` com o modelo do degrau que o estudo libera
  (lista gerada no passo L1: 43 das linhas de terra + 7 dos navios de guerra); `tech/evo_<linha>` (o de linha da E3)
  continua para cidadão, pesca e transporte.
- Idades: `age/4` canhão (troca o elmo escuro provisório da E1), `age/5` tricórnio, `age/6` engrenagem (objeto `gear`
  novo em `hud-objects.js`: anel de 12 dentes de `castIron`), `age/7` continua o vulcão da E1.
- Sai `SHIP_ICONS` (E4) de `src/ui/icons.ts`: os navios passam a usar `unit/<id>` do atlas.

### 14. Orçamento por Era (D24; preencha a coluna "medido" no fim)

| Grupo | Conteúdo | Teto 1× | Medido |
|---|---|---|---|
| `buildings` (base) | 21 + novos (Era base) | 30 MB | |
| `buildings_e<n>` (cada) | cópias da Era n | 30 MB | |
| `units_e<n>` (cada, sem as páginas próprias) | unidades da Era n | 15 MB | |
| Era n (`buildings_e<n>` + `units_e<n>`) | — | **40 MB** | |
| `wonders` | 17 maravilhas | 30 MB | |
| pior caso de uma partida | base (sem páginas próprias) + 4 maiores páginas próprias + 3 maiores Eras + `wonders` | **260 MB** | |
| PNG total (`public/art`) | tudo | **500 MB** | |

Se o PNG passar de 500 MB: tire o 2× (`"scales": [1]`) primeiro de `ship_of_the_line`, `galleon` e `battleship`,
depois de `wonders`, e anote em `docs/ART.md` §6. Se uma Era passar de 40 MB: reduza `size.tiles` das cópias daquela
Era em 5 % (não tire estados nem variantes).

## Passo a passo

Regras para todos os blocos:

- Rascunhos, caches de comparação e capturas intermediárias ficam em `scratch/e8/` (fora do git; crie com
  `mkdir -p scratch/e8`). Se `scratch/` não estiver no `.gitignore`, **não** o acrescente: só não faça `git add` dele.
- Bake longo (mais de 2 min) sempre em segundo plano com log: `node scripts/bake/bake.mjs … > scratch/e8/<nome>.log 2>&1`
  e acompanhe com `tail -n 5 scratch/e8/<nome>.log`.
- Toda folha de contato e toda captura nova é **olhada** com a ferramenta Read antes do commit. Se algo sair errado
  (peça flutuando, cor de time faltando, telhado atravessando parede), corrija antes de seguir.
- Commits de código podem sair a cada passo; os PNG de `public/art` entram só no passo final de cada bloco de arte.
- Todo commit em português, com o rodapé de atribuição que a sessão indicar (linhas `Co-Authored-By`/`Claude-Session`).
  Nada de push sem o dono pedir.

### Bloco 0 — Preparação (0,5 dia)

- [ ] **0.1 Conferir os pré-requisitos.**
  ```bash
  mkdir -p scratch/e8
  grep -n "export function visualEra" src/render/art/logic.ts                   # E1
  grep -n "UNIT_ART_ALIAS\|BUILDING_ART_ALIAS" src/render/art/alias.ts           # E2–E7
  grep -n "export function lineUnitOf\|export function unitLinesOn" -r src/core  # E3
  grep -n "export function evoTechId" src/core/data/lines.ts                      # E3
  grep -n "'gunpowder'\|'mechanical'\|'ship'" src/core/data/units.ts | head       # E3/E4
  npx tsx -e "import {UNITS,BUILDINGS} from './src/core/data'; console.log(Object.keys(UNITS).length, Object.keys(BUILDINGS).length)"
  ```
  Se algum `grep` vier vazio, pare e anote em `docs/eras/PROGRESSO.md` que a E8 está bloqueada pela etapa que falta.
  Guarde a saída do comando abaixo: é a lista de trabalho (tudo que hoje usa alias de arte):
  ```bash
  npx tsx -e "import {UNIT_ART_ALIAS,BUILDING_ART_ALIAS} from './src/render/art/alias'; console.log(Object.keys(UNIT_ART_ALIAS).length, Object.keys(UNIT_ART_ALIAS).join(' ')); console.log(Object.keys(BUILDING_ART_ALIAS).length, Object.keys(BUILDING_ART_ALIAS).join(' '))" | tee scratch/e8/alias-antes.txt
  ```
  Esperado: ~54 unidades e ~23 edifícios (17 maravilhas + `quarry`, `naphtha_well`, `oil_well`, `refinery`,
  `shipyard`, e `university`/`factory` se existirem). Tipos da E6 (criaturas) podem estar lá ou no procedural puro.
- [ ] **0.2 Fotografia do antes.** Com `npm run build` e `npm run preview` (porta 4173) de pé:
  ```bash
  mkdir -p scratch/e8/antes
  npm run smoke 20 42 > scratch/e8/antes/smoke.txt          # hash da partida (não pode mudar na E8)
  npm run art:check > scratch/e8/antes/check.txt
  node scripts/artages.mjs http://localhost:4173/ --out scratch/e8/antes --prefix antes
  node scripts/artparade.mjs http://localhost:4173/ --out scratch/e8/antes --prefix antes
  node scripts/renderperf.mjs http://localhost:4173/ 20 --quality medium > scratch/e8/antes/perf20.txt
  node scripts/actionshot.mjs http://localhost:4173/ scratch/e8/antes/acao.png
  ```
- [ ] **0.3 Cache de referência dos edifícios** (para provar byte a byte que a base não muda):
  ```bash
  node scripts/bake/bake.mjs --only buildings --scale 1,2 --out scratch/e8/ref-buildings > scratch/e8/ref.log 2>&1
  cp -r art/cache scratch/e8/cache-antes
  ```
  Esse bake usa o código de hoje (antes de qualquer mudança). Se o cache já tinha os edifícios, termina rápido.
- [ ] **0.4 Ganchos de teste em `src/main.ts`** (fora do lockstep, como `debugSpawn`): no objeto `window.aoe`,
  acrescente
  ```ts
  /** E8: Era de um jogador nas cenas de teste (artages/artlines); não usar em partida de verdade. */
  debugSetAge: (owner: number, age: number) => { if (!session) return false; const p = session.state.players[owner]; if (!p) return false; p.age = Math.max(0, Math.min(7, age | 0)); return true; },
  /** E8: dados que os scripts de captura leem (Era, pegada, tags) sem importar TypeScript. */
  debugData: () => ({
    buildings: Object.fromEntries(Object.values(BUILDINGS).map((b) => [b.id, { age: b.age, w: b.w, h: b.h, wonder: !!b.wonder }])),
    units: Object.fromEntries(Object.values(UNITS).map((u) => [u.id, { age: u.age, cls: u.cls, tags: u.tags, line: u.line ?? null, naval: !!u.naval, flying: !!u.flying }])),
  }),
  ```
  e troque `debugSpawn` para aceitar a camada (navios na água): `debugSpawn: (owner, type, x, y)` passa a procurar o
  tile livre com `nearestFreeTile(session.state.map, x, y, 12, UNITS[type]?.naval ? 'water' : undefined)` — use a
  assinatura que a E4 deu a `nearestFreeTile` (`grep -n "export function nearestFreeTile" -r src/core`); se a E4 não
  criou o parâmetro de camada, procure o tile de água com o helper naval da E4 (`grep -n "export function" src/core/sim/naval.ts`).
  *Conferir:* `npm run -s typecheck`.

### Bloco A — Manifesto, bake e check por Era (2 dias; nenhuma mudança visual)

- [ ] **A1. Constantes e validação em `scripts/bake/manifest.mjs`.**
  1. Depois de `ATLAS_GROUPS`:
     ```js
     /** E8: grupos de atlas por Era (carregados sob demanda; docs/eras/E8-arte-por-era.md D3/D11) e o das maravilhas. */
     export const ERA_COUNT = 8;
     export const ERA_GROUPS = [...Array.from({ length: ERA_COUNT }, (_, n) => `buildings_e${n}`), ...Array.from({ length: ERA_COUNT }, (_, n) => `units_e${n}`), 'wonders'];
     /** Grupo de atlas de um manifesto (já expandido): o campo `atlasGroup`, a Era da unidade ou o do kind. */
     export function atlasGroupOf(m) {
       if (m.atlasGroup) return m.atlasGroup;
       if (m.kind === 'unit' && Number.isInteger(m.era)) return `units_e${m.era}`;
       return GROUP_OF[m.kind];
     }
     ```
  2. `UNIT_VARIANT_BY = ['heads', 'era']`; na validação de `unitVariants`, valores inteiros **0–7** quando
     `by === 'era'` (1–9 continua para `heads`).
  3. `RIGS` ganha `'vehicle', 'ship', 'bird'` (no fim).
  4. Em `validateManifest`, para edifícios:
     - `eras`: lista de inteiros 0–7 sem repetição, sem a Era base (`source.params.era ?? 1`); proibido em maravilhas
       (`id` começa com `wonder_`), `titan_gate`, `cornucopia` e `rubble`;
     - `eraParams`: objeto cujas chaves são `"*"` ou índices presentes em `eras`; valores objetos;
     - `eraNoVariants`: boolean; `atlasGroup`: string de `ERA_GROUPS`;
     - mensagem de erro no padrão de hoje (`${where}: …`).
  5. Para unidades: `era` inteiro 0–7 (opcional; as 35 de hoje não têm).
  *Conferir:* `npx vitest run tests/art-manifest.test.ts` (passa sem mudança: nenhum manifesto usa os campos ainda).
- [ ] **A2. Expansão das Eras.** Em `manifest.mjs`, depois de `expandUnitVariants`:
  ```js
  /** Era base de um edifício (a do asset sem sufixo): `source.params.era`, senão 1 (Clássica, a arte de hoje). */
  export function baseEraOf(m) { return m?.source?.params?.era ?? 1; }
  /** Id da cópia de um edifício na Era n. */
  export const eraCopyId = (id, n) => `${id}_e${n}`;
  /**
   * E8 (kit de Era): um edifício com `eras` vira o asset base + uma cópia por Era (`<id>_e<n>`, grupo `buildings_e<n>`,
   * `params.era = n`, `eraOf` = id base, `eraValue` = n, folha de contato `<contact>-e<n>`, sem ícone). `eraParams['*']`
   * e `eraParams[n]` sobrescrevem os parâmetros; `eraNoVariants` tira as variantes das cópias (casa/templo .glb); o
   * base recebe `params.era` = Era base explícita. Sem `eras`: [m].
   */
  export function expandEraVariants(m) {
    if (m?.kind !== 'building' || !Array.isArray(m.eras) || !m.eras.length || m.source?.type !== 'param') return [m];
    const base = baseEraOf(m);
    const { eras, eraParams = {}, eraNoVariants, ...rest } = m;
    const head = { ...rest, eraBase: base, source: { ...m.source, params: { ...m.source.params, era: base } } };
    const out = [head];
    for (const n of eras) {
      const params = { ...m.source.params, ...(eraParams['*'] ?? {}), ...(eraParams[String(n)] ?? {}), era: n };
      for (const k of Object.keys(params)) if (params[k] === null) delete params[k];
      const copy = { ...rest, id: eraCopyId(m.id, n), source: { ...m.source, params }, eraOf: m.id, eraValue: n, atlasGroup: `buildings_e${n}`, contact: `${m.contact ?? m.id}-e${n}` };
      delete copy.icon;
      if (eraNoVariants) { delete copy.variants; delete copy.variantBy; }
      out.push(copy);
    }
    return out;
  }
  /** Todas as expansões (variantes de unidade e Eras de edifício). */
  export function expandAll(m) { return expandUnitVariants(m).flatMap(expandEraVariants); }
  ```
  e troque `loadAssets` para `flatMap((l) => expandAll(l.manifest))`. Nas cópias de unidade por Era
  (`expandUnitVariants` com `by === 'era'`), ponha também `era: value` e `atlasGroup: 'units_e' + value` na cópia
  (o primeiro valor, o próprio manifesto, fica no grupo de hoje).
  Cuidado: o `params.era` do base **entra no hash** e muda a semente? Não: a semente (`buildBuilding`) não usa a Era
  (Bloco C). Mas muda o hash de entrada, então os edifícios serão reassados (esperado, ver Armadilhas).
- [ ] **A3. Grupo nos quadros e no filtro.** `atlasOf(m, f)` vira `f.atlas ?? atlasGroupOf(m)`. Em `matchesOnly`, troque
  `o === GROUP_OF[m.kind]` por `o === atlasGroupOf(m)` e acrescente `o === m.eraOf`:
  ```js
  return only.some((o) => o === m.id || m.id.startsWith(o + '-') || o === m.kind || o === atlasGroupOf(m) || (m.eraOf && o === m.eraOf));
  ```
  Assim `--only buildings` assa só o grupo base (como hoje), `--only buildings_e3` só as cópias da Era 3,
  `--only wonders` as maravilhas novas e `--only town_center` o base e as cópias do CC. Para os assets de hoje
  `atlasGroupOf(m) === GROUP_OF[m.kind]`: nada muda.
- [ ] **A4. `scripts/bake/bake.mjs`.**
  1. Importe `ERA_GROUPS`, `atlasGroupOf`, `expandAll`; troque toda chamada de `expandUnitVariants` por `expandAll`
     (o laço principal, o `--preview` e onde mais aparecer: `grep -n "expandUnitVariants" scripts/bake/*.mjs scripts/bake/*.ts`).
  2. Em `packAll`, o laço `for (const group of ATLAS_GROUPS)` vira `for (const group of [...ATLAS_GROUPS, ...ERA_GROUPS])`
     e o filtro de assets por grupo usa `atlasGroupOf(m)` (procure `GROUP_OF[m.kind]` em `packAll` e troque).
     Grupo sem nenhum asset não gera atlas.
  3. No índice (`assets[id]`), grave `group` = `atlasGroupOf(m)` (já é o `group` de hoje para os antigos) e, quando
     existirem, `eraOf`, `eraValue`, `eraBase`, `era`, e em `unitVariants` o `by: 'era'` com os `ids` como hoje.
  4. A ordem de empacotamento dentro de um grupo não muda (os antigos saem nas mesmas páginas).
  *Conferir:* `node scripts/bake/bake.mjs --only barracks --scale 1 --out scratch/e8/a4` (sem `eras` ainda: o índice
  do rascunho tem `barracks` no grupo `buildings`, igual a hoje).
- [ ] **A5. `scripts/bake/check.ts`.**
  1. O tipo do grupo sai do prefixo: `group.startsWith('buildings') || group === 'wonders'` → `'building'`;
     `group.startsWith('units')` → `'unit'` (procure onde o check escolhe `kind` pelo grupo: `grep -n "kind ===\|group ===" scripts/bake/check.ts`).
  2. `BUDGET.maxPngMB = 500`; novos `maxEraVramMB: 40` e `maxWonderVramMB: 30`; `maxVramMB: 260` passa a valer para o
     pior caso (comentário: "pior caso de UMA partida: base sem páginas próprias + 4 maiores páginas próprias + 3
     maiores Eras + wonders").
  3. `stats.vramByEra: Record<scale, number[8]>` (soma dos atlas de `buildings_e<n>` + `units_e<n>`) e
     `stats.vramWorstMatch: Record<scale, number>`; erros "Era n a s×: X MB > 40·s² MB" e "pior caso a s×: …".
     As páginas próprias são as dos assets com `page: 'own'` (o índice já marca: `grep -n "own" scripts/bake/bake.mjs`).
  4. O erro antigo de `vramByScale` sai (o total de tudo carregado passa a ser só informativo no log).
  *Conferir:* `npm run art:check` (mesmos números de hoje + "Eras: 0 0 0 0 0 0 0 0 MB"), `npx vitest run tests/art-manifest.test.ts`
  (o teste de orçamento é atualizado no passo A7).
- [ ] **A6. `scripts/bake/cache-diff.mjs` (novo).** Compara dois diretórios de cache, asset por asset e escala por
  escala (o diretório mais novo de cada `<id>/<escala>x-*`), quadro a quadro (PNG por PNG, comparando os bytes dos
  pixels decodificados com `pngjs`). Uso:
  ```bash
  node scripts/bake/cache-diff.mjs scratch/e8/cache-antes art/cache --ids barracks,stable --alias town_center@a1=town_center,town_center@a0=town_center_e0,town_center@a2=town_center_e2
  ```
  `--alias velho@variante=novo` compara os quadros `<velho>/<estado>/<variante>` do cache antigo com `<novo>/<estado>`
  do novo. Sai com código 1 e lista os quadros diferentes; com tudo igual imprime `igual: N quadros`. Leia o formato
  do cache em `loadCache` de `bake.mjs` antes de escrever (o `entry.frames` diz o arquivo de cada quadro).
- [ ] **A7. Centro Cívico por Era (D7) e testes do bloco.**
  1. `art/manifest/town_center.json`: tire `variants` e `variantBy`; `source.params` = `{ "style": "town_center", "seedVariant": "a1" }`;
     acrescente `"eras": [0, 2, 3, 4, 5, 6, 7]` e
     `"eraParams": { "0": { "seedVariant": "a0" }, "2": { "seedVariant": "a2" } }`. Atualize o `docs` do manifesto
     (uma linha: "Eras pelo kit de Era (E8); a0/a1/a2 de antes = e0/base/e2").
  2. `scripts/bake/page/buildings.js`, `buildBuilding`: a semente usa `params.seedVariant ?? params.variant ?? ''`
     no lugar de `params.variant ?? ''` (o resto da string igual); no builder do CC,
     `const v = p.variant ?? p.seedVariant; const tier = v === 'a0' ? 0 : v === 'a2' ? 2 : v === 'a1' ? 1 : (p.era ?? 1) <= 0 ? 0 : (p.era ?? 1) === 1 ? 1 : 2;`.
  3. Asse o CC: `node scripts/bake/bake.mjs --only town_center --scale 1,2 --out scratch/e8/a7 > scratch/e8/a7.log 2>&1`.
     As Eras 3–7 vão sair iguais à e2 até o Bloco C (o remapeamento ainda não existe): normal.
  4. Prova byte a byte: `node scripts/bake/cache-diff.mjs scratch/e8/cache-antes art/cache --ids town_center --alias town_center@a1=town_center,town_center@a0=town_center_e0,town_center@a2=town_center_e2`
     → `igual`.
  5. Testes: em `tests/art-manifest.test.ts` a linha `expect([tc.variantBy, tc.variants]).toEqual(['ageTier', …])`
     vira `expect(tc.eras).toEqual([0, 2, 3, 4, 5, 6, 7])`; em `tests/art-library.test.ts` a linha
     `expect(manifest.assets.town_center.variantBy).toBe('ageTier')` vira
     `expect(manifest.assets.town_center_e0?.eraOf).toBe('town_center')` (só depois da fusão do passo R6; até lá
     marque com `it.skip` e um comentário `// E8: volta no R6`). Crie `tests/art-eras.test.ts` com os testes da
     seção "Testes" (parte "manifesto").
  *Conferir:* `npx vitest run tests/art-manifest.test.ts tests/art-eras.test.ts`; não funda nada em `public/art` ainda.

### Bloco B — Renderizador por Era (2 dias; ainda sem cópias assadas, nada muda na tela)

- [ ] **B1. Tipos e funções puras (`src/render/art/types.ts`, `logic.ts`).**
  ```ts
  // types.ts
  export type EraGroup = `buildings_e${number}` | `units_e${number}` | 'wonders';
  export type ArtGroup = 'units' | 'buildings' | 'props' | 'icons' | 'fx' | EraGroup;
  ```
  ```ts
  // logic.ts
  /** Grupos de atlas carregados sob demanda (E8): as Eras dos edifícios e as maravilhas novas. */
  export function isOnDemandGroup(g: string): boolean { return /^buildings_e\d$/.test(g) || g === 'wonders'; }
  /** Grupos de unidade (carregados por tipo): o de hoje e os por Era. */
  export function isUnitGroup(g: string): boolean { return g === 'units' || /^units_e\d$/.test(g); }
  /**
   * Asset de um edifício na Era `era` (D2): a maior Era ≤ `era` entre a base e as cópias PRONTAS (`ready(id)`); sem
   * nenhuma, o próprio tipo. `eras` = { Era: id } vindo do índice (ArtLibrary.buildingEras).
   */
  export function buildingEraId(type: string, eras: Readonly<Record<number, string>> | null, era: number, ready: (id: string) => boolean): string {
    if (!eras) return type;
    let best = -1, id = type;
    for (const k in eras) { const n = Number(k); if (n <= era && n > best && (eras[n] === type || ready(eras[n]))) { best = n; id = eras[n]; } }
    return id;
  }
  ```
  e `unitArtId(type, entry, heads, era = 0)`: se `entry.unitVariants.by === 'era'`, devolva o id da **maior** chave
  ≤ `era` em `entry.unitVariants.ids` (a primeira, o próprio tipo, se nenhuma); `heads` continua como hoje.
  *Conferir:* testes de `buildingEraId` e `unitArtId` em `tests/art-eras.test.ts` (seção "Testes").
- [ ] **B2. `src/render/art/era.ts` (novo).**
  ```ts
  import { LINES, TECHS, UNITS, evoTechId } from '../../core/data';
  import { unitLinesOn } from '../../core/sim/lines';   // confira o caminho: grep -n "export function unitLinesOn" -r src/core
  import type { GameState, Unit } from '../../core/types';
  import { visualEra } from './logic';

  /** Era visual de um jogador (teto da campanha: config.visualEraMax). */
  export function playerArtEra(state: GameState, owner: number): number {
    return visualEra(state.players[owner]?.age ?? 0, state.config.visualEraMax);
  }
  /** Era da arte de um edifício (D4): a do dono. Nome próprio para ler melhor no renderizador. */
  export const buildingArtEra = playerArtEra;
  /**
   * Era da arte de uma unidade (D12): a do dono; nas linhas que NÃO trocam de tipo (cidadãos, pesca, transporte), com as
   * linhas ligadas, limitada a "um antes do próximo estudo de evolução não feito" — o barco só fica a vapor depois do
   * estudo "A vapor", e o cidadão acompanha os estudos da Biblioteca.
   */
  export function unitArtEra(state: GameState, u: Pick<Unit, 'type' | 'owner'>): number {
    const era = playerArtEra(state, u.owner);
    const def = UNITS[u.type], lineId = def?.line;
    const line = lineId ? LINES[lineId] : undefined;
    if (!line || !lineId || !unitLinesOn(state) || !line.steps.every((s) => s === null || s === u.type)) return era;
    const techs = state.players[u.owner]?.techs ?? [];
    for (let k = 1; k < line.steps.length; k++) {
      const tid = evoTechId(lineId, k);
      if (TECHS[tid] && !techs.includes(tid)) return Math.min(era, k - 1);
    }
    return era;
  }
  /** Eras visuais em jogo (todos os jogadores, sem o Gaia) + a próxima do jogador local: pré-carga dos grupos (D23). */
  export function erasInPlay(state: GameState, local: number): number[] {
    const s = new Set<number>();
    state.players.forEach((p, i) => { if (i > 0 || state.players.length === 1) s.add(playerArtEra(state, i)); });
    const next = Math.min(7, (state.players[local]?.age ?? 0) + 1);
    s.add(visualEra(next, state.config.visualEraMax));
    return [...s].sort((a, b) => a - b);
  }
  ```
  Confira se o jogador 0 é Gaia neste código (`grep -n "gaia\|GAIA" src/core/types.ts`); se não houver Gaia, some
  todos os jogadores (tire a condição `i > 0`). `techs` pode ser `Set` em vez de array: use o que `lineUnitOf` usa.
- [ ] **B3. `AtlasSource.ts` e `ArtLibrary.ts`.**
  1. `LoadKind = 'group' | 'unit' | 'era'`; em `ensure(group, scale)`, o aviso de fim de carregamento manda `'era'`
     quando `isOnDemandGroup(group)`.
  2. `AtlasSource.unloadGroup(group: ArtGroup): boolean` — libera as duas escalas do grupo (use o `release` privado que
     o `unloadScale` usa) e devolve se havia algo carregado.
  3. `ArtLibrary`:
     - `onChange`: `if (kind === 'era') { this.buildingsArt.clear(); for (const g of [...this.servedCache.keys()]) if (isOnDemandGroup(g)) { this.servedCache.delete(g); this.passCache.delete(g); } this.eraGen++; return; }`;
     - campo público `eraGen = 0` (comentário: "muda quando chega um grupo de Era/maravilhas: o renderizador troca as
       vistas desses edifícios, sem reconstruir o resto");
     - `prewarm` continua só com `GROUPS` (os 5 de hoje); os grupos sob demanda **não** entram em `GROUPS`;
     - `collect()`: troque `g !== 'units'` por `!isUnitGroup(g)` (nada muda para os grupos de hoje) e inclua os grupos
       sob demanda já carregados na conta de `stillServed`;
     - `buildingEras(type): Readonly<Record<number, string>> | null` — do índice: `{ [eraBase ?? 1]: type }` mais
       `{ [eraValue]: id }` de cada asset com `eraOf === type` (varra `manifest.assets` uma vez e guarde num `Map` até a
       próxima geração); `null` se o tipo não tem cópias;
     - `buildingReady(id): boolean` — o grupo do asset está pronto na escala pedida ou na outra: leia
       `this.atlas.status(grupo, escala) === 'ready'` direto (**não** use `served()`, que pede o carregamento);
     - `ensureEras(eras: Iterable<number>)` — pede `buildings_e<n>` na escala de `scaleFor`; `ensureWonders()` idem
       para `wonders`;
     - `releaseEras(inUse: Iterable<string>, now: number, graceS = RELEASE_GRACE_S): string[]` — guarda a última vez
       em que cada grupo sob demanda teve um id em uso; depois de `graceS` s de jogo sem uso, `unloadGroup` e devolve
       os grupos liberados (mesmo padrão de `releaseUnused`);
     - `unitId(type, heads = 1, era = 0)` → `unitArtId(type, …, heads, era)`.
  *Conferir:* `npm run -s typecheck`; `npx vitest run tests/art-library.test.ts` (sem mudança de comportamento).
- [ ] **B4. `BuildingView.ts`.** `readonly type` continua (o tipo do núcleo); acrescente `artId: string` (inicial =
  `type`) e `era = 1`; `show()` usa `this.artId` em `this.lib.building(...)`; e
  ```ts
  /** Troca o asset (outra Era): o próximo show() refaz o quadro mesmo com o mesmo estado/variante. */
  setArt(id: string, era: number): boolean {
    if (id === this.artId) return false;
    this.artId = id; this.era = era; this.state = ''; this.variant = null; this.maskVersion = -1;
    return true;
  }
  ```
- [ ] **B5. `renderer.ts`, edifícios.** No ramo `if (v.bld)` de `updateEntities` (procure `const art = this.art.buildingArt(`):
  1. Mova a linha `const live = this.liveToLocal(state, ui.localPlayer, b) || v.bld.state === '';` para **antes** de
     `const art = …` e troque `const art = this.art.buildingArt(b.type);` por:
     ```ts
     if (live) {
       const t = buildingArtType(b.type);
       const id = buildingEraId(t, this.art.buildingEras(t), buildingArtEra(state, b.owner), this.bldReady);
       const changed = v.bld.setArt(id, buildingArtEra(state, b.owner));
       if (changed && v.artSeen && v.complete) this.fx.eraChange(v.bld);   // poeira só na troca, não na criação
       v.artSeen = true;
     }
     const art = this.art.buildingArt(v.bld.artId);
     ```
     com o campo `private readonly bldReady = (id: string): boolean => this.art.buildingReady(id);` na classe (nada de
     função nova por quadro) e `artSeen?: boolean` na vista (`EntityView` no renderer). `buildingArtType` é o alias
     da E2 (depois do Bloco L ele devolve o próprio tipo).
  2. A variante: tire a linha `if (art?.variantBy === 'ageTier') variant = ageTier(...)` (nenhum asset usa mais) —
     **mantenha** a função `ageTier` em `logic.ts` e o valor em `VARIANT_BY` (dados antigos e testes).
  3. `v.bld.showGlow(... this.art.building(v.bld.artId, GLOW_ANIM, ...))` e o resto que usa `b.type` para pedir quadro
     passam a usar `v.bld.artId`.
  4. Pré-carga: a cada 2 s de relógio de jogo (use o mesmo relógio de `releaseUnusedArt`), `this.art.ensureEras(erasInPlay(state, local))`;
     e `this.art.ensureWonders()` quando (a) algum edifício do estado tiver o asset no grupo `wonders` (índice:
     `assets[tipo].group === 'wonders'`) ou (b) o fantasma de construção for de um tipo desse grupo. Até chegar, a
     maravilha sai procedural (o item 6 troca a vista quando o grupo chega).
  5. Liberação: no mesmo ponto em que o renderer chama `releaseUnusedArt`, junte os `artId` de todas as vistas de
     edifício vivas e chame `this.art.releaseEras(ids, gameSeconds)`.
  6. Quando `this.art.eraGen` mudar (compare com um campo `lastEraGen`): para cada vista de edifício **procedural**
     (`!v.bld`) cujo tipo agora tem arte (`this.art.buildingArt(...) !== null`), destrua a vista (o `getView` a refaz
     assada no próximo quadro), do mesmo jeito que o renderer já faz quando `unitGen` muda (procure `unitGen`).
- [ ] **B6. Fantasma, desabamento e escombros.**
  1. Fantasma (procure `variantBy === 'ageTier' ? ageTier(state.players[local]` perto da linha do `pickVariant` do
     fantasma): o asset do fantasma é `buildingEraId(tipo, eras, playerArtEra(state, local), ready)` e a variante sai
     do `art` desse asset (`pick`/bitmask como hoje; sem o ramo `ageTier`).
  2. `RecentGone` (procure `RecentGone` no renderer): grave `artId` da vista ao sumir; em `src/render/fx/types.ts`
     acrescente em `FxHost` `goneArt?(id: number): string | null`; o renderer implementa devolvendo o `artId`
     guardado; `src/render/fx/handlers/collapse.ts` usa `host.goneArt?.(id) ?? tipo` no lugar do tipo ao pedir o
     quadro `damage2` do desabamento. Escombros (`rubble/<w>x<h>`) não mudam.
- [ ] **B7. Unidades por Era.** Onde o renderer calcula o asset da unidade (`this.art.unitId(u.type, heads)` em
  `getView`/`makeBakedView`/`releaseUnusedArt`/`warmUnits`): passe `unitArtEra(state, u)` como `era`. Uma unidade cujo
  asset mudou (o cidadão quando a Era sobe) tem a vista refeita: compare o id calculado com o da vista e, se diferente,
  destrua a vista (como na troca de variante da hidra: `grep -n "heads" src/render/renderer.ts`).
  Pré-carga (`warmUnits`, D23): para cada linha (`LINE_ORDER`) com `unitLinesOn(state)`, `lineUnitOf(jogador local, linha)`;
  mais os tipos presentes no estado; mais `warmUnitTypes(UNITS, Era local)` filtrado para tipos sem `line`; e o id de
  `unitArtId` na Era local para `villager`, `fishing_boat`, `transport_ship`, `merchant_ship`.
- [ ] **B8. Testes do bloco** (`tests/art-eras.test.ts`, parte "renderizador"; seção "Testes"). Faça um teste com o
  `FakeAtlas` de `tests/art-collect.test.ts` (copie o `vi.mock`) para `ensureEras`/`releaseEras`/`eraGen`.
  *Conferir:* `npx vitest run tests/art-eras.test.ts tests/art-library.test.ts tests/art-collect.test.ts tests/art-release.test.ts tests/render-pick.test.ts`,
  `npm run -s typecheck`, `npm run build`, e no preview uma partida de 2 min com a arte assada: igual à de antes
  (compare `node scripts/actionshot.mjs http://localhost:4173/ scratch/e8/b8.png` com `scratch/e8/antes/acao.png`
  olhando as duas).

### Bloco C — Kit de Era no rig de edifícios (2 dias)

- [ ] **C1. Materiais.** `PALETTE` e `createMaterials` com a seção 2 de "Dados prontos" (no FIM); em
  `scripts/bake/page/bake.js`, a lista do reflexo de ambiente (`for (const k of ['bronze', … 'fleece'])`) ganha
  `'castIron', 'steel'` no fim.
  `scripts/bake/page/buildings-textures.js`: geradores novos `genBrick` (fiadas 0,065 m de altura, junta 8 mm mais
  clara, variação de cor ±8 % por tijolo), `genThatch` (fibras verticais em camadas, 3 tons), `genSlate` (placas
  0,3 × 0,2 sobrepostas, bordas escuras), `genConcrete` (ruído fino + marcas de forma horizontais a cada 0,6 m) no
  mesmo padrão dos de hoje (`genAshlar` como modelo); `KINDS` + `brick`, `thatch`, `slate`, `concrete`; `TEXTURED`:
  `thatch/thatchDark: ['thatch', false]`, `mudbrick/mudbrickDark/render/renderDark/stucco/stuccoDark: ['plaster', true]`,
  `brick/brickDark/brickLight: ['brick', true]`, `slate/slateDark: ['slate', false]`, `concrete/concreteDark: ['concrete', true]`
  (acrescente no fim do objeto).
  `buildings.js`: `WALL_MATS` + `'mudbrick','mudbrickDark','brick','brickDark','brickLight','render','renderDark','stucco','stuccoDark','concrete','concreteDark'`;
  `ROOF_MATS` + `'thatch','thatchDark','slate','slateDark'`.
- [ ] **C2. `rigs/buildings-era.js`** com o código da seção 3 + `eraDress` (descrição na seção 3).
- [ ] **C3. `buildBuilding` com a Era.**
  ```js
  export function buildBuilding(THREE, M, style, params = {}) {
    const B = BUILDERS[style];
    if (!B) throw new Error(`edifício desconhecido: ${style}`);
    const info = stateInfo(params);
    const era = Number.isInteger(params.era) ? params.era : 1;
    const own = Array.isArray(B.eraOwn) ? B.eraOwn.includes(era) : false;
    const V = eraView(M, era, own);
    const k = makeKit(THREE, V, seedOf(`${style}/${B.seedIgnoresVariant ? '' : params.seedVariant ?? params.variant ?? ''}/${info.state}/${params.w ?? ''}x${params.h ?? ''}`));
    k.M0 = M; k.era = era; k.eraKit = own ? eraKit(1) : eraKit(era);
    B(k, { ...params, ...info, stage: info.stage });
    if (info.stage === 3) eraDress(k, B, params);   // pronto, danificado e portão aberto: cúpula/chaminé (nada na Era 1)
    if (info.damage) { k.onDamage?.(info.damage); applyDamage(k, info.damage); }
    texturize(THREE, M, k.group);   // SEMPRE com o M original (os nomes dos materiais)
    return k.group;
  }
  ```
  `eraOwn` é uma propriedade do builder (`BUILDERS.town_center.eraOwn = [0, 1, 2]`, logo depois da função), não do
  manifesto. Em `applyDamage`, troque
  `const { THREE, M, group, rand } = k;` por `const { THREE, group, rand } = k; const M = k.M0 ?? k.M;` só na linha do
  `matName` (o resto continua com `k.M`). Confira o valor de `info.stage` para "pronto" (`grep -n "function stateInfo" -A12 scripts/bake/page/buildings.js`)
  e use o mesmo número.
- [ ] **C4. Telhado e coluna pelo kit.** Em `makeKit`, `k.gable` passa a ler `k.eraKit` (definido em C3; se ausente,
  `eraKit(1)`):
  - `roof === 'tile'`: como hoje, mas `rise × pitch` e `nRows = tileRows` (Era 1: pitch 1 e 7 fileiras = hoje);
  - `roof === 'thatch'`: duas águas sem fileiras, `rise × 1.35`, beiral 0,15 maior, material `M.terracotta` (que na
    Era 0 já é `thatch` pela vista);
  - `roof === 'slate'`: como `tile` com `nRows = 0` e `rise × 1.1`;
  - `roof === 'flat'`: laje (`k.block` de 0,12 de espessura no `y` do beiral) + platibanda de 0,18 em volta; sem frontão;
  - grave `k.roofs.push({ cx, cz, w, len, y, rise })` (para o `eraDress`).
  `k.shed` / `k.shedX` (se existirem; `grep -n "k.shed" scripts/bake/page/buildings.js`) seguem a mesma regra.
  `k.column(x, z, y0, h, rad, mat, capMat)`: por `k.eraKit.column` — `doric` (o de hoje), `post` (cilindro de `M.wood`
  r × 0,7, sem capitel), `corinthian` (capitel em cesto: cone invertido 0,22 de altura + 8 folhas como caixas finas),
  `byzantine` (capitel cúbico afunilado), `tuscan` (dórico sem estrias, base redonda), `iron` (fuste fino r × 0,45 de
  `M.castIron` com capitel de anel), `pillar` (caixa quadrada `rad × 1.8`, sem capitel).
  **Regra de ouro**: com `era === 1`, todo caminho de código tem de ser exatamente o de hoje (mesmas chamadas, mesma
  ordem, mesmos `rand()`), senão a base muda. Não consuma `k.rand()` em ramos que só existem em outras Eras **antes**
  de chamadas que já existiam.
- [ ] **C5. Prova byte a byte da base.** Asse todos os edifícios base num rascunho e compare:
  ```bash
  node scripts/bake/bake.mjs --only buildings --scale 1,2 --out scratch/e8/c5 > scratch/e8/c5.log 2>&1
  node scripts/bake/cache-diff.mjs scratch/e8/cache-antes art/cache --ids academy,barracks,cornucopia,farm,fortress,gate,granary,house,lumber_camp,market,mine,rubble,siege_workshop,stable,temple,titan_gate,tower,wall,wonder_artemis,wonder_colossus,wonder_zeus --alias town_center@a1=town_center,town_center@a0=town_center_e0,town_center@a2=town_center_e2
  ```
  Tem de dar `igual` em tudo. Se algum quadro mudar, o culpado é um `rand()` a mais ou um material trocado na Era 1.
- [ ] **C6. Folha de prova do kit.** Com o CC já com `eras`, asse só ele e olhe a folha de contato de cada Era
  (`scratch/e8/c6/contact/town_center-e*.png` — confira a pasta que o bake grava as folhas no log):
  `node scripts/bake/bake.mjs --only town_center --scale 1 --out scratch/e8/c6`. As 8 têm de ser reconhecíveis pela
  tabela da seção 1. Commit: "E8 C: kit de Era no rig de edifícios (base idêntica)".

### Bloco R — Lote 1, edifícios das Eras I–IV (2 dias)

- [ ] **R1. `eras` nos manifestos.** Para cada linha da tabela 4, acrescente `eras` com a lista **completa** da tabela
  (as cópias 4–7 já saem com o kit genérico; o lote 2 só acrescenta as plantas próprias de V–VIII). Cópias
  com planta própria (`house` na Era 0, `farm`, muralha/portão/torre, `fortress`) leem `p.era` no builder.
  Ligue `B.eraDome`/`B.eraChimney` nos builders da tabela 4. Casa e templo: `eraParams` e `eraNoVariants` (D8); o
  builder procedural `house`/`temple` precisa existir com o nome do estilo (`grep -n "^BUILDERS.house\|^BUILDERS.temple" scripts/bake/page/buildings.js`);
  se o estilo procedural se chamar diferente, use o nome real em `eraParams`.
- [ ] **R2. Plantas próprias das Eras 0 e 3.** Muralha/portão/torre (paliçada; teodosiana), fazenda (vime e sapé),
  casa na Era 0 (cabana redonda: cilindro de adobe r 0,8 + cone de sapé), fortaleza na Era 3 (castelo). Cada planta
  própria é um `if (p.era === n)` no começo do builder que desenha a planta e retorna — **sem** tocar no caminho da
  Era 1. Mantenha o `k.breakable(...)` nas peças que caem no dano e o estandarte de time.
- [ ] **R3. Edifícios novos.** Pedreira (`quarry`: pátio de blocos de calcário cortados, guindaste de madeira de
  3 pernas, galpão), Estaleiro (`shipyard`: carreira inclinada para a água com um casco em obra, galpão de remos,
  guindaste), Poço de nafta (base 3: poço de pedra com sarilho e jarras de betume), Poço de petróleo e Refinaria
  (base 6). Manifestos novos com `size.tiles`/`anchor` copiados de um edifício de mesma pegada (2×2: `granary`; 3×3:
  `market`), os 6 estados, `icon`, e `eras` da tabela 4. Estilos nos arquivos por lote (`buildings-economy.js` para
  Pedreira/poços/Refinaria/Fábrica, `buildings-military.js` para o Estaleiro) e registrados como os de hoje
  (`Object.assign(BUILDERS, ECONOMY_BUILDERS)` já existe).
- [ ] **R4. Bake do lote 1** (base + cópias 0–3; as cópias 4–7 também saem agora, com o kit genérico, e o lote 2 as
  refina):
  ```bash
  node scripts/bake/bake.mjs --only buildings,buildings_e0,buildings_e1,buildings_e2,buildings_e3,buildings_e4,buildings_e5,buildings_e6,buildings_e7 --scale 1,2 --out scratch/e8/lote1-ed > scratch/e8/lote1-ed.log 2>&1
  ```
  Olhe as folhas de contato de **todas** as cópias 0–3 (uma por edifício e Era). Erros típicos: cúpula furando o
  telhado (abaixe o tambor), chaminé fora da casa (use a caixa de telhado certa), cor de time sumida (o remapeamento
  não pode tocar em `team`).
- [ ] **R5. Fusão.** `node scripts/bake/merge-group.mjs scratch/e8/lote1-ed --groups buildings,buildings_e0,buildings_e2,buildings_e3,buildings_e4,buildings_e5,buildings_e6,buildings_e7`
  (não existe `buildings_e1`: a Era 1 é a base). `npm run art:check` sem erros; anote os MB por Era.
- [ ] **R6. Capturas e commit do bloco.** Estenda `scripts/artages.mjs` (passo M2 descreve tudo; aqui só o mínimo):
  `--eras 0,1,2,3` gera `docs/art/e8-cidade-e<n>.png` com `debugSetAge(1, n)` antes de montar a cidade, lendo
  `AGE_OF` de `window.aoe.debugData()` em vez da tabela fixa. Rode, olhe as 4 imagens, tire o `it.skip` do A7, rode
  `npx vitest run tests/art-manifest.test.ts tests/art-library.test.ts tests/art-eras.test.ts`, e faça o commit com
  os PNG: "E8 R: edifícios por Era (lote 1, Eras I–IV)".

### Bloco U — Lote 1, unidades das Eras I–IV (3 dias)

- [ ] **U1. Kit humano.** `human.js`: os valores da seção 6 no fim de cada lista do `KIT`, as chaves novas (`legs`,
  `back`, `toolMetal`, `eraLook`) com o primeiro valor = comportamento de hoje, as peças (uma função por peça, no
  padrão das de hoje), `items.muzzle` nas armas de fogo e `ERA_LOOKS.citizen` (tabela 5) aplicado no começo de
  `buildHuman`: `const P = { …padrões, ...params, ...(params.eraLook === 'citizen' && params.era > 0 ? ERA_LOOKS.citizen[params.era] : {}) };`.
  Os materiais das peças novas: use `M.steel`, `M.khaki`, `M.navy` diretamente (criados no C1). Se uma peça precisa de
  material de time, use `M.team` (nunca uma cor fixa).
  *Conferir:* antes de editar, gere `node scripts/bake/pose-preview.mjs art/manifest/villager.json --anims idle,attack --dirs 0,2,5 --scale 4 --out scratch/e8/u1-antes.png`;
  depois, o mesmo comando com `--out scratch/e8/u1-depois.png` sai igual (olhe as duas; o hoplita idem), e os testes de rig: `npx vitest run tests/art-units-review.test.ts tests/art-heroes.test.ts`.
- [ ] **U2. Poses.** Acrescente em `art/poses/human.json` as poses da seção 7 que o lote 1 usa: `idle_pike`,
  `walk_pike`, `attack_pike`, `aim_sling`, `attack_sling`, `ride_attack_lance`. Confira cada uma com
  `pose-preview.mjs … --anims <anim> --dirs 0,2,5 --scale 4` (olhe: mão na arma, pé no chão).
- [ ] **U3. Cerco do lote 1.** `siege.js`: estilos `trebuchet`, `ram`, `siphon`; pivô `barrel` e escalar `recoil` (no
  `JOINTS`/`SCALARS` exportados, para o teste de poses); poses `*_trebuchet`, `*_ram`, `*_siphon` em `art/poses/siege.json`.
- [ ] **U4. Cavalo.** `horse.js`: `barding` (`scale`: manta de escamas de bronze até o joelho; `plate`: peitoral e
  testeira de aço), `pack: 'mule'` (orelhas 1,6×, crina curta, cangalha com 2 fardos `canvas` e 2 jarras), `rider: false`
  (sem cavaleiro), `tail: 'fish'` + `swim: true` + coat `sea` (hipocampo, Bloco J; só o kit agora), e o escalar
  `tailWave`. `KIT` ampliado no fim de cada lista.
- [ ] **U5. Rig `ship` (`rigs/ship.js`, novo).** Exporte `shipUnit`, `KIT = { style: [...11 estilos da seção 9], rig: ['oar', 'sail', 'steam'], era: [0,1,2,3,4,5,6,7] }`,
  `JOINTS = ['hull', 'oarsL', 'oarsR', 'sail', 'paddle', 'turret']`, `SCALARS = ['oarPhase', 'billow', 'list', 'sink', 'recoil', 'net']`.
  Casco por perfil (`THREE.Shape` do contorno visto de cima extrudado com `bevel`), convés, amurada, esporão de
  `M.bronze` nas galés, olhos pintados na proa (I–III), remos como caixas finas que giram em `oarPhase` (0→1 =
  remada), velas como `PlaneGeometry` curvada por `billow`, flâmula de time no mastro e faixa de time na amurada,
  chaminé/rodas de pás no vapor, torres que giram em `turret` (navios VII–VIII). Linha d'água em y = 0 e recorte
  (`clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)]` em todos os materiais do navio; `renderer.localClippingEnabled = true` em `page/bake.js`).
  Devolva `{ group, pose, feet: [], thin: [], glide: true }` (confira o formato em `rigs/units.js` e no `siegeUnit`).
  Poses em `art/poses/ship.json`: `idle_ship` (balanço `list` ±2°), `row` (8 quadros, remos), `sail` (8 quadros,
  `billow`), `steam` (8 quadros, rodas), `ram_ship` (6), `fire_ship` (8: `recoil` nas baterias), `sink` (6: `list`
  0→25°, `sink` 0→0,8 m). Registre em `units.js` (`UNIT_RIGS`, `DEFAULT_POSES`, `UNIT_KITS`, `UNIT_POSE_KEYS`,
  `RIG_FILES.ship = ['scripts/bake/page/rigs/ship.js']`).
- [ ] **U6. Manifestos do lote 1** (Eras 0–3): `prodromos`, `trapezites`, `phalangite`, `skoutatos`,
  `rhodian_slinger`, `byzantine_archer`, `thureophoros`, `akritas`, `cataphract`, `athanatos`, `trebuchet`,
  `covered_ram`, `greek_fire_siphon` (tabela 8); `merchant`, `caravan` (tabela 8); `fishing_boat`, `transport_ship`,
  `merchant_ship`, `penteconter`, `trireme`, `quinquereme`, `dromon` (tabela 9; dos 3 com `unitVariants`, o U8 assa só
  os valores ≤ 3 — as cópias 4 e 6 estão nos grupos `units_e4`/`units_e6` e saem no H6); `villager` com
  `unitVariants` por Era (tabela 5). Cada manifesto: `stage: 8`, `era` (= `UNITS[id].age`; confira com
  `window.aoe.debugData()` ou `npx tsx -e`), `docs` de uma linha com "glb" (exigido pela validação).
  *Conferir:* `npx vitest run tests/art-manifest.test.ts` (validação + poses existem) e
  `node scripts/bake/pose-preview.mjs art/manifest/<id>.json --anims idle,attack --dirs 0,2,5 --scale 4 --out scratch/e8/<id>.png`
  para cada um, olhando.
- [ ] **U7. Nós da E2 (props).** `props.js`: `case` para `limestone` (afloramento claro com blocos cortados; 3
  estágios), `naphtha` (poça escura irisada com pedras; 1), `oil_field` (terra escura com mancha brilhante; 1),
  `olive_grove` (3 oliveiras baixas em fileira; 1 — não use o nome `olive`, que é espécie de árvore), `vineyard`
  (4 fileiras de videiras em estacas; 1), `paros_marble` (afloramento branco; 3), `salt` (salina branca com montes;
  3), `wild_horses` (3 cavalos selvagens do rig `horse` parados, direções 0/2/4/6), `copper` (rocha verde-azulada; 3),
  `incense` (arbusto de olíbano com resina; 1). `art/manifest/props-nodes.json`: itens com essas variantes.
  `src/render/art/logic.ts`: em `nodeFrameName`, `case 'limestone': case 'paros_marble': case 'salt': case 'copper': return propFrameName(type, amountStage(amount, max));`,
  `case 'naphtha': case 'oil_field': case 'vineyard': case 'incense': return propFrameName(type, 0);`,
  `case 'olive': return propFrameName('olive_grove', 0);` (o nó de oliveiral da E2 se chama `olive`; confira com
  `grep -n "RARE_NODES" -A3 -r src/core/data`), `case 'wild_horses': return propFrameName('wild_horses', animalDir(id));`;
  `nodeStage` devolve `amountStage` para os 4 minerais. `rare_fish` (água) continua procedural (a animação da água fica
  para depois da E8).
- [ ] **U8. Bake e fusão do lote 1 de unidades.**
  ```bash
  node scripts/bake/bake.mjs --only units_e0,units_e1,units_e2,units_e3 --scale 1,2 --out scratch/e8/lote1-un > scratch/e8/lote1-un.log 2>&1
  node scripts/bake/bake.mjs --only props --scale 1,2 --out scratch/e8/lote1-props > scratch/e8/lote1-props.log 2>&1
  node scripts/bake/merge-group.mjs scratch/e8/lote1-un --groups units_e0,units_e1,units_e2,units_e3
  node scripts/bake/merge-group.mjs scratch/e8/lote1-props --groups props
  npm run art:check
  ```
  O `--only units_e3` assa todos os assets do grupo (unidades com `era: 3` e as cópias `_era3`). Se o
  `merge-group` reclamar de um asset faltando no rascunho, ele já foi assado antes: inclua o id no `--only`.
  As cópias de Era > 3 dos barcos/cidadão (grupos `units_e4`, `units_e6`, `units_e7`) entram no lote 2 (H6).
- [ ] **U9. Remova do alias as entradas do lote** (`UNIT_ART_ALIAS` em `src/render/art/alias.ts`) para os ids do U6,
  e as entradas de edifício do R3 (`BUILDING_ART_ALIAS`). Se o procedural (`src/render/textures.ts`) usa a mesma tabela
  para desenhar o tipo, crie antes `UNIT_PROCEDURAL_ALIAS`/`BUILDING_PROCEDURAL_ALIAS` com o conteúdo de hoje e aponte o
  procedural para elas (o procedural continua sendo a reserva com a arte desligada).
  *Conferir:* `npx vitest run tests/art-etapa6.test.ts tests/hud-icons.test.ts` (o teste "nenhum procedural" passa a
  contar os novos: Bloco L ajusta os números; aqui atualize a contagem esperada para o que já está assado).
- [ ] **U10. Capturas e commit.** Crie `scripts/artlines.mjs` (passo M3) com as cenas `roda` e `combate` para
  `--eras 0,1,2,3`; rode, olhe, e commit com os PNG: "E8 U: unidades, navios, cidadão e nós das Eras I–IV".

### Bloco F — Lote 1, maravilhas das Eras I–IV (2 dias)

- [ ] **F1. `rigs/buildings-wonders.js` (novo)** com `export const WONDER_BUILDERS = { wonder_lion_gate: (k, p) => {…}, … }`
  para as 11 do lote 1 (tabela 11), no padrão dos builders de `buildings-military.js` (as 3 maravilhas de hoje são
  o modelo: obra pelo `p.stage` 0–2 com andaime, `k.breakable` nas peças que caem, `k.onDamage` para o dano
  estrutural, estandarte de time). Registre em `buildings.js` com `Object.assign(BUILDERS, WONDER_BUILDERS)` ao lado
  dos outros `Object.assign`.
- [ ] **F2. Manifestos** das 11, com `"atlasGroup": "wonders"` (campo do A1) e sem `eras` (D9).
- [ ] **F3. Bake e fusão.**
  ```bash
  node scripts/bake/bake.mjs --only wonders --scale 1,2 --out scratch/e8/lote1-mar > scratch/e8/lote1-mar.log 2>&1
  node scripts/bake/merge-group.mjs scratch/e8/lote1-mar --groups wonders
  ```
  Olhe as 11 folhas de contato (obra 0–2, pronta, dano 1–2).
- [ ] **F4. Alias, capturas e commit.** Tire as 11 de `BUILDING_ART_ALIAS`; `artages.mjs --only maravilhas` (M2)
  mostra as 20 numa praça; olhe; commit com os PNG: "E8 F: maravilhas das Eras I–IV".
  Anote em `docs/eras/PROGRESSO.md`: "lote 1 pronto; capturas `docs/art/e8-*` aguardando o dono".

### Bloco G — Lote 2, edifícios das Eras V–VIII (2 dias)

- [ ] **G1. Plantas próprias das Eras 4, 6 e 7** (tabela 4): baluarte, torre de canhão, casamata, muralha de
  concreto e o portão de cada uma; forte estrelado, forte de tijolo, forte de concreto; fazenda com moinho e com
  cata-vento; as particularidades da coluna "o que muda além do kit" (silos, castelete, guindaste, galeria de ferro e
  vidro, observatório, garagem, doca seca). Mesma regra do R2 (`if (p.era === n)` e retorno; Era 1 intocada).
- [ ] **G2. Bake, fusão e prova.**
  ```bash
  node scripts/bake/bake.mjs --only buildings,buildings_e0,buildings_e2,buildings_e3,buildings_e4,buildings_e5,buildings_e6,buildings_e7 --scale 1,2 --out scratch/e8/lote2-ed > scratch/e8/lote2-ed.log 2>&1
  node scripts/bake/merge-group.mjs scratch/e8/lote2-ed --groups buildings,buildings_e0,buildings_e2,buildings_e3,buildings_e4,buildings_e5,buildings_e6,buildings_e7
  node scripts/bake/cache-diff.mjs scratch/e8/cache-antes art/cache --ids barracks,granary,house,temple,wall   # base continua igual
  npm run art:check
  ```
  Os grupos 0–3 vêm do cache (não mudaram) e saem idênticos; confira com `git diff --stat public/art` que só os PNG
  de `buildings_e4…e7` mudaram (e `manifest.json`).
- [ ] **G3. Capturas e commit.** `artages.mjs --eras 4,5,6,7`; olhe; commit com os PNG: "E8 G: edifícios por Era
  (lote 2, Eras V–VIII)".

### Bloco P — Efeitos de pólvora, motor, vapor e chaminés (2 dias)

- [ ] **P1. Atlas `fx`.** `scripts/bake/fx/catalog.mjs`: em `FX_PROJECTILES` acrescente `bullet`, `shell`, `grenade`
  (seção 12) e a família `flash` (4 quadros) em `fxItems`. `npm run art:fx -- --contact docs/art` e olhe a folha.
  `tests/fx-atlas.test.ts` tem a lista ordenada de nomes/tamanhos: atualize com os novos (confira a saída do teste).
- [ ] **P2. Escolha do projétil.** Em `src/render/fx/logic.ts`, `PROJECTILE_KINDS` ganha `'bullet', 'shell', 'grenade'`
  e a função que escolhe o tipo de projétil pela unidade (procure onde `'arrow'`/`'javelin'`/`'stone'` são escolhidos:
  `grep -n "'javelin'" src/render/fx/*.ts src/render/fx/handlers/*.ts`) passa a chamar, **antes** das regras de hoje:
  ```ts
  /** E8: projétil das armas de fogo (tag 'gunpowder', E3) e da funda ródia. null = regras de antes. */
  export function gunpowderProjectile(def: { id: string; tags: readonly string[]; attackType?: string; splash?: number }): ProjectileKind | null {
    if (def.id === 'rhodian_slinger') return 'stone';
    if (!def.tags.includes('gunpowder')) return null;
    const heavy = def.tags.includes('siege') || def.tags.includes('ship') || def.tags.includes('mechanical');
    if (def.attackType === 'crush') return (def.splash ?? 0) > 0 && !heavy ? 'grenade' : 'shell';
    return 'bullet';
  }
  ```
  (confira o nome do campo de área nos dados da E3: `grep -n "splash\|area" src/core/types.ts | head`). `arcHeight`:
  `bullet` 0, `shell` 0,16, `grenade` 0,45. Navios de guerra a vela/vapor (`galleon`…`battleship`) têm a tag
  `gunpowder`? Se não tiverem, acrescente a regra `def.tags.includes('ship') && UNITS[id].age >= 4 → 'shell'` aqui
  mesmo (não mexa nos dados).
  Jato de fogo (`greek_fire_siphon`, `dromon`, `lampad`, marcados `fire` nas tabelas 8–10): se `PROJECTILE_KINDS` não
  tiver `fire`, use o efeito do sopro da Quimera da Etapa 5 (`grep -n "chimera" src/render/fx/handlers/*.ts src/render/fx/*.ts`)
  saindo da boca/proa na direção do alvo; não crie um projétil novo para isso.
- [ ] **P3. Clarão, fumaça de pólvora e explosão** (seção 12) em `projectile.ts` e `recipes.ts`; o ponto de boca vem
  de `UnitArt.muzzles?.[dir]` (campo novo, lido do índice como `tops`; se ausente, 0,6 tile à frente na direção).
  O grupo de orçamento `gunsmoke` entra no `particles.ts` com teto de 18 % do orçamento do preset e prioridade
  "combate" (a mesma dos golpes).
- [ ] **P4. Motor, vapor, esteira e chaminés** (seção 12) em `unitFx.ts` (tabela `STACKS` por estilo de navio:
  offset da chaminé em tiles na direção 0, girado pela direção da vista) e `rules.ts` (`WORK_SMOKE` com
  `{ type, minEra: 6, kind: 'stack', at: CHIMNEY_AT[type] }`; a função `workSmokeOn` recebe a Era da vista e só
  solta a fumaça de chaminé com `era >= minEra`).
- [ ] **P5. Poeira da troca de Era**: `FxSystem.eraChange(view: BuildingView)` (seção 12; usado no B5).
- [ ] **P6. Registro e testes.** `tests/fx-registry.test.ts` varre o núcleo atrás de tipos de efeito sem handler: os
  novos são do renderizador, então só confira que o teste continua verde; acrescente em `tests/fx-logic.test.ts`
  (existe) os casos de `gunpowderProjectile` da seção "Testes".
- [ ] **P7. Áudio (D30).** `src/audio/events.ts`, `deathRecipe`: `if (def.tags.includes('mechanical') || def.cls === 'ship') return 'treeFall';`
  antes das regras de cavalo (confira se a E4 já pôs o de navio).
- [ ] **P8. Capturas e commit.** `node scripts/artfx.mjs http://localhost:4173/ --only combate` com uma cena nova
  `tiro` (mosqueteiros × hoplitas, canhões × muralha, metralhadora, tanque andando, couraçado a vapor): estenda o
  `artfx.mjs` com `--only tiro` gerando `docs/art/e8-tiro-z10.png` e `e8-tiro-z22.png`; falha se não houver
  projéteis `bullet`/`shell` em voo, clarão ou fumaça de pólvora (use os contadores de diagnóstico que o `artfx.mjs`
  já lê; acrescente `projCounts` por tipo no `FxSystem.stats()`). Commit: "E8 P: efeitos de pólvora, motor, vapor e chaminés".

### Bloco H — Lote 2, unidades das Eras V–VIII (4 dias)

- [ ] **H1. Poses de arma de fogo** (seção 7): `idle_gun`, `walk_gun`, `aim_gun`, `attack_gun`, `idle_mg`, `walk_mg`,
  `aim_mg`, `attack_mg`, `attack_grenade`, `attack_saber`, `ride_aim_carbine`, `ride_attack_carbine`, `ride_moto`,
  `ride_moto_attack`. Olhe cada uma no `pose-preview.mjs`.
- [ ] **H2. Cerco de pólvora**: estilos `bombard`, `field_gun`, `howitzer` (poses da seção 7).
- [ ] **H3. Rig `vehicle` (`rigs/vehicle.js`, novo).** `KIT = { style: ['tank', 'spg', 'motorcycle'] }`,
  `JOINTS = ['hull', 'turret', 'barrel', 'wheelL', 'wheelR']`, `SCALARS = ['recoil', 'track']`. Tanque estilo
  1916–1918 (losango baixo de 2,4 × 1,1 m em escala de jogo 1,6 × 0,8 tiles, esteiras envolvendo, torre pequena
  com canhão curto; `paintGreen` com faixa de time), autopropulsada (chassi de tanque com canhão longo em casamata
  aberta), motocicleta com sidecar (o cavaleiro humano aninhado `rider`, `NESTED_HUMAN.vehicle = 'rider'`).
  Esteiras: textura de elos que corre por `track` (0→1 = um passo); a passada sai do `measure.mjs` como a das rodas do
  cerco (`wheels`, `wheelRadius`). Poses em `art/poses/vehicle.json`: `idle_tank`, `roll_tank`, `aim_tank`,
  `fire_tank` (8 quadros, `recoil`), `die_tank` (6: fumaça é efeito; aqui só afunda 0,1 e inclina 8°), idem `spg`,
  `idle_moto`, `roll_moto`, `die_moto`. Registro em `units.js` como no U5.
- [ ] **H4. Manifestos do lote 2** (Eras 4–7): os 28 restantes da tabela 8 (`stradiot`, `hussar`, `mounted_scout`,
  `motorcyclist`, `pikeman`, `grenadier`, `fusilier`, `modern_infantry`, `arquebusier`, `musketeer`, `sharpshooter`,
  `machine_gunner`, `rodelero`, `chasseur`, `light_infantry`, `commando`, `cuirassier`, `dragoon`, `lancer`, `tank`,
  `knight_of_rhodes`, `guard_grenadier`, `evzone`, `sacred_band`, `bombard`, `field_gun`, `howitzer`,
  `self_propelled_gun`) e os navios `galleon`, `ship_of_the_line`, `ironclad`, `battleship` (tabela 9).
- [ ] **H5. Muzzles no índice.** `scripts/bake/measure.mjs` mede `tops`; acrescente `muzzles` (posição de tela do
  `items.muzzle` no quadro 2 de `attack`, por direção, em px relativos à âncora) quando o rig tiver o item; `bake.mjs`
  grava no índice; `ArtLibrary.unit()` lê para `UnitArt.muzzles` (como `tops`).
- [ ] **H6. Bake e fusão do lote 2.**
  ```bash
  node scripts/bake/bake.mjs --only units_e4,units_e5,units_e6,units_e7 --scale 1,2 --out scratch/e8/lote2-un > scratch/e8/lote2-un.log 2>&1
  node scripts/bake/merge-group.mjs scratch/e8/lote2-un --groups units_e4,units_e5,units_e6,units_e7
  npm run art:check
  ```
  Este é o bake mais longo da etapa (dezenas de assets, os navios grandes): deixe em segundo plano e confira o log.
- [ ] **H7. Alias, capturas e commit.** Tire os 32 ids de `UNIT_ART_ALIAS`; `artlines.mjs --eras 4,5,6,7` com as
  cenas `roda`, `combate`, `naval` e `desfile`; olhe; commit com os PNG: "E8 H: unidades e navios das Eras V–VIII".

### Bloco J — Criaturas da E6 e Talos (2 dias)

- [ ] **J1. Rig `bird` (`rigs/bird.js`, novo)**: corpo de ave (tronco ovoide, pescoço em 3 segmentos, cabeça com
  bico curvo), asas de `rigs/wings.js` (reuso), cauda de 5 penas longas; `KIT = { finish: ['phoenix'] }`; poses em
  `art/poses/bird.json`: `idle_bird` (voo parado, 4), `fly_bird` (8), `attack_bird` (6, mergulho), `die_bird` (6:
  cai e vira cinza — a cinza é o quadro final escurecido), `ability_bird` (8, renascer, só se a E6 tiver o renascer:
  `grep -n "rebirth\|phoenix" src/core/sim/*.ts`).
- [ ] **J2. Kits**: `biped.js` acabamentos `satyr`, `empusa`, `lampad`, `harpy`, `erinys`, `talos`; `beast.js`
  `face: 'eagle'` e `'dragon'` + asas + carro de trigo; poses de voo do grifo e do dragão em `scripts/bake/gait.mjs`
  (`node scripts/bake/gait.mjs` regera `art/poses/beast.json`; `node scripts/bake/gait.mjs --check` tem de passar).
- [ ] **J3. Manifestos** (tabela 10; `sizeClass: 'myth'`, `page: 'own'`, `flying` nas voadoras, `era`). Talos pela regra
  da tabela 10.
- [ ] **J4. Bake e fusão.** As criaturas estão nos grupos `units_e4`…`units_e6`: o `merge-group` pede todos os assets
  do grupo no rascunho, então asse os grupos inteiros de novo (as unidades do H vêm do cache, rápido):
  ```bash
  node scripts/bake/bake.mjs --only units_e4,units_e5,units_e6 --scale 1,2 --out scratch/e8/criaturas > scratch/e8/criaturas.log 2>&1
  node scripts/bake/merge-group.mjs scratch/e8/criaturas --groups units_e4,units_e5,units_e6
  ```
- [ ] **J5. Capturas e commit.** `node scripts/artmyth.mjs http://localhost:4173/ --only roda,voo,bestiario --prefix e8`
  (estenda a lista de criaturas do script para ler os tipos `cls: 'myth'` de `debugData()` em vez da lista fixa; o
  bestiário passa a ter 25 + Talos); olhe; commit: "E8 J: criaturas das Eras V–VII e Talos".

### Bloco K — Lote 2, maravilhas das Eras V–VIII (1 dia)

- [ ] **K1.** As 6 do lote 2 em `buildings-wonders.js` (tabela 11) e os manifestos.
- [ ] **K2.** Bake e fusão do grupo `wonders` inteiro (as 11 do lote 1 vêm do cache):
  `node scripts/bake/bake.mjs --only wonders --scale 1,2 --out scratch/e8/lote2-mar > scratch/e8/lote2-mar.log 2>&1 && node scripts/bake/merge-group.mjs scratch/e8/lote2-mar --groups wonders`.
- [ ] **K3.** Tire as 6 do alias; `artages.mjs --only maravilhas`; olhe; commit: "E8 K: maravilhas das Eras V–VIII".

### Bloco L — Ícones, alias e contagens finais (1,5 dia)

- [ ] **L1. Ícones do HUD** (seção 13): entradas novas em `scripts/bake/hud/catalog.mjs` para todos os tipos novos;
  `age/4`, `age/5`, `age/6` com os objetos novos em `hud-objects.js` (`cannon`, `tricorne`, `gear`); estudos por
  degrau. O catálogo não importa TypeScript: gere a lista e cole as entradas (`tech/<id>` → modelo `unit/<degrau>`):
  ```bash
  npx tsx -e "import {LINES,TECHS,evoTechId} from './src/core/data'; for (const [id,l] of Object.entries(LINES)) l.steps.forEach((s,k)=>{ const t=evoTechId(id,k); if (s && TECHS[t] && !l.steps.every((x)=>x===null||x===s)) console.log(t, s); })"
  ```
  Esperado: 50 linhas (43 das linhas de terra da E3 + 7 de `warship` da E4); cidadão, pesca e transporte não aparecem
  (continuam com o ícone da linha). `npm run art:hud -- --contact docs/art` e olhe.
- [ ] **L2. `src/ui/icons.ts`**: ícone de estudo de evolução = `tech/evo_<linha>_<n>` se existir no atlas `hud`,
  senão `tech/evo_<linha>` (cidadão, pesca, transporte); tire `SHIP_ICONS` (os navios usam `unit/<id>`); confira
  `tests/hud-icons.test.ts` (ícone para todo conteúdo) e `tests/hud-text.test.ts`.
- [ ] **L3. Alias vazio.** `UNIT_ART_ALIAS` e `BUILDING_ART_ALIAS` em `src/render/art/alias.ts` ficam `{}` (deixe as
  funções `unitArtType`/`buildingArtType` devolvendo o próprio tipo e um comentário "E8: toda arte é própria; os
  aliases procedurais seguem em UNIT_PROCEDURAL_ALIAS/BUILDING_PROCEDURAL_ALIAS"). Compare com
  `scratch/e8/alias-antes.txt`: nenhum tipo ficou para trás.
- [ ] **L4. Testes de contagem** (seção "Testes"): `tests/art-etapa6.test.ts` passa a exigir arte assada para **todo**
  tipo de `UNITS` (35 + os novos) e de `BUILDINGS`; `tests/art-library.test.ts` (os 21 edifícios → todos); commit:
  "E8 L: ícones por degrau e Era, alias de arte vazio".

### Bloco M — VRAM, desempenho, capturas finais e documentos (2 dias)

- [ ] **M1. Orçamento.** `npm run art:check` e preencha a tabela 14 em `docs/ART.md` §6 e no Apêndice J. Se algo
  passar do teto, aplique a regra da tabela 14 e reasse só o grupo afetado.
- [ ] **M2. `scripts/artages.mjs` completo** (D27): opções `--eras 0,…,7` (padrão: todas), `--campaign` (cidade com
  `config.visualEraMax = 2` e o jogador na Era 3: tem de sair igual à Era 2 — a captura compara os PNG das duas e
  falha se diferirem mais de 1 %), `--only maravilhas` (as 20 numa praça, prontas, + 3 em obra e 2 danificadas).
  `AGE_OF` sai de `debugData()`; os nomes das saídas: `docs/art/e8-cidade-e<n>.png`, `e8-cidade-campanha.png`,
  `e8-maravilhas.png`. Falha se algum edifício sair procedural (o script de hoje já confere; mantenha), se uma cópia
  de Era existir no índice e não for a usada (compare `view.bld.artId` com o esperado por `buildingEraId`), ou se
  faltar a poeira ao trocar a Era (cena extra `troca`: `debugSetAge(1, n + 1)` e conta partículas de poeira).
- [ ] **M3. `scripts/artlines.mjs` (novo)**, no modelo de `scripts/artlote-distancia.mjs` (mesma abertura do
  Chromium, mesmas esperas por tick): opções `[url] [--out docs/art] [--prefix e8-linhas] [--eras 0,…,7] [--only roda,combate,naval,desfile]`.
  Para cada Era: `roda` (cada unidade da Era nas 8 direções, andando), `combate` (as unidades da Era em duas filas
  contra hoplitas de outro time, 20 s de jogo), `naval` (os navios da Era em água, andando e atacando; só nos mapas
  com água: use o tipo de mapa "Ilhas" da E4), `desfile` (fila a zoom 1 e 2,2). Lista de tipos de `debugData()`
  (`age === era`, sem `myth`/`hero`). Saídas `docs/art/e8-linhas-e<n>-{roda,combate,naval,desfile}-z{10,22}.png`.
  Falha se: algum tipo sair procedural; quem anda não andar nas 8 direções; quem atira não tocar `aim` e `attack`;
  o projétil de uma unidade de pólvora não for `bullet`/`shell`/`grenade`; um navio andando não soltar esteira; um
  navio a vapor não soltar fumaça; um tanque andando não soltar fumaça de motor.
- [ ] **M4. `scripts/artparade.mjs`**: a lista dos 19 tipos da Etapa 4 vira "todos os tipos não míticos de
  `debugData()`" na cena `roda` e `desfile`; o resto igual. Rode e olhe.
- [ ] **M5. Desempenho.** `node scripts/renderperf.mjs http://localhost:4173/ 20 --quality medium` e o mesmo com 40;
  critério: VRAM residente ≤ 120 MB (20 min) e ≤ 160 MB (40 min) no Médio; ms/quadro no máximo 10 % acima do
  `scratch/e8/antes/perf20.txt`. `node scripts/rendercpu.mjs http://localhost:4173/ --battle 100 --label e8` com
  linhas de pólvora: partículas abaixo do orçamento. Grave os JSON em `docs/perf/`.
- [ ] **M6. Regressões visuais.** `npm run art:shot` e `npm run art:diff`: as referências (Era II, preset Baixo) têm de
  continuar dentro dos 2 % — a arte base não mudou. Se o diff acusar só por causa de nós novos ou de efeitos, olhe e,
  se estiver certo, atualize as referências (`docs/art/ref/`) com nota no commit.
- [ ] **M7. Documentos** (seção "Ao terminar").

## Testes a escrever ou atualizar

| Arquivo | O que testar |
|---|---|
| `tests/art-eras.test.ts` (novo) — manifesto | (1) `expandEraVariants` num manifesto falso `{ id: 'x', kind: 'building', source: { type: 'param', rig: 'building', params: { style: 'barracks' } }, eras: [0, 3], eraParams: { '*': { a: 1 }, '3': { a: 2, glb: null } }, icon: {…} }` → ids `['x', 'x_e0', 'x_e3']`; `params.era` 1/0/3; `atlasGroup` `undefined`/`buildings_e0`/`buildings_e3`; `eraOf === 'x'` nas cópias; cópias sem `icon`; `params.a` 1 na e0 e 2 na e3; `glb` ausente na e3 (o `null` apaga); com `eraNoVariants` as cópias não têm `variants`/`variantBy` e o base tem. (2) `validateManifest` recusa: `eras` com a Era base, repetida, fora de 0–7; `eras` em `wonder_parthenon`, `titan_gate`, `cornucopia`; chave de `eraParams` fora de `eras`; `unitVariants.by: 'era'` com valor 8. (3) Manifestos reais (`loadManifests`): para cada edifício de `BUILDINGS` sem `wonder`/`titan_gate`/`cornucopia`, `eras` é exatamente `[0..7]` sem a base e sem as menores que `age` (D10) — menos `wall`/`gate`/`tower` = `[0, 3, 4, 7]`, `fortress` = `[3, 4, 6, 7]`, `farm` = `[0, 4, 6]` e `naphtha_well` = `[4, 6]`; `town_center` sem `variants`. (4) Toda unidade de manifesto com `era` tem `era === UNITS[id].age`; `villager`, `fishing_boat`, `transport_ship`, `merchant_ship` com os `values` da D12. (5) `atlasGroupOf` e `matchesOnly` (`--only buildings` não pega cópia nem maravilha nova; `--only town_center` pega o base e as 7 cópias). |
| `tests/art-eras.test.ts` — lógica | (6) `buildingEraId` com `{1:'x', 0:'x_e0', 3:'x_e3', 6:'x_e6'}` e tudo pronto: Era 0 → `x_e0`, 1 → `x`, 2 → `x`, 3 → `x_e3`, 5 → `x_e3`, 7 → `x_e6`; com `x_e3` não pronto, Era 5 → `x`; `eras = null` → o tipo; base 3 (`{3:'n', 4:'n_e4', 6:'n_e6'}`) com Era 2 → `n`. (7) `unitArtId` por Era: `ids {0:'villager', 1:'villager_era1', 3:'villager_era3', 4:'villager_era4', 6:'villager_era6', 7:'villager_era7'}` → Era 2 → `villager_era1`, 5 → `villager_era4`, 0 → `villager`; `heads` da hidra continua igual. (8) `unitArtEra` num estado de verdade (use o mesmo criador de estado dos testes de hoje: `grep -ln "createGame\|newGame" tests/*.test.ts | head -3`): cidadão com Era 5 e só `evo_citizen_2…4` estudados → limitado pelo primeiro estudo que falta; `fishing_boat` na Era 6 sem `evo_fishing_7` → 5, com → 6; `config.visualEraMax = 2` e Era 3 → 2; `hoplite` (linha que troca de tipo) na Era 7 → 7. (9) `erasInPlay`: dois jogadores nas Eras 2 e 4, local = o da Era 2 → `[2, 3, 4]`; com `visualEraMax: 2` → `[2]`. |
| `tests/art-eras.test.ts` — biblioteca | (10) Com o `FakeAtlas` de `tests/art-collect.test.ts` (copie o `vi.mock`): `ensureEras([3])` pede `buildings_e3` na escala do preset; a chegada (`onChange('era')`) sobe `eraGen` e **não** `generation`; `buildingReady('x_e3')` é false enquanto carrega e **não** pede o carregamento; `releaseEras([], t)` só libera depois de 20 s de jogo sem uso. (11) `BuildingView.setArt`: mesmo id → false; id novo → true, `state === ''`, e o `show` seguinte pede o quadro do id novo (lib falsa que registra as chamadas). |
| `tests/fx-logic.test.ts` (existe) | `gunpowderProjectile`: `musketeer` → `bullet`; `grenadier` → `grenade`; `field_gun` → `shell`; `tank` → `shell`; `galleon` → `shell`; `rhodian_slinger` → `stone`; `toxotes` → `null`. `arcHeight('bullet') === 0`. |
| `tests/art-manifest.test.ts` | linha do CC (A7); orçamento: `r.stats.vramWorstMatch[s] ≤ BUDGET.maxVramMB × s²` e cada `vramByEra[s][n] ≤ BUDGET.maxEraVramMB × s²` no lugar do `vramByScale`; o teste do índice passa a usar `loadAssets(MANIFEST_DIR)` (com as cópias) para conferir que **toda** cópia está no índice com as animações. |
| `tests/art-library.test.ts` | o teste dos 21 edifícios vira "todo tipo de `BUILDINGS` tem arte assada no seu grupo" (`passOf(asset.group, …)`), mais "toda cópia `_e<n>` está no grupo `buildings_e<n>`" e o CC por `eraOf`; o teste de `warmUnitTypes` continua; acrescente que, com linhas, a pré-carga da Era 5 inclui `lineUnitOf` de cada linha. |
| `tests/art-etapa6.test.ts` | "nenhum procedural": **todo** tipo de `UNITS` sai assado a 1× (e a 2× se o manifesto tiver) com a ArtLibrary de verdade sobre os atlas; as variantes por Era do cidadão e dos barcos também; silhuetas: as 16 de hoje mais as 9 criaturas novas ≥ 36 % entre si (se um par falhar, mude o modelo, não o limite). |
| `tests/fx-atlas.test.ts` | lista ordenada de nomes/tamanhos com `proj/bullet/*`, `proj/shell/*`, `proj/grenade/*`, `flash/*`. |
| `tests/hud-icons.test.ts` | ícone para todo conteúdo (os novos), `tech/evo_<linha>_<n>` para todo estudo de evolução de linha que troca de tipo, `age/0…7`; `SHIP_ICONS` não existe mais. |
| `tests/fx-registry.test.ts`, `tests/render-pick.test.ts`, `tests/art-release.test.ts`, `tests/art-collect.test.ts` | sem mudança; têm de continuar verdes (o pick pelo alfa funciona com as cópias; a liberação das páginas próprias vale para os navios e criaturas novos). |

## Verificação

Na ordem, depois do último bloco (e as partes que couberem no fim de cada bloco):

1. `npm run -s typecheck` — sem erros.
2. `npx vitest run tests/art-eras.test.ts tests/art-manifest.test.ts tests/art-library.test.ts tests/art-etapa6.test.ts tests/art-collect.test.ts tests/art-release.test.ts tests/fx-logic.test.ts tests/fx-atlas.test.ts tests/fx-registry.test.ts tests/hud-icons.test.ts tests/hud-text.test.ts tests/render-pick.test.ts`
   — tudo verde.
3. `npm test` — verde. Se sair com código 1 por "RPC timeout"/"onTaskUpdate" sem teste falhando, rode o arquivo
   citado sozinho (`npx vitest run <arquivo>`); se passar sozinho, é o tropeço conhecido do vitest, anote no commit.
4. `npm run art:check` — sem erros; anote PNG total (≤ 500 MB), MB por Era (≤ 40 a 1×) e pior caso (≤ 260 a 1×).
5. `npm run smoke 20 42 > scratch/e8/depois-smoke.txt && diff <(grep -i hash scratch/e8/antes/smoke.txt) <(grep -i hash scratch/e8/depois-smoke.txt)`
   — **nenhuma** diferença (a E8 não toca no núcleo, D29).
6. `npm run balance 35 1,2,3`, `npx tsx scripts/missions.ts` e `npx tsx scripts/maps/fairness.ts …` — **não se
   aplicam** (nada mudou no núcleo; o passo 5 prova). Não rode.
7. `npm run build` e `npm run preview` (porta 4173) em segundo plano.
8. Playtests: `node scripts/playtest.mjs` (partida rápida), `node scripts/playtest-campaign.mjs` (missões com a
   aparência até a Helenística), `node scripts/playtest-options.mjs` (arte assada liga/desliga, preset Alto/Baixo),
   `node scripts/playtest-noemoji.mjs http://localhost:4173/` (nenhum ícone vazio com os ícones novos) — todos
   passam.
9. Capturas (olhe cada PNG novo com Read):
   - `node scripts/artages.mjs http://localhost:4173/ --prefix e8-cidade` (as 8 Eras, `--campaign` e `--only maravilhas`);
   - `node scripts/artlines.mjs http://localhost:4173/` (as 8 Eras, as 4 cenas);
   - `node scripts/artparade.mjs http://localhost:4173/ --prefix e8`;
   - `node scripts/artmyth.mjs http://localhost:4173/ --prefix e8 --only roda,voo,bestiario`;
   - `node scripts/artfx.mjs http://localhost:4173/ --only tiro,combate,queda,desabamento`;
   - `node scripts/artcity.mjs http://localhost:4173/`, `node scripts/artcity-economia.mjs http://localhost:4173/` e
     `node scripts/artmilitary.mjs http://localhost:4173/` — continuam passando (a Era II não mudou).
   Todos terminam sem "procedural", sem direção faltando e sem efeito faltando.
10. `npm run art:shot && npm run art:diff` — dentro dos 2 % (a base é a de hoje).
11. `node scripts/renderperf.mjs http://localhost:4173/ 20 --quality medium` e `… 40 --quality medium` — VRAM residente
    ≤ 120 MB e ≤ 160 MB; ms/quadro até 10 % acima do "antes". `node scripts/rendercpu.mjs http://localhost:4173/ --battle 100 --label e8`
    — partículas dentro do orçamento (200/800/2 000). JSON em `docs/perf/`.

## Critérios de pronto

- [ ] `UNIT_ART_ALIAS` e `BUILDING_ART_ALIAS` vazios; todo tipo de `UNITS` e `BUILDINGS` sai assado (teste de
  `art-etapa6` e de `art-library`).
- [ ] Os 21 edifícios de hoje saem **byte a byte** iguais na Era II (`cache-diff` com `igual`), o CC nas Eras I/II/III
  igual ao `a0/a1/a2` de antes, e o `art:diff` dentro de 2 %.
- [ ] As 8 Eras reconhecíveis nas capturas `docs/art/e8-cidade-e<n>.png` (a tabela 1 descreve o que ver); muralha,
  torre, fortaleza e fazenda com a evolução de função; a campanha (`e8-cidade-campanha.png`) igual à Era III.
- [ ] Ao avançar de Era, os edifícios do jogador trocam com poeira; os do inimigo sob a névoa não trocam.
- [ ] Cidadão em 6 aparências, barcos em 3, navios de guerra com remos/velas/vapor e esteira, tanque com fumaça de
  motor, armas de fogo com mira, clarão, fumaça e bala/obus/granada.
- [ ] 9 criaturas novas e o Talos assados; 17 maravilhas novas assadas (20 no total na praça das maravilhas).
- [ ] `art:check`: PNG ≤ 500 MB, cada Era ≤ 40 MB a 1×, pior caso ≤ 260 MB a 1×; `renderperf` ≤ 120/160 MB.
- [ ] Hash do `smoke 20 42` igual ao de antes; `SIM_VERSION` igual.
- [ ] `typecheck`, testes, playtests e scripts de captura verdes; documentos atualizados; commits feitos.

## Armadilhas

- **Nunca rode `npm run art:bake` sem `--out`**: ele refaz `public/art` só com o que está no cache, e o cache do
  contêiner não tem as 35 unidades de hoje. Sempre rascunho + `merge-group --groups <lista>`.
- **`merge-group` exige o grupo inteiro no rascunho.** Para trocar um asset de `units_e5`, asse `--only units_e5`
  (os outros vêm do cache). Os grupos `units` (as 35 de hoje) e `icons` não são reassados na E8.
- **O `manifest.mjs` entra no hash de todo edifício**, e `human.js`/`materials.js` no de toda unidade: qualquer edição
  invalida o cache desses assets. É esperado; só não confunda "reassou" com "mudou" — a prova de que não mudou é o
  `cache-diff`.
- **Ordem de criação dos materiais**: material novo só no FIM de `createMaterials` (o id do material decide a ordem de
  desenho no three; trocar a ordem muda os edifícios de hoje).
- **A vista de materiais é `Object.create(M)`**: `Object.entries(V)` só vê as chaves trocadas. `applyDamage` e
  `texturize` usam o `M` original (`k.M0`), senão o dano não acha as paredes e a textura sai errada (mármore em cima de
  tijolo).
- **Era 1 tem de seguir exatamente o código de hoje**: nada de `k.rand()` novo antes de chamadas antigas, nada de
  peça nova na Era 1, `ERA_REMAP[1] = {}` e `eraView` devolvendo o próprio `M`. A Era **não** entra na semente.
- **Névoa**: a troca de asset (`setArt`) só com o edifício vivo para o jogador local; senão o avanço de Era do inimigo
  vaza pela aparência dos edifícios vistos sob a névoa.
- **Campanha**: sempre `visualEra(age, config.visualEraMax)`, nunca `age` direto, para edifícios **e** unidades (o
  cidadão também), e na pré-carga (`erasInPlay`).
- **`buildingReady` não pode pedir carregamento**; quem pede é `ensureEras` (pré-carga) — senão toda consulta liga
  todos os grupos e a VRAM estoura.
- **Vista de unidade refeita a cada quadro**: se o id calculado (`unitArtEra` → `unitArtId`) oscilar, a vista é
  destruída sem parar. A Era da unidade só muda com estudo ou avanço; confira com um log temporário se nada pisca.
- **O cidadão base continua no grupo `units`**: não ponha o campo `era` no `villager.json` (moveria o base para
  `units_e0` e exigiria reassar o grupo `units` inteiro). Só as cópias vão para `units_e<n>`.
- **Nome `olive`**: é espécie de árvore nos props (`olive/<variante>/<porte>`); o nó de oliveiral usa o quadro
  `olive_grove/0`.
- **Ids da E6 e o Talos**: confira os ids reais antes de criar os manifestos das criaturas; se a E6 criou `talos`
  como unidade, não crie a variante do Colosso.
- **Navios**: sem `renderer.localClippingEnabled = true` na página do bake, o casco abaixo da linha d'água aparece; o
  `mirror: true` espelha as direções E/SE/NE — nada de letra ou número pintado no casco.
- **Canal de Corinto é passável**: a ponte não pode passar de 0,6 tile de altura, senão cobre as unidades que andam por
  cima (a ordem de desenho é pela linha de base do edifício).
- **PNG no git**: cada rebake de um grupo troca os PNG dele. Commit dos PNG só no fim de cada bloco de arte, depois das
  capturas olhadas; nunca um commit por tentativa.
- **Bake longo em primeiro plano** trava a sessão: sempre em segundo plano com log.
- **Não mexa em `src/core`**: nem para "facilitar" uma captura (use os ganchos `debug*` do `main.ts`).
- O vitest às vezes sai com código 1 por timeout de RPC sem teste falhando: rode o arquivo sozinho antes de procurar
  um bug.

## Ao terminar

1. **`docs/eras/PROGRESSO.md`**: na tabela (`| Etapa | Estado | Data | Commit | Notas |`), a linha da E8:
   `| E8 | concluída | <dd/mm/aaaa> | <hash curto> | kit de Era (8 roupas, 111 cópias), 54 unidades/navios, 9 criaturas + Talos, 17 maravilhas, efeitos de pólvora; PNG <X> MB, pior caso <Y> MB a 1×; capturas docs/art/e8-* aguardando o dono |`.
   Durante a etapa, anote ali também o fim do lote 1 (Bloco F) e do lote 2 (Bloco K).
2. **`docs/ROADMAP.md`**: marque a E8 como concluída (semanas 13–18) e deixe "Aprovar as capturas de cada Era" como
   pendência do dono.
3. **`docs/ART.md`**: Apêndice J (E8) com as decisões D1–D30 resumidas, a tabela de Eras, o orçamento medido (§6) e os
   números ajustados durante a etapa.
4. **`CLAUDE.md`**: em "Comandos", `node scripts/artlines.mjs http://localhost:4173/ [--eras 0,…,7] [--only roda,combate,naval,desfile]`,
   as opções novas do `artages.mjs` (`--eras`, `--campaign`, `--only maravilhas`) e
   `node scripts/bake/cache-diff.mjs <cache antigo> <cache novo> --ids … [--alias velho@variante=novo]`; em "Memória do
   projeto → Visual", um parágrafo curto: "E8 (arte por Era): kit de Era no rig de edifícios (`rigs/buildings-era.js`,
   cópias `<id>_e<n>` em grupos `buildings_e<n>` sob demanda), unidades por Era em `units_e<n>`, rigs `ship`/`vehicle`/`bird`,
   maravilhas em `rigs/buildings-wonders.js` (grupo `wonders`), pólvora pela tag `gunpowder`; a campanha limitada pela
   `visualEraMax`". Em "Convenções": "nunca `art:bake` sem `--out`; fundir com `merge-group --groups`".
5. **Commit** em português, com o rodapé de atribuição que a sessão indicar (as linhas `Co-Authored-By` e
   `Claude-Session` da mensagem de sistema), por exemplo:
   ```
   E8: arte por Era (edifícios, unidades, navios, criaturas, maravilhas e efeitos)

   Kit de Era no rig de edifícios (8 aparências, base idêntica byte a byte), cópias por Era em grupos sob demanda,
   54 unidades e navios novos, 9 criaturas e o Talos, 17 maravilhas, efeitos de pólvora/motor/vapor/chaminé,
   ícones por degrau. Nada muda no núcleo (smoke 20 42 com o mesmo hash).

   <rodapé de atribuição da sessão>
   ```
   Não faça push sem o dono pedir.
