# E8 — Arte por Era (kit de Era nos edifícios, unidades novas, navios, criaturas, maravilhas e efeitos)

- Estado: pendente · Pré-requisitos: E1, E2, E3, E4, E5, E6 e E7 concluídas (na ordem oficial o resto da E9 — guia E9-E10 — vem depois da E8; o painel e a árvore da E9 já entraram com a E1) · Estimativa: 29 dias de agente (infraestrutura + lote 1, Eras I–IV: 13,5 dias; lote 2, Eras V–VIII: 15,5 dias, com a arte própria dos 9 poderes da E6 e os ícones/retratos que a E6 deixou provisórios; cabe nas 6 semanas — 30 dias úteis — da E8 em `docs/ROADMAP.md`, semanas 13–18)

> **Antes de começar:** leia `docs/eras/LEIA-ME.md` (rotina de cada sessão, regras, quando parar) e marque cada
> passo em `docs/eras/PROGRESSO.md`. Ordem das etapas: E1, E2, E3, E4, E5+E7, E6, E8, E9+E10. Onde este guia falar de
> commit ou de push, vale a rotina do LEIA-ME: um commit por passo e push só para a branch da sessão.

> Como usar este guia: siga os blocos na ordem (0, A, B, C, R, U, F, G, P, H, J, K, L, M; as letras D, E e I ficaram de fora para não confundir com as decisões D1–D31, as etapas E1–E10 e a Era I). Cada passo `- [ ]` cabe num
> commit e diz como conferir. Os números de tamanho, cor e tile são **valores iniciais**: se uma captura mostrar que
> não funcionam, ajuste o número e anote em `docs/ART.md` (Apêndice J), sem mudar a decisão. Todo bake longo roda em
> segundo plano com log (`run_in_background`), nunca em primeiro plano.

## Objetivo e resultado jogável

Ao fim da E8 nada na partida sai com arte provisória (alias da E2/E3/E4/E5/E6/E7 ou procedural):

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
- **As 12 criaturas da E6**: as 9 dos deuses menores novos, **Escila** e **Ceto** (as navais de Poseidon) e o **Talos**
  (o Colosso da Era VII, tipo próprio `talos` na E6).
- **As 17 maravilhas novas da E7**, procedurais no rig de edifício.
- **Efeitos**: bala traçante, granada, obus, clarão de boca, fumaça de pólvora, explosão, vapor e fumaça de chaminé,
  poeira da troca de Era, "+N ouro" na chegada da caravana e a arte própria dos **9 poderes da E6** (hoje o anel
  genérico do handler `divine`), com os ícones de poder e os retratos dos 9 deuses que a E6 deixou provisórios.
- Fica de fora (procedural de propósito, para depois da E8): os cardumes `fish`/`rare_fish` da E4 (a animação da água).
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
| D7 | Centro Cívico: as variantes `a0/a1/a2` (`variantBy: 'ageTier'`) saem do manifesto; o base é o `a1` de hoje, `town_center_e0` é o `a0` e `town_center_e2` o `a2`, **byte a byte** (parâmetro `seedVariant` mantém a semente antiga; `eraParams: { "*": { "seedVariant": "a2" }, "0": { "seedVariant": "a0" } }`, porque as cópias herdam o `seedVariant: "a1"` do base; `eraOwn = [0, 1, 2]` no builder desliga o remapeamento nessas Eras; as e3–e7 partem do tier 2). A prova é feita no Bloco A com um manifesto de prova fora de `art/manifest` (`--preview`); o manifesto oficial do CC só muda no R1, junto da fusão (senão `art:check` e os testes ficam vermelhos até o R5). | Um critério só (a Era) para todos os edifícios; nada de rebake visível do CC. |
| D8 | Casa e templo continuam `.glb` do Meshy na Era base; as cópias são **procedurais** (`eraParams: { "*": { "style": "house", "glb": null } }`, `eraNoVariants: true`). | O `.glb` não se veste por Era; o builder procedural `house`/`temple` já existe. |
| D9 | **Sem cópias**: as 20 maravilhas, `titan_gate`, `cornucopia` e `rubble`. | Maravilha e portal têm aparência própria; os escombros são de pedra genérica. |
| D10 | Cópias só para Eras **≥ `def.age`** do edifício (o base existe sempre). | Não assar o que nunca aparece. |
| D11 | Unidades novas: campo `era` no manifesto (= `UNITS[id].age`) → grupo de atlas `units_e<era>`; carregamento **por tipo** como hoje (`ensureAsset`). As 35 de hoje ficam no grupo `units` sem mudança (o grupo `units` **nunca** é reempacotado na E8). | O cache do contêiner não tem as unidades antigas: grupos por Era deixam fundir uma Era sem reassar as 35. |
| D12 | Cidadão, barco de pesca, transporte e navio mercante têm **cópias por Era** pelo mesmo campo `eras` dos edifícios (D1), não pelo `unitVariants` da hidra: cópia `<id>_e<n>` com `era: n` (grupo `units_e<n>`) e `eraOf`/`eraValue` no índice. Cidadão `eras: [1, 3, 4, 6, 7]` (o base é a Era 0, a arte de hoje, no grupo `units`); pesca e transporte `[4, 6]` (base Era 0, `units_e0`); mercante `[4, 6]` (base Era 2, `units_e2`). O renderizador acha as cópias pelo `eraOf` delas (`ArtLibrary.erasOf`), como nos edifícios. A Era da unidade sai de `unitArtEra` (`src/render/art/era.ts`, novo): Era visual do dono, limitada pelo próximo estudo `evo_<linha>_<n>` não feito nas linhas que não trocam de tipo. | `unitVariants` grava a lista no asset BASE do índice; o base do cidadão está no grupo `units`, que a E8 não reempacota: o `merge-group` não atualizaria a entrada e o `art:check` acusaria a variante "ausente de villager.unitVariants". §10 "aparência do cidadão por Era"; §4 os barcos evoluem "a vapor" sem trocar de tipo (E3/E4). |
| D13 | Cidadão por Era (rig humano, `eraLook: 'citizen'` + `era`): 0 = o de hoje (túnica, cabelo); 1 = pílos de feltro e ferramenta de ferro; 3 = túnica longa de time, gorro frígio e calça; 4 = gibão acolchoado, chapéu de aba, calção e meia, faixa de time; 6 = jaqueta de trabalho de time, boné e calça; 7 = macacão de time e boné. | Silhueta legível por Era sem trocar o rig. |
| D14 | O rig humano ganha **valores novos** no `KIT` (elmos, armaduras, escudos, armas de fogo, pernas, costas) e **poses novas** em `art/poses/human.json` (tabelas em "Dados prontos"). Nada muda nos valores de hoje. | As 35 unidades antigas continuam idênticas se forem reassadas. |
| D15 | Cerco: estilos novos no rig `siege` (`trebuchet`, `bombard`, `field_gun`, `howitzer`, `ram`, `siphon`) com o pivô `barrel` e o escalar `recoil`. | Mesma máquina de hoje (rodas, servos). |
| D16 | Rig novo **`vehicle`** (`scripts/bake/page/rigs/vehicle.js`): `tank`, `spg` e `motorcycle` (cavaleiro humano aninhado `rider`, como o cavalo). Esteiras e rodas giram pela passada medida (`wheels`). | §10 "tanque" é rig novo; o motociclista reaproveita o cavaleiro. |
| D17 | Rig novo **`ship`** (`scripts/bake/page/rigs/ship.js`): linha d'água em y = 0, nada abaixo dela (só o `sink` desce, recortado por plano em clones dos materiais); remos animados, velas, rodas de pás/chaminé; `page: 'own'` e `mirror: true`; anda por deslizamento: `glide` é uma **função** `(anim, poses) => tiles por ciclo` (como na serpente — o `art:check` exige passada > 0 no `walk` de quem não voa). A esteira é efeito (Bloco P), não sprite. Navios da classe `titan` só a 1× (`scales: [1]`, como os titãs): o `tests/art-library.test.ts` exige o tipo inteiro numa página por passe. | §8; navios são grandes e poucos: página própria liberada quando somem. |
| D18 | Caravana = **mula de carga** no rig `horse` (`build: 'light'`, `coat: 'grey'`, `pack: 'mule'`, `rider: null` — `null` é o "sem cavaleiro" de hoje, o do Pégaso; `false` faria o `posesOf`/a validação pedirem poses de cavaleiro). Mercador = humano (pétaso de feltro, túnica de time, capa longa, bolsa). | Reuso de rig; leitura imediata. |
| D19 | Criaturas: os 12 ids da E6 (`satyr`, `empusa`, `lampad`, `harpy`, `hippocampus`, `triptolemus_dragon`, `phoenix`, `griffin`, `erinys`, `scylla`, `ceto`, `talos` — todos no `UNIT_ART_ALIAS` da E6); rig novo `bird` (`scripts/bake/page/rigs/bird.js`) para a Fênix; Grifo no `beast` com `face: 'eagle'` e asas; Escila e Ceto como formas novas do rig `serpent` (`form`, como a Medusa); Talos = manifesto próprio (`UNITS.talos` existe desde a E6, D16 de lá) com o esqueleto do Colosso. Se a E6 usou outros ids, **os da E6 valem** (`grep -n "satyr\|scylla\|talos" src/core/data/units.ts`). | §6. |
| D20 | Maravilhas: **procedurais** em `scripts/bake/page/rigs/buildings-wonders.js` (novo), 4×4, altura ≤ 3 tiles, `size.tiles` ~[6.2, 7.6], com `onDamage`. O Meshy só entra depois, se ganhar na prévia (como na Etapa 9). | §10 "17 maravilhas (procedural; o Meshy onde ganhar)". |
| D21 | Efeitos: projéteis novos `bullet` (traçante), `shell` e `grenade`, escolhidos pela tag `gunpowder` (E3); a tag `fire` (sifão, dromon, lâmpade, dragão, Fênix) continua no `'fireball'` que a E3 pôs no `projectileKind`; clarão de boca e fumaça de pólvora no disparo; explosão no impacto de `shell`/`grenade`; fumaça de chaminé (tabela nova `CHIMNEY_SMOKE` em `rules.ts`, separada da `WORK_SMOKE` da lareira/forja) nos edifícios cujo asset mostrado tem chaminé (Era VII); fumaça de motor pela tag `mechanical`; esteira de navio. | §10 "efeitos de tiro, fumaça de pólvora, vapor e chaminés". |
| D22 | Troca de Era do dono: poeira em cada edifício pronto e à vista cujo asset troca **porque a Era visual do dono mudou** (`FxSystem.eraChange`) — não na criação da vista nem quando o grupo da Era termina de carregar —, sem som novo. | §5 "trocam com poeira". |
| D23 | Pré-carga: unidades = `lineUnitOf` das linhas do jogador local + as presentes + as sem linha da Era (`warmUnitTypes`) + as cópias por Era do cidadão e dos barcos na Era local, refeita quando a Era **ou os estudos** do jogador local mudam; edifícios = grupos das Eras visuais de todos os jogadores + a próxima Era do jogador local (esses grupos também contam como "em uso" na liberação). | Gancho da E3 ("pré-carregar só o degrau atual"); a troca de Era não pisca; sem isso a liberação e a pré-carga se alternariam a cada 20 s. |
| D24 | Orçamento: PNG total ≤ **500 MB**; VRAM **por Era** (grupos `buildings_e<n>` + `units_e<n>`, **sem as páginas próprias** `page: 'own'`, que só sobem quando o tipo aparece) ≤ **40 MB a 1×**; **pior caso de uma partida** ≤ **260 MB a 1×** (×4 a 2×); atlas `hud` ≤ **8 MB** de PNG (hoje 4: os ~140 ícones novos dobram o atlas). Medido pelo `art:check` e registrado em `docs/ART.md` §6. | §5 "o `art:check` mede por Era". |
| D25 | Ordem: **lote 1 = Eras I–IV** (edifícios, unidades, navios, maravilhas de I–IV) e **lote 2 = Eras V–VIII**; efeitos entre os dois lotes de unidades. | §11 "E8 em lotes (I–IV, depois V–VIII)". |
| D26 | Bake sempre num **rascunho** (`--out scratch/e8/<lote>`) e fusão com `merge-group --groups <lista explícita>`. Edifício novo tem ícone no atlas `icons` (Etapa 3): toda fusão de edifícios leva também o grupo `icons`, e o rascunho tem de ter **todos** os edifícios base (o bake de `--only buildings,…` garante; o log não pode ter "sem cache válido" de edifício). Os PNG em `public/art` só entram em commit no **fim de cada bloco de arte**, depois das capturas olhadas. | O cache do contêiner é parcial; reassar sem `--out` apagaria os atlas que faltam no cache. Sem fundir `icons`, o `art:check` e o `art-manifest.test` acusam o ícone do edifício novo. PNG intermediário incha o git. |
| D27 | Capturas: `scripts/artages.mjs` passa a cobrir as **8 Eras** + a campanha (teto 2) + as 20 maravilhas; script novo `scripts/artlines.mjs` (linhas por Era: roda, combate, naval, desfile). | Prova visual de cada Era antes do commit. |
| D28 | Ícones: os `unit/<id>` e `bld/<id>` dos tipos novos saem **sozinhos** dos manifestos no `npm run art:hud` (o catálogo itera `art/manifest`; rode-o no fim de cada bloco de arte, senão o `art:check` acusa "ícones do índice ≠ catálogo"); sai o `SHIP_ICONS` que a E4 pôs em `scripts/bake/hud/catalog.mjs`; um ícone **por degrau** nos estudos de evolução das linhas que trocam de tipo (os `evo_<linha>` da E3 que ficarem órfãos saem); Idades V–VIII com ícones próprios (canhão, tricórnio, engrenagem, vulcão já existe); `POWER_ICONS` próprios para os 9 poderes da E6 e os 9 retratos revistos. Os ícones de edifício **não** mudam por Era. | Gancho da E3 ("ícone por degrau") e da E6 ("a E8 desenha os próprios"); o HUD lê melhor com um ícone estável. |
| D29 | **Nada muda no núcleo** (`src/core`): `SIM_VERSION` não sobe; o hash do `smoke 20 42` fica igual antes e depois. O renderizador pode **ler** funções puras do núcleo (`routeGold`, `lineUnitOf`), nunca alterar estado. | A E8 é só renderização. |
| D30 | Áudio e passos: `deathRecipe` (`src/audio/events.ts`) — tag `mechanical` e navios usam `'treeFall'` (sem relincho); `gaitOf` (`src/render/fx/logic.ts`) — `mechanical` é `'wheel'` (sem poeira de casco); resposta de seleção (`dominantClass` em `src/ui/input.ts`) — `mechanical` responde como `siege` (`ackCreak`, sem relincho). O som próprio de pólvora/motor é da trilha de áudio, fora desta etapa. | Gancho da E3 (tanque e motociclista saem hoje pela `cls` cavalry/scout) e da E4. |
| D31 | Poderes da E6 com arte própria **só no renderizador**: o tipo de efeito `divine` do núcleo (E6) continua; o handler `src/render/fx/handlers/divine.ts` ganha um ramo por `e.src` (e os 3 `TimedHandler`), com os emissores que já existem; o "+N ouro" da caravana é um **observador** no `unitFx.ts` (a perna `routeLeg` da E5 trocou), não um tipo de efeito novo. | D29: criar efeito no núcleo mudaria o estado e o hash do smoke. |

## Arquivos que mudam

| Caminho | O que muda |
|---|---|
| `scripts/bake/manifest.mjs` | `ERA_GROUPS`, `atlasGroupOf`, `baseEraOf`, `eraCopyId`; validação de `eras`, `eraParams`, `eraNoVariants` (edifícios **e** unidades), `atlasGroup`, `era` (unidade); `expandEraVariants`, `expandAll`; `loadAssets` passa por elas; `atlasOf`/`matchesOnly` aceitam o grupo; `RIGS` + `vehicle`, `ship`, `bird`; `posesOf` dá as poses do cavaleiro também ao `vehicle` com `rider` (moto). `UNIT_VARIANT_BY` **não** muda (continua `['heads']`) |
| `scripts/bake/manifest.d.mts` | tipos dos campos novos |
| `scripts/bake/bake.mjs` | empacota `ATLAS_GROUPS` + `ERA_GROUPS` (que já inclui `wonders`); `--only` aceita grupo de Era; índice com `eraOf`, `eraValue`, `era`, `eraBase`, `muzzles`; `sourceFiles`: `rigs/buildings-wonders.js` só no hash dos estilos `wonder_*` e `rigs/horse.js` (com o que ele importa) no dos props (os cavalos selvagens) |
| `scripts/bake/check.ts` | `expandAll` no lugar de `expandUnitVariants`; tipo do grupo por prefixo; `vramByEra` (sem páginas próprias), `vramWorstMatch`; `BUDGET.maxPngMB = 500`, `maxEraVramMB = 40`, `maxWonderVramMB = 30`, `maxVramMB = 260` (pior caso), `maxHudPngMB = 8`; `hudErrors` sem as cópias por Era (`!m.eraOf`) |
| `scripts/bake/merge-group.mjs` | nada (só uso) |
| `scripts/bake/cache-diff.mjs` (novo) | compara dois caches quadro a quadro (prova byte a byte) |
| `scripts/bake/page/materials.js` | materiais novos no **fim** de `PALETTE` e de `createMaterials` |
| `scripts/bake/page/bake.js` | `steel` e `castIron` na lista do reflexo de ambiente (o `renderer.localClippingEnabled = true` que o `sink` dos navios usa **já existe**, linha ~36, para a obra dos `.glb`) |
| `scripts/bake/page/buildings.js` | `buildBuilding` com a Era (vista de materiais, `ERA_KITS`, `eraDress`); `k.M0`; `k.gable`/`k.column`/`k.shed` lêem o kit; `applyDamage` usa `k.M0`; `WALL_MATS`/`ROOF_MATS` ampliados; Centro Cívico com `seedVariant`; muralha/portão/torre por Era |
| `scripts/bake/page/rigs/buildings-era.js` (novo) | `ERA_REMAP`, `ERA_KITS`, `eraView`, `eraDress` (cúpula, chaminé) |
| `scripts/bake/page/rigs/buildings-economy.js` | fazenda por Era (`[0, 4, 6]`), Pedreira, Poço de nafta, Poço de petróleo, Refinaria, (Universidade, Fábrica) |
| `scripts/bake/page/buildings-military.js` | fortaleza por Era (`[3, 4, 6, 7]`), Estaleiro |
| `scripts/bake/page/rigs/buildings-wonders.js` (novo) | as 17 maravilhas |
| `scripts/bake/page/buildings-textures.js` | geradores `brick`, `thatch`, `slate`, `concrete`; `TEXTURED` com os materiais novos |
| `scripts/bake/page/rigs/human.js` | `KIT` ampliado, peças novas, `ERA_LOOKS.citizen` |
| `scripts/bake/page/rigs/horse.js` | `KIT` + `barding`, `pack`, `tail`, `swim`, coat `sea` (o "sem cavaleiro" já existe: `rider: null`) |
| `scripts/bake/page/rigs/siege.js` | estilos novos, pivô `barrel`, escalar `recoil` |
| `scripts/bake/page/rigs/beast.js` | `face: 'eagle'` (grifo) e `face: 'dragon'` (dragão de Triptólemo), carro de trigo (as asas `wings: 'feather'` o `beast` já tem) |
| `scripts/bake/page/rigs/serpent.js` (+ `rigs/medusa.js`) | `KIT.form` + `'scylla'`, `'ceto'` (o tronco de mulher da Escila reaproveita o de `medusa.js`) |
| `scripts/bake/page/rigs/biped.js` | acabamentos `satyr`, `empusa`, `erinys`, `lampad`, `harpy` (com asas de `wings.js`), `talos` |
| `scripts/bake/page/rigs/vehicle.js` (novo) | tanque, autopropulsada, motocicleta |
| `scripts/bake/page/rigs/ship.js` (novo) | 11 cascos (pesca, transporte, mercante, 8 de guerra) |
| `scripts/bake/page/rigs/bird.js` (novo) | Fênix (a harpia é `biped` com asas) |
| `scripts/bake/page/rigs/units.js` | registro de `vehicle`, `ship`, `bird` (poses, kits, `NESTED_HUMAN.vehicle = 'rider'`, `RIG_FILES`) |
| `scripts/bake/page/props.js` | nós da E2 (`limestone`, `naphtha`, `oil_field`, `olive` — quadro `olive_grove`, ver U7 —, `vineyard`, `paros_marble`, `salt`, `wild_horses`, `copper`, `incense`) |
| `scripts/bake/gait.mjs` | poses de voo do grifo e do dragão (gera `art/poses/beast.json`; nunca editar o JSON à mão) |
| `scripts/bake/measure.mjs` | mede `muzzles` (boca da arma por direção), como os `tops` |
| `scripts/bake/fx/catalog.mjs` | projéteis `bullet`, `shell`, `grenade`; família `flash` |
| `scripts/bake/hud/catalog.mjs`, `scripts/bake/page/hud-objects.js`, `scripts/bake/page/hud-gods.js` | sai o `SHIP_ICONS` (E4); `TECH_ICONS` por degrau (e saem os `evo_<linha>` órfãos); `techIconKey`; `AGE_ICONS` 4–6; `POWER_ICONS` dos 9 poderes da E6; os 9 retratos da E6 revistos (os `unit/` e `bld/` dos tipos novos saem sozinhos dos manifestos) |
| `art/manifest/*.json` | 21 manifestos de edifício com `eras` (os 21 da tabela 4: os 16 de hoje que ganham cópias — os 22 manifestos de edifício de hoje menos as 3 maravilhas, `titan_gate`, `cornucopia` e `rubble` — e os 5 novos: Pedreira, Estaleiro e os 3 de petróleo; o CC sem `variants`); 54 unidades/navios novos (41 de linha, Mercador, caravana, 11 navios) e `eras` no `villager.json`; 12 criaturas; 17 maravilhas; `props-nodes.json` |
| `art/poses/human.json`, `art/poses/siege.json`, `art/poses/biped.json`; `art/poses/scylla.json`, `art/poses/ceto.json` (novos) | poses novas (acrescentar; nada de mudar as de hoje — o `tests/art-units-review.test.ts` mede as 35 de hoje contra o índice) |
| `art/poses/vehicle.json`, `art/poses/ship.json`, `art/poses/bird.json` (novos) | poses dos rigs novos |
| `public/art/*` | atlas gerados (só no fim de cada bloco de arte) |
| `src/render/art/types.ts` | `ArtGroup` com `buildings_e<n>`, `units_e<n>`, `wonders`; `ArtAssetEntry` + `eraOf?`, `eraValue?`, `eraBase?`, `era?`, `muzzles?` |
| `src/render/art/logic.ts` | `isOnDemandGroup`, `isUnitGroup`, `buildingEraId` (serve também às unidades); `nodeFrameName`/`nodeStage` dos nós novos; `projectileKind` não (fica em fx/logic) |
| `src/render/art/era.ts` (novo) | `unitArtEra`, `buildingArtEra`, `erasInPlay` |
| `src/render/art/AtlasSource.ts` | `LoadKind` + `'era'`; `unloadGroup(group)` |
| `src/render/art/ArtLibrary.ts` | grupos sob demanda; `eraGen`; `erasOf(type)`, `assetEra(id)`, `buildingReady`, `ensureEras`/`ensureWonders`, `releaseEras`; `unitId(type, heads, era)`; `UnitArt.muzzles` |
| `src/render/art/alias.ts` | as tabelas de **arte** ficam vazias no fim; o procedural das unidades passa a ler `UNIT_PROCEDURAL_ALIAS` (cópia congelada do alias de antes; o procedural dos edifícios não usa alias) |
| `src/render/views/BuildingView.ts` | `artId` mutável, `era`, `setArt(id, era)` |
| `src/render/renderer.ts` | Era dos edifícios e unidades; fantasma; `RecentGone.artId`; poeira de troca; pré-carga por Era; liberação dos grupos |
| `src/render/fx/types.ts` | `FxHost.goneArt?` |
| `src/render/fx/handlers/collapse.ts` | desabamento com o asset da Era |
| `src/render/fx/logic.ts`, `src/render/fx/handlers/projectile.ts`, `src/render/fx/FxTextures.ts` | `PROJECTILE_KINDS`, `gunpowderProjectile`, `arcHeight`, `isEmissive` (bala), `GROUP_CAP.gunsmoke`, `gaitOf` (`mechanical`); `FX_FAMILIES` + `proj/bullet`, `proj/shell`, `proj/grenade`, `flash` (e o desenho de reserva); clarão, explosão |
| `src/render/fx/recipes.ts`, `src/render/fx/unitFx.ts`, `src/render/fx/rules.ts`, `src/render/fx/ambient.ts`, `src/render/fx/FxSystem.ts` | fumaça de pólvora, motor, vapor (`STACKS`), esteira, "+N ouro" (observador), chaminés (`CHIMNEY_SMOKE`, nova; a `WORK_SMOKE` fica como está), `eraChange` |
| `src/render/fx/handlers/divine.ts` (da E6) | um ramo por `e.src` com a arte própria dos 9 poderes e do renascimento da Fênix |
| `src/render/textures.ts` | `drawShip` continua como reserva; `TextureCache.unit` desenha `unitProceduralType(type)` (era `unitArtType`, passo D2 da E3) |
| `src/ui/icons.ts` | `techIconName` por degrau (igual ao `techIconKey` do catálogo); `ic.age` até 7 (se a E1 não fez) |
| `src/ui/input.ts` | `dominantClass`: `mechanical` responde como `siege` |
| `src/audio/events.ts` | `deathRecipe` de `mechanical` (o de navio a E4 já pôs) |
| `src/main.ts` | `debugSetAge(player, age)` e `debugData()` (o `debugSpawn` com a camada naval a E4 já fez, passo de `layerOf`) |
| `scripts/artages.mjs` | 8 Eras + campanha + 20 maravilhas |
| `scripts/artlines.mjs` (novo) | desfile das linhas por Era |
| `scripts/artparade.mjs`, `scripts/artmyth.mjs`, `scripts/artfx.mjs`, `scripts/renderperf.mjs` | listas de tipos lidas dos dados (inclui os novos); cenas novas (`tiro`, `naval`, `troca`) |
| `tests/art-manifest.test.ts`, `tests/art-library.test.ts`, `tests/art-etapa6.test.ts`, `tests/art-units-review.test.ts`, `tests/art-military.test.ts`, `tests/fx-atlas.test.ts`, `tests/fx-logic.test.ts`, `tests/hud-icons.test.ts` | contagens e regras novas (tabela "Testes") |
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
| `flame` | `0xff8a2a` | 0.5 | 0 | — (emissivo laranja: cabelo da Empusa, tochas da Lâmpade, penas da Fênix, veias do Talos; o `glow` de hoje é azul-claro) |

Código para o fim de `createMaterials` (depois do último `Object.assign` que existe hoje — o da Etapa 6, das criaturas —, imediatamente antes do `return M;`; as cores vão no fim do objeto `PALETTE`, depois de `teamMask`):

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
    flame: std(PALETTE.flame, 0.5, 0, { emissive: PALETTE.flame, emissiveIntensity: 0.9 }),
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
/** Uma vista por Era e por M (a página do bake vive a sessão inteira): o cache de materiais do lote economia
 *  (`XM` em rigs/buildings-economy.js) usa `k.M` como chave — uma vista nova por edifício recriaria os materiais dele a
 *  cada estado. */
const VIEWS = new WeakMap();
/** Vista dos materiais na Era: o próprio M quando não há troca (Era 1 ou Era própria do builder). */
export function eraView(M, era, own = false) {
  const remap = own ? null : ERA_REMAP[era];
  if (!remap || !Object.keys(remap).length) return M;
  let byEra = VIEWS.get(M);
  if (!byEra) { byEra = []; VIEWS.set(M, byEra); }
  if (byEra[era]) return byEra[era];
  const V = Object.create(M);
  for (const [from, to] of Object.entries(remap)) { if (!M[to]) throw new Error(`ERA_REMAP[${era}]: material ${to} não existe`); V[from] = M[to]; }
  byEra[era] = V;
  return V;
}
export function eraKit(era) { return ERA_KITS[era] ?? ERA_KITS[1]; }
```

`eraDress(k, B, p)` (no mesmo arquivo; chamado por `buildBuilding` depois do builder e antes do dano, só com
`stage === 3` — pronto, danificado ou portão aberto — e se `B.eraDome`/`B.eraChimney` estiverem ligados no builder):

- **cúpula** (Era 3, `B.eraDome === true`): ache a maior caixa de telhado (`k.roofs`, lista que `makeKit` cria vazia e
  que `k.gable`/`k.shed`/`k.shedX` passam a preencher com `{ cx, cz, w, len, y, rise, axis }` — só quando o telhado está
  no grupo raiz `k.r`; num `parent` próprio as coordenadas são locais e não servem); ponha um tambor `k.cyl(r, r, 0.35, M.brick, cx, y + rise * 0.5, cz, 16)`
  com `r = min(w, len) × 0.28` e uma semiesfera `SphereGeometry(r × 1.04, 16, 8, 0, 2π, 0, π/2)` de `M.leadDome` em cima,
  mais uma cruz pequena de `M.bronze` (0,06 × 0,3). Edifícios com cúpula: `town_center`, `temple` (procedural), `academy`,
  `market` e `university`.
- **chaminé** (Era 6, `B.eraChimney === true`): caixa de `M.brick` 0,22 × 0,9 × 0,22 a 70 % do comprimento da maior
  caixa de telhado, saindo 0,6 acima da cumeeira, com o anel de `M.castIron` no topo; grava `k.chimneys.push([x, y, z])`
  (só documentação: a fumaça é do renderizador, Bloco P, pela tabela `CHIMNEY_SMOKE`). Edifícios: `house`, `barracks`,
  `siege_workshop`, `lumber_camp`, `mine`, `quarry`, `shipyard`, `factory`. Só a Era 6 tem chaminé no kit
  (`ERA_KITS[6].chimney`); a fumaça segue o kit do asset mostrado, nunca "Era ≥ 6".
- Nenhum dos dois roda na Era 1 nem consome `k.rand()` (a planta e o dano sorteiam igual em todas as Eras: cópias comparáveis).

### 4. Eras por edifício (o campo `eras` de cada manifesto)

Confira as `age` antes (`npx tsx -e "import {BUILDINGS} from './src/core/data'; for (const b of Object.values(BUILDINGS)) console.log(b.id, b.age, b.w+'x'+b.h)"`):
a regra é **todas as Eras n de 0 a 7 com n ≠ Era base e n ≥ `def.age`**, menos as listas fixas de função e os sem cópia.
A tabela é o resultado esperado com as `age` depois da E1–E7 (Biblioteca `academy` 0 pela E1; Pedreira 0 e poços/Refinaria 3/6/6 pela E2; Estaleiro 0 pela E4; mercado e estábulo 1; oficina e fortaleza 2).

| id | Era base | `eras` (cópias) | extras | o que muda além do kit |
|---|---|---|---|---|
| `town_center` | 1 | `[0, 2, 3, 4, 5, 6, 7]` | builder com `eraOwn = [0, 1, 2]`, `eraParams: { "*": { "seedVariant": "a2" }, "0": { "seedVariant": "a0" } }` (as cópias herdam o `a1` do base: o `"*"` põe as e2–e7 no tier 2), base `seedVariant: "a1"`, `B.eraDome` | e0/e2 = a0/a2 de hoje; e3+ partem do tier 2 |
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

Muralha, portão e torre: a planta própria de cada Era continua lendo `p.variant` (bitmask `00`–`15`, `05f`/`10f` com estandarte, eixo `ew`/`ns`) e a torre continua com `seedIgnoresVariant` (a variante só muda a sombra: o teste da torre exige a mesma cor em todas as variantes).

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

Acrescente no manifesto (sem tocar em `source.params`, `anims` nem `docs`: o asset base continua o de hoje, no grupo
`units`, e **não** ganha o campo `era`):

```json
"eras": [1, 3, 4, 6, 7],
"eraParams": { "*": { "eraLook": "citizen" } },
"variantContactDirs": [1, 2],
```

O `expandEraVariants` (A2) dá a cada cópia `params.era = n` e o `eraLook` do `"*"`. `ERA_LOOKS.citizen` em `human.js`
aplica, **por cima** dos `params` do manifesto (`hair: true, tunicTeam: 'upper', tool: 'axe', carry: 'basket'`), só
quando `eraLook === 'citizen'` e `era > 0`:

| `era` | elmo/chapéu | roupa | pernas | ferramenta | time |
|---|---|---|---|---|---|
| 0 | (o de hoje) | túnica de hoje | — | machado de hoje | `tunicTeam: 'upper'` |
| 1 | `helmet: 'pilos', helmetMat: 'felt'` | `armor: 'tunic'` | `legs: 'bare'` | `toolMetal: 'iron'` | `tunicTeam: 'upper'` |
| 3 | `helmet: 'phrygian', helmetMat: 'felt'` | `armor: 'robe'` | `legs: 'trousers'` | `toolMetal: 'iron'` | túnica inteira de time (`tunicTeam: true`, o valor de hoje do `kataskopos`) |
| 4 | `helmet: 'brimhat'` | `armor: 'quilted'` | `legs: 'breeches'` | `toolMetal: 'iron'` | `sash: 'team'` |
| 6 | `helmet: 'flatcap'` | `armor: 'workcoat'` | `legs: 'trousers'` | `toolMetal: 'steel'` | jaqueta de time |
| 7 | `helmet: 'flatcap'` | `armor: 'overalls'` | `legs: 'trousers'` | `toolMetal: 'steel'` | macacão de time |

Ids gerados: `villager` (Era 0, o de hoje, grupo `units`), `villager_e1`, `villager_e3`, `villager_e4`, `villager_e6`,
`villager_e7` (`eraCopyId`: `<id>_e<n>`, o mesmo dos edifícios), cada cópia no grupo `units_e<n>` com `eraOf: 'villager'`
e `eraValue: n` no índice.

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
| `tunicTeam` (parâmetro de hoje, fora do `KIT`) | nada novo | `true` já pinta a túnica inteira de time e `'upper'` só o peito (`buildHuman`, linhas ~103–105): use esses dois |

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

Todas: `kind: 'unit'`, `dirs: 8`, `team: true`, `shadow: true`, `stage: 8`, `era: <age>`, `docs` de uma linha com a
palavra "glb" (a validação exige). Humanas a pé: `size.tiles [3.2, 3.6]`, `anchor [0.45, 0.58]`, sem `sizeClass` (unit;
o teto de 128 px vale para a união dos pixels visíveis, não para a caixa). Montadas: `[4, 4.2]`, `anchor [0.46, 0.62]`.
Cerco/veículos: indicado. `anims` padrão por arma: corpo a corpo `idle/walk/attack/die` (+ `run` nas montadas); tiro
`idle/walk/aim/attack/die`; quadros como os de hoje (idle 4, walk 8, attack 6, aim 2, die 6; copie de `hoplite.json`,
`toxotes.json` ou `hippeus.json`). Humanas: `die` = pose `die`. **Montadas**: cada animação tem `pose` (cavalo:
`idle_horse`, `trot`, `gallop`, `attack_horse`, `die_horse`; no `aim`, `idle_horse`) e `rider` (cavaleiro) — a coluna
"poses" abaixo dá o `rider`, e o `die` é `ride_die`, como em `hippeus.json`. Veículos e cerco: a coluna dá a `pose` do
próprio rig (`die_<estilo>` no `die`); a moto também tem `rider` (`ride_moto`, `ride_moto_attack`, `ride_die`).

| id | Era | rig | parâmetros do kit | poses (idle · walk · aim · attack) | projétil |
|---|---|---|---|---|---|
| `prodromos` | 2 | horse | coat `bay`, build `light`, cloth true; rider `helmet: 'pilos', armor: 'tunic', cape: 'short', weapon: 'javelin'` | ride_idle · ride_trot · — · ride_attack_spear (+ run ride_gallop) | — (corpo a corpo) |
| `trapezites` | 3 | horse | coat `chestnut`, light; rider `helmet: 'spangen', armor: 'lamellar', weapon: 'javelin', sash: 'team'` | idem | — |
| `stradiot` | 4 | horse | coat `grey`, light; rider `helmet: 'kettle', armor: 'mail', weapon: 'lance', cape: 'short'` | … ride_attack_lance | — |
| `hussar` | 5 | horse | coat `bay`, medium; rider `helmet: 'busby', armor: 'coat', weapon: 'saber', cape: 'short'` | … ride_attack_sword | — |
| `mounted_scout` | 6 | horse | coat `chestnut`, medium; rider `helmet: 'brimhat', armor: 'tunicmil', legs: 'puttees', weapon: 'carbine'` | … ride_aim_carbine · ride_attack_carbine | `bullet` |
| `motorcyclist` | 7 | vehicle | `style: 'motorcycle'`; rider `helmet: 'leathercap', armor: 'tunicmil', legs: 'puttees', weapon: 'smg'` | `pose` idle_moto · roll_moto · idle_moto · idle_moto (`die`: die_moto); `rider` ride_moto · ride_moto · ride_moto · ride_moto_attack; tiles [3.4, 3.4] | `bullet` |
| `phalangite` | 2 | human | `helmet: 'phrygian', crest: 'none', armor: 'linothorax', shield: 'pelte', weapon: 'sarissa', greaves: true` | idle_pike · walk_pike · — · attack_pike; tiles [3.6, 4.2] | — |
| `skoutatos` | 3 | human | `helmet: 'spangen', armor: 'lamellar', shield: 'kite', shieldTeam: 'full', weapon: 'spear', legs: 'trousers'` | idle_hoplite · walk_hoplite · — · attack_spear | — |
| `pikeman` | 4 | human | `helmet: 'morion', helmetMat: 'steel', armor: 'plate', weapon: 'pike', legs: 'breeches', sash: 'team'` | idle_pike · walk_pike · — · attack_pike; tiles [3.6, 4.2] | — |
| `grenadier` | 5 | human | `helmet: 'bearskin', armor: 'coat', weapon: 'grenade', back: 'musket', legs: 'breeches'` | idle_gun · walk_gun · aim_gun · attack_grenade | `grenade` |
| `fusilier` | 6 | human | `helmet: 'shako', armor: 'coat', weapon: 'musket', legs: 'trousers', back: 'pack'` | idle_gun · walk_gun · aim_gun · attack_gun | `bullet` |
| `modern_infantry` | 7 | human | `helmet: 'adrian', helmetMat: 'steel', armor: 'tunicmil', legs: 'puttees', weapon: 'rifle', back: 'pack'` | gun | `bullet` |
| `rhodian_slinger` | 2 | human | `helmet: 'none', armor: 'tunic', weapon: 'sling', sash: 'team'` | idle_javelin · walk_javelin · aim_sling · attack_sling | `stone` (o quadro de hoje; o `projectile.ts` desenha a 0,5× quando `e.src === 'rhodian_slinger'`) |
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
| `greek_fire_siphon` | 3 | siege | `style: 'siphon'`; tiles [3.6, 3.6] | …_siphon | `fireball` (tag `fire`: a regra da E3 no `projectileKind`) |

Os 2 da E2/E5:

| id | Era | rig | parâmetros | poses |
|---|---|---|---|---|
| `merchant` | 1 | human | `helmet: 'petasos', helmetMat: 'felt', armor: 'tunic', tunicTeam: true, cape: 'long', carry: 'basket'` | idle_villager · walk_villager · — · attack_axe (+ `carry` 6 com a pose `carry`; `die` = `die`) |
| `caravan` | 1 | horse | `coat: 'grey', build: 'light', cloth: false, pack: 'mule', rider: null` (sem `rider` em nenhuma animação, como o Pégaso) | `pose` idle_horse · trot · — · attack_horse; `run` gallop; `die` die_horse |

Projéteis existentes hoje (`PROJECTILE_KINDS` em `src/render/fx/logic.ts`): `arrow`, `javelin`, `stone`, `spike`,
`fireball`, `bolt` (confira com `grep -n "PROJECTILE_KINDS" -A3 src/render/fx/logic.ts`); a E3 pôs a tag `fire` →
`'fireball'` como primeira regra do `projectileKind`. Não existe projétil `fire`: onde as tabelas 8–10 diziam "fogo",
é o `fireball`.

### 9. Navios (rig `ship`; `page: 'own'`, `mirror: true`; `size.tiles = [L + 0.6, L + 0.6]` com L = comprimento, `anchor [0.5, 0.62]`)

Ids, Eras e tags são os da E4 (`grep -n "cls: 'ship'" src/core/data/units.ts`) e o `merchant_ship` da E5. Os navios de
guerra I–III **atiram** (E4: `ranged`, ataque `pierce`, alcance 6 — arqueiros no convés), o dromon tem a tag `fire`
(`fireball`) e os de V–VIII a `gunpowder` (`shell`). Os barcos civis têm ataque 0, mas `attack` é obrigatório no
manifesto (`REQUIRED_UNIT_ANIMS`): use 2 quadros de `idle_ship`.

| id | Era | estilo (`style`) / `rig` | comprimento (tiles) | propulsão | `sizeClass` · `scales` | `anims` (quadros) | projétil |
|---|---|---|---|---|---|---|---|
| `fishing_boat` | 0 | `fishing` / `oar` | 1,8 | remos (2 por lado) + vela latina | unit | idle 2 · walk 6 · attack 2 · gather 6 (rede) · die 5 | — |
| `fishing_boat_e4` | 4 | `fishing` / `sail` | 1,8 | vela de proa e popa | unit | idem | — |
| `fishing_boat_e6` | 6 | `fishing` / `steam` | 1,8 | chaminé fina | unit | idem | — |
| `transport_ship` | 0 | `transport` / `oar` | 3,0 | remos (6 por lado) + vela quadrada | myth | idle 2 · walk 6 · attack 2 · die 5 | — |
| `transport_ship_e4` / `_e6` | 4 / 6 | `transport` / `sail` · `steam` | 3,0 | 2 mastros / roda de pás + chaminé | myth | idem | — |
| `merchant_ship` | 2 | `merchant` / `square` | 3,2 | vela quadrada, casco redondo | myth | idle 2 · walk 6 · attack 2 · die 5 | — |
| `merchant_ship_e4` / `_e6` | 4 / 6 | `merchant` / `sail` · `steam` | 3,2 | carraca 3 mastros / vapor de rodas | myth | idem | — |
| `penteconter` | 0 | `penteconter` | 3,6 | 25 remos por lado, vela; esporão de bronze (peça do casco) | myth | idle 2 · walk 6 · aim 1 · attack 6 · die 5 | `arrow` |
| `trireme` | 1 | `trireme` | 4,0 | 3 bancadas de remos, esporão de bronze | myth | idem | `arrow` |
| `quinquereme` | 2 | `quinquereme` | 4,4 | remos + torre de arqueiros | myth | idem | `arrow` |
| `dromon` | 3 | `dromon` | 4,2 | 2 velas latinas + sifão na proa | myth | idem | `fireball` |
| `galleon` | 4 | `galleon` | 4,8 | 3 mastros, castelos, 2 baterias | titan · `[1]` | idem | `shell` |
| `ship_of_the_line` | 5 | `ship_of_the_line` | 5,4 | 3 mastros, 3 baterias | titan · `[1]` | idem | `shell` |
| `ironclad` | 6 | `ironclad` | 4,8 | casco de ferro, chaminé, torre de canhão | myth | idem | `shell` |
| `battleship` | 7 | `battleship` | 6,0 | casco cinza, 2 torres duplas, 2 chaminés | titan · `[1]` | idem | `shell` |

Pesca, transporte e mercante: **um manifesto** cada, com `"era": <base>` (0, 0 e 2), `"eras": [4, 6]` e
`"eraParams": { "4": { "rig": "sail" }, "6": { "rig": "steam" } }` (D12; o base tem o `rig` dele em `source.params`).
Quadros enxutos de propósito: o `tests/art-library.test.ts` exige o tipo inteiro numa página por passe nas duas
escalas; se o empacotador dividir um navio `myth` a 2×, ponha `"scales": [1]` nele e anote no Apêndice J.

Poses (`art/poses/ship.json`): `idle` → `idle_ship`; `walk` → `row` (galés e barcos a remo), `sail` (vela: `square` e
`sail`) ou `steam` (vapor); `attack` → `fire_ship` (todos os de guerra: o casco balança 2° no disparo, `recoil` nas
baterias dos de pólvora); `attack` dos barcos civis e `aim` → `idle_ship` (no `aim` dos de pólvora, portinholas
abertas); `gather` (pesca) → `idle_ship` com a rede (escalar `net`); `die` → `sink`. A vela infla nos quadros de `walk`
(escalar `billow`). `die` = adernar 25° e afundar 0,8 m: recorte por plano (`clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)]`)
em **clones** dos materiais do navio, como o `BUILDERS.glb` faz na obra (`buildings.js`, ~linha 979) — os materiais de
`M` são compartilhados com todos os assets da sessão do bake; `renderer.localClippingEnabled` já está ligado em
`page/bake.js`. O passe de máscara troca os materiais por `M.mask`/`M.occluder` (sem o recorte): deixe as peças de time
(flâmula, faixa da amurada) acima de 0,9 m, para o `sink` não as levar para baixo da linha d'água.

### 10. Criaturas (E6) e Talos

Todas `page: 'own'`, `era` = `UNITS[id].age`, `sizeClass: 'myth'` (o Talos `'titan'`, como o Colosso). Confira na
tabela de criaturas da E6 (`docs/eras/E6-mitologia.md`) quem atira, quem voa e quem é naval: o manifesto segue os
dados (`flying` só onde `UNITS[id].flying`; `aim` só em quem tem `ranged`).

| id | Era | rig | descrição (valores iniciais) | `flying` | anims |
|---|---|---|---|---|---|
| `satyr` | 4 | biped | finish `satyr`: torso humano, pernas de bode (curvas, pelo `fur`), chifres curtos, feixe de dardos (atira: `ranged`, `skirmisher`), faixa de time; estatura 1,0 | não | idle · walk · aim · attack · die (projétil `javelin`, pela tag `skirmisher`) |
| `empusa` | 4 | biped | finish `empusa`: mulher espectral pálida, uma perna de bronze e outra de burro, cabelo de chamas (`flame`, material novo), alfa 0,85 | não | idle · walk · attack · die |
| `lampad` | 4 | biped | finish `lampad`: ninfa com tocha em cada mão (`flame`), véu de time, flutua 0,15 acima do chão | não | idle · walk · aim · attack · die (projétil `fireball`, tag `fire`) |
| `harpy` | 5 | biped | finish `harpy`: corpo de ave com cabeça de mulher, asas de `rigs/wings.js` (penas escuras), garras | sim | idle · walk (voo) · attack · die |
| `hippocampus` | 5 | horse | `coat: 'sea'`, `tail: 'fish'`, `swim: true`, `wings: false`, `rider: null`, cloth false, crina de barbatana; naval (treinado no Estaleiro) | não | idle · walk · attack · die (`pose` do cavalo; sem `rider`) |
| `triptolemus_dragon` | 5 | beast | `face: 'dragon'`, `wings: 'feather'` grandes (ou `bat`), escamas verdes, carro de trigo dourado nas costas com cocheiro de time | sim | idle · walk (voo) · aim · attack · die (projétil `fireball`) |
| `phoenix` | 6 | bird (novo) | ave de fogo: penas `gold`/`flame`, cauda de 5 penas longas, chama nas pontas das asas | sim | idle · walk (voo) · aim · attack · die (projétil `fireball`; o renascer é o efeito `divine` com `src: 'phoenix'`, P9 — sem animação `ability`: nada no renderizador a dispararia) |
| `griffin` | 6 | beast | `face: 'eagle'`, corpo de leão, asas de águia, `wings: 'feather'`; poses de voo novas no `gait.mjs` (`fly`, `fly_attack`, `fly_die`) | sim | idle · walk · attack · die |
| `erinys` | 6 | biped | finish `erinys`: mulher de túnica preta com asas fechadas nas costas, serpentes no cabelo, açoite de chamas; alfa 0,9 | **não** (na E6 ela anda: tags `myth, military`, sem `flying`) | idle · walk · attack · die |
| `scylla` | 2 | serpent (`form: 'scylla'`, novo) | tronco de mulher (o de `rigs/medusa.js`) saindo da água, 6 pescoços com cabeças de cão na cintura, cauda de peixe; nada abaixo da linha d'água (como o rig `ship`); faixa de time. Silhueta longe da hidra: tronco ereto e cabeças curtas | não (naval) | idle · walk (nada) · attack · die |
| `ceto` | 4 | serpent (`form: 'ceto'`, novo) | monstro marinho: corpo de serpente grossa com 4 nadadeiras (anda em terra com elas: anfíbio), cabeça de dragão marinho com presas, barbatana dorsal de time | não | idle · walk · attack · die |
| `talos` | 6 | biped | o esqueleto e as poses do `colossus.json` (copie `size`, `anchor`, `anims`, `sizeClass: 'titan'`), finish `talos` novo: bronze escuro com veias de cobre incandescente (`flame`) e rebites | não | as do colosso |

Voadoras no `biped` (só a harpia): poses novas em `art/poses/biped.json` — `idle_fly_biped` (4: paira, asas batendo
devagar, pernas recolhidas), `fly_biped` (8), `attack_fly_biped` (6: mergulho com as garras), `die_fly_biped` (6: cai
girando). No `beast` (grifo, dragão), as poses de voo saem do `gait.mjs` (J2). Escila e Ceto: `form` novo no `KIT` do `serpent`
(hoje `form: ['hydra', 'medusa']`) e poses em arquivos próprios com `source.poses`, como a Medusa faz com
`art/poses/medusa.json`: `art/poses/scylla.json` e `art/poses/ceto.json` (`idle_*`, `swim_*`, `attack_*`, `die_*`),
com a passada pelo `glide` da serpente (o `art:check` exige passada > 0 no `walk`).

Talos: a E6 criou `UNITS.talos` (D16 de lá: o Colosso vira Talos na Era VII) — crie `art/manifest/talos.json`. Só se o
`grep -n "talos" src/core/data/units.ts` vier vazio, use no `colossus.json` `"eras": [6]` com
`"eraParams": { "6": { "finish": "talos" } }` (cópia `colossus_e6` em `units_e6`, escolhida pela Era do dono, D12).

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
| projétil `bullet` | `scripts/bake/fx/catalog.mjs` (`FX_PROJECTILES`) + `PROJECTILE_KINDS` + `FX_FAMILIES` (`src/render/fx/FxTextures.ts`) | traçante: risco 10 × 1,5 px laranja-claro (`0xffd890`), desenhado aditivo como o `bolt` (`raster2d`, entra no `isEmissive`), 8 direções; arco 0; velocidade ×2,5 da flecha |
| projétil `shell` | idem | esfera r 3 px ferro escuro com brilho (SDF iluminado, como a `stone`); arco 0,16 |
| projétil `grenade` | idem | esfera r 2,5 px preta com faísca do pavio (SDF); arco 0,45 |
| família `flash` | `fxItems` do catálogo + `FX_FAMILIES` (`flash: { n: 4, w: 16, h: 16 }`) | clarão de boca 4 quadros (estrela de 5 pontas amarela → branca), 16 px, aditivo |
| `gunpowderProjectile(def)` | `src/render/fx/logic.ts` | `rhodian_slinger` → `stone`; tag `gunpowder`: `attackType === 'crush'` com área (`splash`) e sem tag `siege`/`ship`/`mechanical` → `grenade`; `crush` → `shell`; senão `bullet`; o resto como hoje (a tag `fire` já é `fireball` pela E3) |
| clarão + fumaça de pólvora | `recipes.ts` (`gunSmoke`) e `projectile.ts` | no disparo de `bullet`/`shell`: 1 clarão na boca (`muzzles` do índice; senão 0,6 tile à frente) + 3 baforadas cinza-claras (`0xd8d4cc`, alfa 0,5 → 0, 1,2 s, sobem 0,3 tile); família `gunsmoke` com teto de 18 % do orçamento (`GROUP_CAP` em `src/render/fx/logic.ts`, ao lado de `smoke`/`dust`/`fire`); prioridade "combate" |
| explosão | `projectile.ts` no impacto de `shell`/`grenade` | clarão laranja 0,4 tile + 8 faíscas + poeira (a do desabamento, 50 %) + decalque `decal/burn` (o de queimadura de hoje, escala 0,6) |
| fumaça de motor | `unitFx.ts` | tag `mechanical` andando: 1 baforada cinza-escura a cada 0,25 s na traseira; parado: 1 a cada 0,8 s; contador `counts.engine` |
| vapor de navio | `unitFx.ts` (tabela `STACKS`) | navio cujo asset é `rig: 'steam'`, `ironclad` ou `battleship`: fumaça preta da chaminé (posição relativa por estilo na tabela), 1 baforada a cada 0,3 s andando; contador `counts.stack` |
| esteira | `unitFx.ts` | navio andando: 2 traços em V de espuma (`0xeef6f8`, alfa 0,6 → 0, 1,5 s) atrás da popa, a cada 0,2 s; parado nada; contador `counts.wake` |
| chaminés | `rules.ts` (`CHIMNEY_SMOKE`, nova) + `ambient.ts` (`building()`) | edifício pronto, sem dano e à vista cujo asset mostrado tem chaminé (`ERA_KITS[bv.era].chimney`; os 8 tipos da seção 3): fio de fumaça `stack` (mais escuro e mais alto que a lareira) a cada 0,7 s, posição `{ dx, h }` por tipo como na `WORK_SMOKE`; independe da fila (a `WORK_SMOKE` da lareira/forja fica como está, só para o time do jogador local) |
| poeira da troca de Era | `FxSystem.eraChange(view)` | 10 partículas de poeira de obra ao redor da pegada + 1 anel de poeira, 0,8 s |
| "+N ouro" | `unitFx.ts` (observador, D31) | quando uma unidade com `UNITS[type].trader` do time do jogador local troca `routeLeg` de 1 para 2 ou de 2 para 1 (chegada com carga, E5): texto flutuante dourado "+N" sobre o ponto de chegada, 1,5 s, sobe 0,6 tile; N = `routeGold(state, owner, a, b, kind)` de `src/core/sim/trade.ts` (só leitura). Sem tipo de efeito novo no núcleo |
| poderes da E6 | `src/render/fx/handlers/divine.ts` (P9) | um ramo por `e.src`, tabela no passo P9 |

### 13. Ícones (Bloco L e fim de cada bloco de arte)

- `unit/<id>` e `bld/<id>` dos tipos novos (unidades, navios, criaturas, maravilhas, Pedreira, poços, Refinaria,
  Estaleiro) saem **sozinhos** dos manifestos: o `hudItems` do catálogo itera `art/manifest` (unidade → `unit/<id>` no
  `idle` em três quartos; edifício com `icon` → `bld/<id>`). Basta `npm run art:hud` depois de criar os manifestos — e é
  obrigatório no fim de cada bloco de arte: o `art:check` compara o índice do `hud` com o catálogo ("ícones do índice ≠
  catálogo"). As cópias por Era não ganham ícone (o `hud.mjs` lê os manifestos crus, sem expandir).
- Sai o `SHIP_ICONS` que a E4 pôs em `scripts/bake/hud/catalog.mjs` (e o uso dele no `hudItems`/`hudNames`): com os
  manifestos, os navios já têm `unit/<id>`; com os dois, o nome sairia repetido.
- Estudos de evolução: um ícone **por degrau** `tech/evo_<linha>_<n>` com o modelo do degrau que o estudo libera
  (`{ kind: 'unit', unit: '<degrau>' }` no `TECH_ICONS`; lista gerada no passo L1: 43 das linhas de terra + 7 dos
  navios de guerra); `tech/evo_<linha>` (o de linha da E3/E4) continua só para cidadão, pesca e transporte — os
  `evo_<linha>` das outras linhas saem do `TECH_ICONS` (o teste "o catálogo não tem ícone órfão" derruba quem sobrar).
- Idades: `age/4` canhão (troca o elmo escuro provisório da E1), `age/5` tricórnio, `age/6` engrenagem (objeto `gear`
  novo em `hud-objects.js`: anel de 12 dentes de `castIron`), `age/7` continua o vulcão da E1.
- Poderes da E6: `POWER_ICONS` próprios para `panic`, `crossroads`, `spring`, `gale`, `tidal_wave`, `divine_harvest`,
  `sun_chariot`, `winged_victory`, `retribution` (a E6 usou objetos que já existiam: `salpinx`, `compass`, `kylix`…).
- Retratos: os 9 bustos da E6 em `scripts/bake/page/hud-gods.js` ("provisórios até a E8") revistos ao lado dos 12 de hoje.

### 14. Orçamento por Era (D24; preencha a coluna "medido" no fim)

| Grupo | Conteúdo | Teto 1× | Medido |
|---|---|---|---|
| `buildings` (base) | 21 + novos (Era base) | 30 MB | |
| `buildings_e<n>` (cada) | cópias da Era n | 30 MB | |
| `units_e<n>` (cada, sem as páginas próprias) | unidades da Era n | 15 MB | |
| Era n (`buildings_e<n>` + `units_e<n>`, sem as páginas próprias) | — | **40 MB** | |
| `wonders` | 17 maravilhas | 30 MB | |
| pior caso de uma partida | base (sem páginas próprias) + 4 maiores páginas próprias + 3 maiores Eras + `wonders` | **260 MB** | |
| PNG total (`public/art`) | tudo | **500 MB** | |
| PNG do `hud` | ícones e retratos | **8 MB** | |

Para comparar: hoje o grupo `buildings` ocupa 21 MB de VRAM a 1× e as 19 unidades não míticas ~38 MB (páginas
compartilhadas); o PNG total é 117 MB. Se o PNG passar de 500 MB: tire o 2× (`"scales": [1]`) primeiro dos navios
`myth` grandes (`dromon`, `ironclad`, `quinquereme`), depois de `wonders`, e anote em `docs/ART.md` §6 (os `titan` já
saem só a 1×). Se uma Era passar de 40 MB: tire essa Era do `eras` dos edifícios que não mudam de função nela e mais pesam (o D2
mostra a cópia da Era anterior), atualize a lista esperada no teste (3) de `tests/art-eras.test.ts` e anote no
Apêndice J. Não mexa em `size.tiles` (a caixa é a mesma do base: mudaria a arte de hoje) nem tire estados ou variantes.

## Passo a passo

Regras para todos os blocos:

- Rascunhos, caches de comparação e capturas intermediárias ficam em `scratch/e8/` (fora do git; crie com
  `mkdir -p scratch/e8`). Se `scratch/` não estiver no `.gitignore`, **não** o acrescente: só não faça `git add` dele.
- Bake longo (mais de 2 min) sempre em segundo plano com log: `node scripts/bake/bake.mjs … > scratch/e8/<nome>.log 2>&1`
  e acompanhe com `tail -n 5 scratch/e8/<nome>.log`. Lembre que o hash de entrada de **todo** edifício inclui todos os
  `page/buildings*.js` e `page/rigs/buildings-*.js`, o `manifest.mjs` e o `materials.js` (`sourceFiles` em `bake.mjs`):
  mexer num builder reassa os edifícios base (os 22 manifestos de hoje + os 5 novos do R3) e as 111 cópias. Um bake completo de edifícios leva dezenas de minutos.
- O bake só grava folhas de contato com `--contact <pasta>` (sem a opção, nenhuma). O nome é
  `etapa<stage>-<contact ou id>-contato.png`: edifícios sem `stage` saem como `etapa3-…` (cópia: `etapa3-<id>-e<n>-contato.png`),
  unidades da E8 (`stage: 8`) como `etapa8-<id>-contato.png`; o log lista cada folha (`folha de contato: …`).
- Toda folha de contato e toda captura nova é **olhada** com a ferramenta Read antes do commit. Se algo sair errado
  (peça flutuando, cor de time faltando, telhado atravessando parede), corrija antes de seguir.
- Commits de código podem sair a cada passo; os PNG de `public/art` entram só no passo final de cada bloco de arte.
- Todo commit em português, com o rodapé de atribuição que a sessão indicar (linhas `Co-Authored-By`/`Claude-Session`).
  Faça push só para a branch da sessão (rotina do `docs/eras/LEIA-ME.md`); nunca para `main` sem pedido do dono.

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
  Esperado: **55 unidades** (`merchant` da E2, as 41 da E3, `caravan` da E5 e as 12 criaturas da E6) e **22
  edifícios** (`quarry`, `naphtha_well`, `oil_well`, `refinery` da E2, `shipyard` da E4 e as 17 maravilhas da E7; mais
  `university`/`factory` se existirem). Os 11 navios (10 da E4 + `merchant_ship` da E5) **não** estão no alias: são
  procedurais (`drawShip`) e também entram na lista de trabalho (`grep -n "cls: 'ship'" src/core/data/units.ts`).
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
  O `debugSpawn` com a camada naval a E4 já fez (`nearestFreeTile(session.state.map, x, y, 12, IDENTITY_FRAME, layerOf(UNITS[type] ?? {}))`:
  o 5º parâmetro é o referencial, o 6º a camada `'land' | 'naval'`, e `'amphibious'` desde a E6); confira com `grep -n "debugSpawn" src/main.ts` e,
  se faltar, faça como o guia da E4 (passo do `layerOf`). Os scripts de captura também podem escrever direto no estado
  pela página (o `artages.mjs` de hoje faz `st.players[me].age = age`): o `debugSetAge` só deixa isso explícito.
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
     (`buildings_e1` existe na lista mas nunca recebe asset: a Era 1 é a base. Grupo sem asset não gera atlas.)
  2. `UNIT_VARIANT_BY` **não muda** (`['heads']`): as cópias de unidade por Era usam o campo `eras` (D12), não o
     `unitVariants`.
  3. `RIGS` ganha `'vehicle', 'ship', 'bird'` (no fim).
  4. Em `validateManifest` (vale para edifícios e unidades):
     - `eras`: lista não vazia de inteiros 0–7 sem repetição e sem a Era base (`baseEraOf`, A2); nas unidades, todos
       maiores que a base; proibido em maravilhas (`id` começa com `wonder_`), `titan_gate`, `cornucopia` e `rubble`;
     - `eraParams`: objeto cujas chaves são `"*"` ou índices presentes em `eras`; valores objetos;
     - `eraNoVariants`: boolean; `atlasGroup`: string de `ERA_GROUPS`;
     - mensagem de erro no padrão de hoje (`${where}: …`).
  5. Para unidades: `era` inteiro 0–7 (opcional; as 35 de hoje não têm e continuam no grupo `units`).
  6. `posesOf`: o `rider` vale também para `s.rig === 'vehicle' && s.params?.rider` (a moto); na validação, a exigência
     de `a.rider` em cada animação idem (hoje só `horse`). O "sem cavaleiro" continua `rider: null`.
  *Conferir:* `npx vitest run tests/art-manifest.test.ts` (passa sem mudança: nenhum manifesto usa os campos ainda).
- [ ] **A2. Expansão das Eras.** Em `manifest.mjs`, depois de `expandUnitVariants`:
  ```js
  /** Era base de um asset (a do id sem sufixo): edifício = `source.params.era`, senão 1 (Clássica, a arte de hoje);
   *  unidade = o campo `era`, senão 0 (as 35 de hoje). */
  export function baseEraOf(m) { return m?.kind === 'unit' ? (m.era ?? 0) : (m?.source?.params?.era ?? 1); }
  /** Id da cópia de um asset na Era n (edifícios e unidades). */
  export const eraCopyId = (id, n) => `${id}_e${n}`;
  /**
   * E8 (kit de Era): um manifesto com `eras` vira o asset base + uma cópia por Era (`<id>_e<n>`, `params.era = n`,
   * `eraOf` = id base, `eraValue` = n, folha de contato `<contact>-e<n>`, sem ícone). Edifício: cópia no grupo
   * `buildings_e<n>`; o base recebe `params.era` = Era base explícita e `eraBase`. Unidade: cópia com `era: n` (grupo
   * `units_e<n>`, folha só nas direções `variantContactDirs`) e o base fica EXATAMENTE como o manifesto sem os campos
   * de Era (o cidadão continua no grupo `units`, que a E8 não reempacota). `eraParams['*']` e `eraParams[n]`
   * sobrescrevem os parâmetros (um `null` ali apaga a chave; os `null` do próprio manifesto, como `rider: null`,
   * ficam); `eraNoVariants` tira as variantes das cópias (casa/templo .glb). Sem `eras`: [m].
   */
  export function expandEraVariants(m) {
    if ((m?.kind !== 'building' && m?.kind !== 'unit') || !Array.isArray(m.eras) || !m.eras.length || m.source?.type !== 'param') return [m];
    const base = baseEraOf(m), unit = m.kind === 'unit';
    const { eras, eraParams = {}, eraNoVariants, ...rest } = m;
    const head = unit ? rest : { ...rest, eraBase: base, source: { ...m.source, params: { ...m.source.params, era: base } } };
    const out = [head];
    for (const n of eras) {
      const over = { ...(eraParams['*'] ?? {}), ...(eraParams[String(n)] ?? {}) };
      const params = { ...m.source.params, ...over, era: n };
      for (const [k, v] of Object.entries(over)) if (v === null) delete params[k];
      const copy = { ...rest, id: eraCopyId(m.id, n), source: { ...m.source, params }, eraOf: m.id, eraValue: n, contact: `${m.contact ?? m.id}-e${n}` };
      if (unit) { copy.era = n; copy.contactDirs = m.variantContactDirs ?? [1, 2]; }
      else copy.atlasGroup = `buildings_e${n}`;
      delete copy.icon;
      if (eraNoVariants) { delete copy.variants; delete copy.variantBy; }
      out.push(copy);
    }
    return out;
  }
  /** Todas as expansões (variantes de unidade da hidra e cópias por Era). */
  export function expandAll(m) { return expandUnitVariants(m).flatMap(expandEraVariants); }
  ```
  e troque `loadAssets` para `flatMap((l) => expandAll(l.manifest))`.
  Cuidado: o `params.era` do base de edifício **entra no hash** e muda a semente? Não: a semente (`buildBuilding`) não
  usa a Era (Bloco C). Mas muda o hash de entrada, então os edifícios serão reassados (esperado, ver Armadilhas).
- [ ] **A3. Grupo nos quadros e no filtro.** `atlasOf(m, f)` vira `f.atlas ?? atlasGroupOf(m)`. Em `matchesOnly`, troque
  `o === GROUP_OF[m.kind]` por `o === atlasGroupOf(m)` e acrescente `o === m.eraOf`:
  ```js
  return only.some((o) => o === m.id || m.id.startsWith(o + '-') || o === m.kind || o === atlasGroupOf(m) || (m.eraOf && o === m.eraOf));
  ```
  Assim `--only buildings` assa só o grupo base (como hoje), `--only buildings_e3` só as cópias da Era 3,
  `--only units_e3` as unidades com `era: 3` e as cópias `_e3`, `--only wonders` as maravilhas novas e
  `--only town_center` o base e as cópias do CC. Para os assets de hoje `atlasGroupOf(m) === GROUP_OF[m.kind]`: nada muda.
  (Não use `--only building`/`--only unit`, no singular: o `o === m.kind` casa com tudo daquele tipo, cópias inclusive.)
- [ ] **A4. `scripts/bake/bake.mjs`.**
  1. Importe `ERA_GROUPS`, `atlasGroupOf`, `expandAll`; troque toda chamada de `expandUnitVariants` por `expandAll`
     (o laço principal e a validação do `main`, o `--preview` e onde mais aparecer: `grep -n "expandUnitVariants" scripts/bake/*.mjs scripts/bake/*.ts`
     — o `check.ts` também, A5).
  2. Em `packAll`, o laço `for (const group of ATLAS_GROUPS)` vira `for (const group of [...ATLAS_GROUPS, ...ERA_GROUPS])`
     e o filtro dos quadros por grupo usa `atlasGroupOf(m)` no lugar de `GROUP_OF[m.kind]` (a linha
     `const frames = e.frames.filter((fr) => (fr.atlas ?? GROUP_OF[m.kind]) === group)`). Grupo sem nenhum asset não
     gera atlas.
  3. No resumo por asset do índice (`index.assets[m.id]`), o `group` já é o do laço; grave também, quando existirem,
     `eraOf`, `eraValue`, `eraBase`, `era` (edifícios e unidades) e, no H5, `muzzles`.
  4. A ordem de empacotamento dentro de um grupo não muda (os antigos saem nas mesmas páginas).
  5. `sourceFiles`: (a) `buildingModules()` deixa de fora `rigs/buildings-wonders.js` (Bloco F) quando o estilo do
     manifesto não começa com `wonder_` — nenhum outro estilo usa as funções dele, e sem isso cada maravilha nova
     reassaria os edifícios base e as 111 cópias; (b) a lista dos props ganha `scripts/bake/page/rigs/horse.js` e o que ele
     importa (`RIG_FILES.horse`), porque o U7 desenha os cavalos selvagens com o rig do cavalo.
  *Conferir:* `node scripts/bake/bake.mjs --only barracks --scale 1 --out scratch/e8/a4` (sem `eras` ainda: o índice
  do rascunho tem `barracks` no grupo `buildings`, igual a hoje).
- [ ] **A5. `scripts/bake/check.ts`.**
  1. `expandAll` no lugar de `expandUnitVariants` (a validação e a lista `manifests`).
  2. O tipo do grupo sai do prefixo: `group.startsWith('buildings') || group === 'wonders'` → `'building'`;
     `group.startsWith('units')` → `'unit'` (hoje é `(Object.keys(GROUP_OF)).find((k) => GROUP_OF[k] === a.group)`, que
     devolveria `undefined` para `buildings_e3`).
  3. `BUDGET.maxPngMB = 500`; novos `maxEraVramMB: 40` e `maxWonderVramMB: 30`; `maxVramMB: 260` passa a valer para o
     pior caso (comentário: "pior caso de UMA partida: base sem páginas próprias + 4 maiores páginas próprias + 3
     maiores Eras + wonders"); `maxHudPngMB: 8`.
  4. `stats.vramByEra: Record<scale, number[8]>` (soma dos atlas de `buildings_e<n>` + `units_e<n>`, **sem** as páginas
     próprias) e `stats.vramWorstMatch: Record<scale, number>`; erros "Era n a s×: X MB > 40·s² MB" e "pior caso a s×: …".
     Página própria = página cujos quadros são de um asset só com `page: 'own'` no manifesto (a mesma conta de
     `AtlasSource.ownsPages`: nenhum outro asset do índice cita o arquivo).
  5. O erro antigo de `vramByScale` sai (o total de tudo carregado passa a ser só informativo no log).
  6. Na chamada de `hudErrors` (fim de `runCheck`), as unidades passam a ser
     `manifests.filter((m) => m.kind === 'unit' && !m.variantOf && !m.eraOf)`: o atlas `hud` não tem ícone de cópia.
  7. Ao lado da conferência de `unitVariants`, uma nova: todo asset com `eraOf` está no índice no grupo
     `units_e<eraValue>`/`buildings_e<eraValue>` (se já assado).
  *Conferir:* `npm run art:check` (mesmos números de hoje + "Eras: 0 0 0 0 0 0 0 0 MB"), `npx vitest run tests/art-manifest.test.ts`
  (o teste de orçamento é atualizado no passo A7).
- [ ] **A6. `scripts/bake/cache-diff.mjs` (novo).** Compara dois diretórios de cache, asset por asset e escala por
  escala (`<id>/<escala>x-<hash>/`: o `commitCache` de `bake.mjs` apaga as entradas velhas, então há uma por escala),
  quadro a quadro: para cada passe, o retângulo (`x, y, w, h` do `passes[<passe>]`) e os bytes dos pixels decodificados
  com `pngjs` (`readPng` de `bake.mjs` como modelo). Uso:
  ```bash
  node scripts/bake/cache-diff.mjs scratch/e8/cache-antes art/cache --ids barracks,stable --alias town_center@a1=town_center,town_center@a0=town_center_e0,town_center@a2=town_center_e2
  ```
  `--alias velho@variante=novo` compara os quadros `<velho>/<estado>/<variante>` do cache antigo com `<novo>/<estado>`
  do novo; com a variante do ícone (`velho@<icon.variant>`), o quadro do ícone (`<velho>`, sem estado) com `<novo>`. Sai
  com código 1 e lista os quadros diferentes; com tudo igual imprime `igual: N quadros`. Leia o formato do cache em
  `loadCache`/`bakeAsset` de `bake.mjs` antes de escrever (`frames.json`: `entry.frames[].passes.<passe>.file`).
- [ ] **A7. Centro Cívico por Era (D7): código e prova com um manifesto de prova.** O `art/manifest/town_center.json`
  oficial **só muda no R1** (mudar agora deixaria o índice de `public/art` com as variantes `a0/a1/a2` e o manifesto
  sem: `art:check` e os testes vermelhos até a fusão do R5).
  1. `scripts/bake/page/buildings.js`: em `buildBuilding`, a semente usa `params.seedVariant ?? params.variant ?? ''`
     no lugar de `params.variant ?? ''` (o resto da string igual); no builder do CC (`BUILDERS.town_center`), troque
     `const tier = p.variant === 'a0' ? 0 : p.variant === 'a2' ? 2 : 1;` por
     `const v = p.variant ?? p.seedVariant; const tier = v === 'a0' ? 0 : v === 'a2' ? 2 : 1;` e, logo depois da função,
     `BUILDERS.town_center.eraOwn = [0, 1, 2];` (lido no C3).
  2. Manifesto de prova `scratch/e8/probe/tcprobe.json`: cópia de `town_center.json` com `"id": "tcprobe"`, sem
     `variants`/`variantBy`, `"icon": { "anim": "complete" }`, `source.params` = `{ "style": "town_center", "seedVariant": "a1" }`,
     `"eras": [0, 2, 3, 4, 5, 6, 7]` e `"eraParams": { "*": { "seedVariant": "a2" }, "0": { "seedVariant": "a0" } }`
     (o `--preview` recusa ids que já existem em `art/manifest`; a semente usa o estilo, não o id).
  3. Asse a prova (só cache e folhas, nada em `public/art`):
     `node scripts/bake/bake.mjs --preview scratch/e8/probe --scale 1,2 --contact scratch/e8/probe/contato > scratch/e8/a7.log 2>&1`.
     As Eras 3–7 vão sair iguais à e2 até o Bloco C (o remapeamento ainda não existe): normal.
  4. Prova byte a byte: `node scripts/bake/cache-diff.mjs scratch/e8/cache-antes art/cache --ids town_center --alias town_center@a1=tcprobe,town_center@a0=tcprobe_e0,town_center@a2=tcprobe_e2`
     → `igual`.
  5. Crie `tests/art-eras.test.ts` com os testes da seção "Testes" que não dependem dos manifestos reais (1, 2, 5, 6,
     7); o (3) e o (4) entram no R6 e no U10, quando os manifestos existem.
  *Conferir:* `npx vitest run tests/art-manifest.test.ts tests/art-eras.test.ts` e `npm run art:check` verdes; nada
  muda em `public/art`.

### Bloco B — Renderizador por Era (2 dias; ainda sem cópias assadas, nada muda na tela)

- [ ] **B1. Tipos e funções puras (`src/render/art/types.ts`, `logic.ts`).**
  ```ts
  // types.ts
  export type EraGroup = `buildings_e${number}` | `units_e${number}` | 'wonders';
  export type ArtGroup = 'units' | 'buildings' | 'props' | 'icons' | 'fx' | EraGroup;
  // em ArtAssetEntry, depois de `variantValue?`:
  /** E8: cópia por Era de outro asset (id base e Era), Era base do asset sem sufixo, Era da unidade nova, boca da arma. */
  eraOf?: string; eraValue?: number; eraBase?: number; era?: number; muzzles?: { x: number; y: number }[];
  ```
  ```ts
  // logic.ts
  /** Grupos de atlas carregados sob demanda (E8): as Eras dos edifícios e as maravilhas novas. */
  export function isOnDemandGroup(g: string): boolean { return /^buildings_e\d$/.test(g) || g === 'wonders'; }
  /** Grupos de unidade (carregados por tipo): o de hoje e os por Era. */
  export function isUnitGroup(g: string): boolean { return g === 'units' || /^units_e\d$/.test(g); }
  /**
   * Asset de um tipo na Era `era` (D2; edifícios e as cópias por Era das unidades, D12): a maior Era ≤ `era` entre a
   * base e as cópias PRONTAS (`ready(id)`); sem nenhuma, o próprio tipo. `eras` = { Era: id } vindo do índice
   * (ArtLibrary.erasOf).
   */
  export function buildingEraId(type: string, eras: Readonly<Record<number, string>> | null, era: number, ready: (id: string) => boolean): string {
    if (!eras) return type;
    let best = -1, id = type;
    for (const k in eras) { const n = Number(k); if (n <= era && n > best && (eras[n] === type || ready(eras[n]))) { best = n; id = eras[n]; } }
    return id;
  }
  ```
  O `unitArtId` (hidra por cabeças) **não muda**: a Era das unidades é escolhida no `ArtLibrary.unitId` (B3) pelo
  mesmo `buildingEraId`.
  *Conferir:* testes de `buildingEraId` em `tests/art-eras.test.ts` (seção "Testes").
- [ ] **B2. `src/render/art/era.ts` (novo).**
  ```ts
  import { LINES, TECHS, UNITS, evoTechId } from '../../core/data';
  import { unitLinesOn } from '../../core/sim/lines';   // E3; confira: grep -n "export function unitLinesOn" -r src/core
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
   * estudo "A vapor", e o cidadão acompanha os estudos da Biblioteca. Sem as linhas (campanha, cenário), a Era do dono.
   */
  export function unitArtEra(state: GameState, u: Pick<Unit, 'type' | 'owner'>): number {
    const era = playerArtEra(state, u.owner);
    const def = UNITS[u.type], lineId = def?.line;
    const line = lineId ? LINES[lineId] : undefined;
    if (!line || !lineId || !unitLinesOn(state) || !line.steps.every((s) => s === null || s === u.type)) return era;
    const techs = state.players[u.owner]?.techs ?? [];   // Player.techs é string[] (o mesmo que lineUnitOf lê)
    for (let k = 1; k < line.steps.length; k++) {
      const tid = evoTechId(lineId, k);
      if (TECHS[tid] && !techs.includes(tid)) return Math.min(era, k - 1);
    }
    return era;
  }
  /** Eras visuais em jogo (todos os jogadores) + a próxima do jogador local: pré-carga dos grupos (D23). */
  export function erasInPlay(state: GameState, local: number): number[] {
    const s = new Set<number>();
    state.players.forEach((_, i) => s.add(playerArtEra(state, i)));   // não há jogador Gaia: o 0 é um jogador de verdade
    const next = Math.min(7, (state.players[local]?.age ?? 0) + 1);
    s.add(visualEra(next, state.config.visualEraMax));
    return [...s].sort((a, b) => a - b);
  }
  ```
- [ ] **B3. `AtlasSource.ts` e `ArtLibrary.ts`.**
  1. `LoadKind = 'group' | 'unit' | 'era'`; em `ensure(group, scale)`, o `ensureSheets(…, 'group')` passa
     `isOnDemandGroup(group) ? 'era' : 'group'` (importe de `./logic`, como o `checkSheetMeta`).
  2. `AtlasSource.unloadGroup(group: ArtGroup): boolean` — libera as duas escalas do grupo (o `release` privado que o
     `unloadScale` usa, e `this.groups.delete(key)`; pule a escala com página ainda `loading`) e devolve se havia algo
     carregado.
  3. `ArtLibrary`:
     - `onChange`: `if (kind === 'era') { this.buildingsArt.clear(); for (const g of [...this.servedCache.keys()]) if (isOnDemandGroup(g)) { this.servedCache.delete(g); this.passCache.delete(g); } this.eraGen++; return; }`
       (antes do `prewarm`/`bump` de hoje: a chegada de um grupo de Era **não** muda `generation`);
     - campo público `eraGen = 0` (comentário: "muda quando chega um grupo de Era/maravilhas: o renderizador troca as
       vistas desses edifícios, sem reconstruir o resto");
     - `prewarm` continua só com `GROUPS` (os 5 de hoje); os grupos sob demanda **não** entram em `GROUPS`;
     - `collect()`: troque `g !== 'units'` por `!isUnitGroup(g)` (nada muda para os grupos de hoje) e inclua os grupos
       sob demanda já carregados na conta de `stillServed`;
     - `erasOf(type): Readonly<Record<number, string>> | null` — do índice: `{ [base]: type }` mais `{ [eraValue]: id }`
       de cada asset com `eraOf === type`, com `base = a.eraBase ?? a.era ?? (a.kind === 'unit' ? 0 : 1)` (a entrada
       do `villager` é a de hoje, sem `eraBase`); varra `manifest.assets` uma vez e guarde num `Map` (limpo no `bump` e
       no `onChange('era')`); `null` se o tipo não tem cópias;
     - `assetEra(id): number` — `a.eraValue ?? a.eraBase ?? a.era ?? (a.kind === 'unit' ? 0 : 1)` (a Era do asset
       MOSTRADO: o B4 guarda na vista e o P4 decide a chaminé por ela);
     - `buildingReady(id): boolean` — o grupo do asset está pronto na escala pedida ou na outra: leia
       `this.atlas.status(grupo, escala) === 'ready'` direto (**não** use `served()`, que pede o carregamento);
     - `ensureEras(eras: Iterable<number>)` — pede `buildings_e<n>` na escala de `scaleFor`, pulando as Eras sem atlas no
       índice (`this.atlas.scalesOf(g).length === 0`: a Era 1, que é a base, e as que ainda não foram fundidas);
       `ensureWonders()` idem para `wonders`;
     - `releaseEras(inUse: Iterable<string>, now: number, graceS = RELEASE_GRACE_S): string[]` — `inUse` são **nomes de
       grupo**; guarda a última vez em que cada grupo sob demanda esteve em uso; depois de `graceS` s de jogo sem uso,
       `unloadGroup`, apaga o grupo de `servedCache`/`passCache`, limpa `buildingsArt`, sobe `eraGen` e devolve os
       grupos liberados (relógio que voltou = partida nova, como em `releaseUnused`);
     - `unitId(type, heads = 1, era = 0)`: `const t = unitArtType(type)` (alias da E2) → `const id = unitArtId(t, this.atlas.manifest?.assets[t], heads)`
       (como hoje) → com `const eras = this.erasOf(t)`, devolve `eras ? buildingEraId(id, eras, era, this.unitReady) : id`;
       `unitReady(id)` (campo `private readonly unitReady = (id: string): boolean => …`, sem closure por chamada):
       se o asset existe e é `unit`, pede as páginas uma vez (`if (!this.requested.has(id)) this.requestUnit(id)`) e
       devolve se `this.atlas.assetStatus(id, escala) === 'ready'` na escala desejada ou na outra. Enquanto a cópia
       carrega, a unidade mostra o asset da Era anterior (nunca o procedural); a chegada sobe `unitGen` e o `getView`
       troca a vista (B7).
  *Conferir:* `npm run -s typecheck`; `npx vitest run tests/art-library.test.ts` (sem mudança de comportamento).
- [ ] **B4. `BuildingView.ts`.** `readonly type` continua (o tipo do núcleo); acrescente `artId: string` (inicial =
  `type`) e `era = 1` (a Era do asset mostrado); `show()` usa `this.artId` em `this.lib.building(...)`; e
  ```ts
  /** Troca o asset (outra Era): o próximo show() refaz o quadro mesmo com o mesmo estado/variante. */
  setArt(id: string, era: number): boolean {
    if (id === this.artId) return false;
    this.artId = id; this.era = era; this.state = ''; this.variant = null; this.maskVersion = -1;
    return true;
  }
  ```
- [ ] **B5. `renderer.ts`, edifícios.** No ramo `if (v.bld)` de `updateEntities` (procure `const art = this.art.buildingArt(b.type)`):
  1. Mova a linha `const live = this.liveToLocal(state, ui.localPlayer, b) || v.bld.state === '';` para **antes** de
     `const art = …` e troque `const art = this.art.buildingArt(b.type);` por:
     ```ts
     if (live) {
       const t = buildingArtType(b.type);
       const era = buildingArtEra(state, b.owner);
       const id = buildingEraId(t, this.art.erasOf(t), era, this.bldReady);
       const changed = v.bld.setArt(id, this.art.assetEra(id));
       // poeira só quando a Era do DONO mudou com o edifício à vista — nem na criação da vista, nem quando o grupo da Era
       // termina de carregar (aí o id muda sem a Era mudar)
       if (changed && v.eraSeen !== undefined && v.eraSeen !== era && v.complete) this.fx.eraChange(v.bld);
       v.eraSeen = era;
     }
     const art = this.art.buildingArt(v.bld.artId);
     ```
     com o campo `private readonly bldReady = (id: string): boolean => this.art.buildingReady(id);` na classe (nada de
     função nova por quadro) e `eraSeen?: number` na vista (`EntityView` no renderer). `buildingArtType` é o alias
     da E2 (depois do Bloco L ele devolve o próprio tipo). Crie já em `FxSystem` o método
     `eraChange(_bv: BuildingView): void {}` vazio, com um comentário "P5 preenche" (senão o typecheck do B8 falha).
  2. A variante: tire a linha `if (art?.variantBy === 'ageTier') variant = ageTier(...)` (nenhum asset usa mais) —
     **mantenha** a função `ageTier` em `logic.ts` e o valor em `VARIANT_BY` (dados antigos e testes).
  3. `v.bld.showGlow(... this.art.building(v.bld.artId, GLOW_ANIM, ...))` e o resto que usa `b.type` para pedir quadro
     passam a usar `v.bld.artId`. No `makeBakedView` o `buildingArt(e.type)` continua (a vista nasce com o base; o
     primeiro quadro vivo troca para a Era).
  4. Pré-carga: a cada 2 s de relógio de jogo (o mesmo relógio e o mesmo `if` do `releaseUnusedArt` em `render()`),
     `this.art.ensureEras(erasInPlay(state, local))`; e `this.art.ensureWonders()` quando (a) algum edifício do estado
     tiver o asset no grupo `wonders` (índice: `assets[tipo].group === 'wonders'`) ou (b) o fantasma de construção for
     de um tipo desse grupo. Até chegar, a maravilha sai procedural (o item 6 troca a vista quando o grupo chega).
  5. Liberação: no mesmo ponto, monte o conjunto de **grupos** em uso — o `group` do índice de cada `v.bld.artId` das
     vistas de edifício, `buildings_e<n>` de cada Era de `erasInPlay(state, local)` (o que a pré-carga pediu também
     está em uso: sem isso, pré-carga e liberação se alternariam a cada 20 s) e `wonders` nos casos do item 4 — e chame
     `this.art.releaseEras(grupos, t)`.
  6. Quando `this.art.eraGen` mudar (compare com um campo `lastEraGen`): para cada vista de edifício **procedural**
     (`!v.bld`) cujo tipo agora tem arte (`this.art.buildingArt(...) !== null`), destrua a vista (o `getView` a refaz
     assada no próximo quadro), do mesmo jeito que o `refreshUnitViews` faz quando `unitGen` muda. As vistas assadas
     não precisam de nada: o item 1 escolhe a cópia que ficou pronta no próximo quadro vivo.
- [ ] **B6. Fantasma, desabamento e escombros.**
  1. Fantasma (`updateGhost`): `const t = buildingArtType(p.type); const gid = buildingEraId(t, this.art.erasOf(t), playerArtEra(state, local), this.bldReady);`
     e use `gid` nas duas chamadas (`this.art.buildingArt(gid)` e `this.art.building(gid, 'complete', variant)`); a
     variante sai do `art` desse asset (`pick`/bitmask como hoje; sem o ramo `ageTier`).
  2. `RecentGone` (a interface no topo do renderer e o `push` no fim de `updateEntities`): grave `art: v.bld.artId` ao
     sumir (o procedural grava o tipo); em `src/render/fx/types.ts`, acrescente em `FxHost`
     `goneArt?(type: string, x: number, y: number): string | null` — mesma chave (tipo + posição) do `goneVariant` de
     hoje; o renderer implementa como o `goneVariant` (procura em `recentGone`); `src/render/fx/handlers/collapse.ts`
     usa `const artId = fx.host.goneArt?.(type, e.x, e.y) ?? type;` no `buildingArt` e nos dois `building(…)` do
     desabamento. Escombros (`rubble/<w>x<h>`, `addRubble(e, type, seen)`) não mudam.
- [ ] **B7. Unidades por Era.** Onde o renderer calcula o asset da unidade — `this.art.unitId(e.type, e.heads)` no
  `getView` (a comparação que já refaz a vista da hidra quando o id muda) e no `makeBakedView`, e
  `this.art.unitId(u.type, u.heads)` no `releaseUnusedArt` —, passe a Era: `this.art.unitId(type, heads, this.unitEra(state, e))`
  (`getView` recebe `state` do `updateEntities`, ou use `this.state`). O id diferente faz o `getView` destruir e refazer
  a vista (o cidadão quando a Era sobe ou quando a cópia termina de carregar), como na hidra.
  `unitEra(state, u)`: `unitArtEra` com cache por `owner:type` limpo quando `state.tick` muda (o laço dos estudos não
  pode rodar por unidade por quadro).
  Pré-carga (`warmUnits`, D23): a chave deixa de ser só a Era — `age + ':' + techs.length` do jogador local (um estudo
  de evolução troca o degrau); a lista passa a ser: para cada linha de `LINE_ORDER`, com `unitLinesOn(state)`,
  `lineUnitOf(jogador local, linha)` (ignore as linhas aposentadas e as navais sem Estaleiro do jogador); mais os tipos
  presentes no estado; mais `warmUnitTypes(UNITS, Era local, presentes)` filtrado para tipos sem `line` e sem a tag
  `ship`; e, para `villager`, `fishing_boat`, `transport_ship` e `merchant_ship`, o id que o `unitId` dá na Era do
  `unitEra` local. Sem as linhas (campanha/cenário), o `warmUnitTypes` de hoje.
- [ ] **B8. Testes do bloco** (`tests/art-eras.test.ts`, parte "renderizador" e "biblioteca"; seção "Testes"). Faça um
  teste com o `FakeAtlas` de `tests/art-collect.test.ts` (copie o `vi.mock`) para `ensureEras`/`releaseEras`/`eraGen`.
  *Conferir:* `npx vitest run tests/art-eras.test.ts tests/art-library.test.ts tests/art-collect.test.ts tests/art-release.test.ts tests/render-pick.test.ts tests/fx-registry.test.ts`,
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
  Importe `eraView`, `eraKit`, `eraDress` de `./rigs/buildings-era.js` no topo de `buildings.js`. `eraOwn` é uma
  propriedade do builder (`BUILDERS.town_center.eraOwn = [0, 1, 2]`, posta no A7), não do manifesto. Em `makeKit`,
  acrescente `roofs: [], chimneys: []` ao objeto `k`. Em `applyDamage`, deixe `const { THREE, M, group, rand } = k;`
  como está e troque só a linha do `matName` por
  `const matName = new Map(Object.entries(k.M0 ?? M).map(([n, m]) => [m, n]));` — a vista `Object.create(M)` só tem
  como chaves próprias os materiais trocados, e sem isso o dano não reconhece as paredes (`WALL_MATS`) nem os telhados.
  O `stateInfo` de hoje dá `stage: 3` para `complete`, `damage1`, `damage2` e `open` (só as obras são 0–2): é o `3` do
  código acima.
- [ ] **C4. Telhado e coluna pelo kit.** Em `makeKit`, `k.gable` passa a ler `k.eraKit` (definido em C3; se ausente,
  `eraKit(1)`):
  - `roof === 'tile'`: como hoje, mas `rise × pitch` e, fora da Era 1, `nRows = Math.max(1, Math.round(nRows * tileRows / 7))`
    — o `nRows` é o que o chamador passou (a casa pede `nRows: 1` no toldo, o CC `nRows: 5`…), nunca sobrescrito por
    `tileRows`; com `k.eraKit.era === 1`, nem a conta: o caminho de hoje, linha por linha;
  - `roof === 'thatch'`: duas águas sem fileiras, `rise × 1.35`, beiral 0,15 maior, material `M.terracotta` (que na
    Era 0 já é `thatch` pela vista);
  - `roof === 'slate'`: como `tile` com `nRows = 0` e `rise × 1.1`;
  - `roof === 'flat'`: laje (`k.block` de 0,12 de espessura no `y` do beiral) + platibanda de 0,18 em volta; sem frontão;
  - grave `k.roofs.push({ cx, cz, w, len, y, rise, axis })` (para o `eraDress`) só quando `parent === r` (num `parent`
    próprio as coordenadas são locais); o `push` não consome `rand()` e pode rodar também na Era 1.
  `k.shed` e `k.shedX` (existem os dois, logo abaixo do `k.gable`) seguem a mesma regra; o `flat` neles vira uma laje
  inclinada de 3° sem fileiras.
  `k.column(x, z, y0, h, rad, mat, capMat)`: por `k.eraKit.column` — `doric` (o de hoje), `post` (cilindro de `M.wood`
  r × 0,7, sem capitel), `corinthian` (capitel em cesto: cone invertido 0,22 de altura + 8 folhas como caixas finas),
  `byzantine` (capitel cúbico afunilado), `tuscan` (dórico sem estrias, base redonda), `iron` (fuste fino r × 0,45 de
  `M.castIron` com capitel de anel), `pillar` (caixa quadrada `rad × 1.8`, sem capitel).
  **Regra de ouro**: com `era === 1`, todo caminho de código tem de ser exatamente o de hoje (mesmas chamadas, mesma
  ordem, mesmos `rand()`), senão a base muda. Não consuma `k.rand()` em ramos que só existem em outras Eras **antes**
  de chamadas que já existiam.
- [ ] **C5. Prova byte a byte da base.** Asse todos os edifícios base num rascunho (o CC oficial ainda tem as variantes
  `a0/a1/a2`: compara direto, sem alias) e o manifesto de prova do A7, e compare:
  ```bash
  node scripts/bake/bake.mjs --only buildings --scale 1,2 --out scratch/e8/c5 > scratch/e8/c5.log 2>&1
  node scripts/bake/cache-diff.mjs scratch/e8/cache-antes art/cache --ids academy,barracks,cornucopia,farm,fortress,gate,granary,house,lumber_camp,market,mine,rubble,siege_workshop,stable,temple,titan_gate,tower,town_center,wall,wonder_artemis,wonder_colossus,wonder_zeus
  node scripts/bake/bake.mjs --preview scratch/e8/probe --scale 1,2 --contact scratch/e8/c6 > scratch/e8/c5-probe.log 2>&1
  node scripts/bake/cache-diff.mjs scratch/e8/cache-antes art/cache --ids town_center --alias town_center@a1=tcprobe,town_center@a0=tcprobe_e0,town_center@a2=tcprobe_e2
  ```
  Tem de dar `igual` em tudo. Se algum quadro mudar, o culpado é um `rand()` a mais, um material trocado na Era 1 ou o
  `nRows` do telhado. (Este é um bake longo: segundo plano.)
- [ ] **C6. Folha de prova do kit.** Olhe as 8 folhas de contato do CC de prova que o C5 gravou
  (`scratch/e8/c6/etapa3-tcprobe-contato.png` = Era II e `scratch/e8/c6/etapa3-tcprobe-e<n>-contato.png`; o log lista
  cada uma). As 8 têm de ser reconhecíveis pela tabela da seção 1 (a e0 e a e2 são o `a0`/`a2` de hoje). Commit:
  "E8 C: kit de Era no rig de edifícios (base idêntica)".

### Bloco R — Lote 1, edifícios das Eras I–IV (2 dias)

- [ ] **R1. `eras` nos manifestos.** Para cada linha da tabela 4, acrescente `eras` com a lista **completa** da tabela
  (as cópias 4–7 já saem com o kit genérico; o lote 2 só acrescenta as plantas próprias de V–VIII). Cópias
  com planta própria (`house` na Era 0, `farm`, muralha/portão/torre, `fortress`) leem `p.era` no builder.
  Ligue `B.eraDome`/`B.eraChimney` nos builders da tabela 4 (`BUILDERS.<estilo>.eraDome = true` logo depois da função,
  como o `seedIgnoresVariant` da torre). Casa e templo: `eraParams` e `eraNoVariants` (D8); os builders procedurais
  `BUILDERS.house` e `BUILDERS.temple` existem em `buildings.js` (de antes do Meshy). **Centro Cívico oficial** (o que
  o A7 fez no manifesto de prova): em `art/manifest/town_center.json`, tire `variants` e `variantBy`, `icon` vira
  `{ "anim": "complete" }`, `source.params` = `{ "style": "town_center", "seedVariant": "a1" }`,
  `"eras": [0, 2, 3, 4, 5, 6, 7]` e `"eraParams": { "*": { "seedVariant": "a2" }, "0": { "seedVariant": "a0" } }`;
  uma linha nova no `docs` ("Eras pelo kit de Era (E8); a0/a1/a2 de antes = e0/base/e2").
- [ ] **R2. Plantas próprias das Eras 0 e 3.** Muralha/portão/torre (paliçada; teodosiana), fazenda (vime e sapé),
  casa na Era 0 (cabana redonda: cilindro de adobe r 0,8 + cone de sapé), fortaleza na Era 3 (castelo). Cada planta
  própria é um `if (p.era === n)` no começo do builder que desenha a planta e retorna — **sem** tocar no caminho da
  Era 1. Mantenha o `k.breakable(...)` nas peças que caem no dano e o estandarte de time.
- [ ] **R3. Edifícios novos.** Pedreira (`quarry`: pátio de blocos de calcário cortados, guindaste de madeira de
  3 pernas, galpão), Estaleiro (`shipyard`: carreira inclinada para a água com um casco em obra, galpão de remos,
  guindaste), Poço de nafta (base 3: poço de pedra com sarilho e jarras de betume), Poço de petróleo e Refinaria
  (base 6). Manifestos novos com `size.tiles`/`anchor`/`footprint` copiados de um edifício de mesma pegada (2×2:
  `granary`; 3×3: `market`; a Refinaria é 3×3), os 6 estados, `icon`, `team: true`, `shadow: true`, `docs` com "glb" e
  `eras` da tabela 4. Estilos nos arquivos por lote (`scripts/bake/page/rigs/buildings-economy.js` para
  Pedreira/poços/Refinaria/Fábrica, `scripts/bake/page/buildings-military.js` para o Estaleiro) e registrados como os de
  hoje (`Object.assign(BUILDERS, ECONOMY_BUILDERS)` e `Object.assign(BUILDERS, MILITARY_BUILDERS)` já existem). O
  `MILITARY_STYLES` passa a ter o `shipyard`: acrescente-o ao `LOT` de `tests/art-military.test.ts` (o teste compara as
  duas listas).
- [ ] **R4. Bake do lote 1** (base + cópias 0–3; as cópias 4–7 também saem agora, com o kit genérico, e o lote 2 as
  refina). É o bake mais longo do lote (27 base — os 22 de hoje + os 5 novos — e 111 cópias, 1× e 2×): segundo plano.
  ```bash
  node scripts/bake/bake.mjs --only buildings,buildings_e0,buildings_e2,buildings_e3,buildings_e4,buildings_e5,buildings_e6,buildings_e7 --scale 1,2 --out scratch/e8/lote1-ed --contact scratch/e8/lote1-ed/contato > scratch/e8/lote1-ed.log 2>&1
  grep "sem cache válido" scratch/e8/lote1-ed.log      # só unidades e props podem aparecer aqui (não são assados agora); edifício, nunca
  ```
  Olhe as folhas de contato de **todas** as cópias 0–3 (`scratch/e8/lote1-ed/contato/etapa3-<id>-e<n>-contato.png`).
  Erros típicos: cúpula furando o telhado (abaixe o tambor), chaminé fora da casa (use a caixa de telhado certa), cor
  de time sumida (o remapeamento não pode tocar em `team`).
- [ ] **R5. Fusão.** `node scripts/bake/merge-group.mjs scratch/e8/lote1-ed --groups buildings,buildings_e0,buildings_e2,buildings_e3,buildings_e4,buildings_e5,buildings_e6,buildings_e7,icons`
  (não existe `buildings_e1`: a Era 1 é a base; o `icons` leva os ícones da Etapa 3 dos 5 edifícios novos — D26).
  Depois `npm run art:hud` (ícones `bld/` dos 5 novos no atlas do HUD) e `npm run art:check` sem erros; anote os MB
  por Era.
- [ ] **R6. Capturas, testes e commit do bloco.**
  1. Prova byte a byte com o CC oficial: `node scripts/bake/cache-diff.mjs scratch/e8/cache-antes art/cache --ids academy,barracks,cornucopia,farm,fortress,gate,granary,house,lumber_camp,market,mine,rubble,siege_workshop,stable,temple,titan_gate,tower,wall,wonder_artemis,wonder_colossus,wonder_zeus --alias town_center@a1=town_center,town_center@a0=town_center_e0,town_center@a2=town_center_e2`
     → `igual`.
  2. Alias: tire `quarry`, `naphtha_well`, `oil_well`, `refinery` e `shipyard` do `BUILDING_ART_ALIAS`
     (`src/render/art/alias.ts`).
  3. Testes: em `tests/art-manifest.test.ts`, `expect([tc.variantBy, tc.variants]).toEqual(['ageTier', ['a0', 'a1', 'a2']])`
     vira `expect([tc.variantBy, tc.variants, tc.eras]).toEqual([undefined, undefined, [0, 2, 3, 4, 5, 6, 7]])`; em
     `tests/art-library.test.ts`, `expect(manifest.assets.town_center.variantBy).toBe('ageTier')` vira
     `expect(manifest.assets.town_center_e0?.eraOf).toBe('town_center')`. No `tests/art-eras.test.ts`, o teste (3).
  4. Estenda `scripts/artages.mjs` (passo M2 descreve tudo; aqui só o mínimo): `--eras 0,1,2,3` gera
     `docs/art/e8-cidade-e<n>.png` com a Era do jogador local (`window.aoe.debugSetAge(s.local, n)`, ou
     `st.players[me].age = n` como o script já faz) antes de montar a cidade, lendo as Eras dos edifícios de
     `window.aoe.debugData()` em vez da tabela fixa `AGE_OF`. Rode, olhe as 4 imagens.
  5. `npx vitest run tests/art-manifest.test.ts tests/art-library.test.ts tests/art-military.test.ts tests/art-eras.test.ts tests/hud-icons.test.ts`
     e o commit com os PNG: "E8 R: edifícios por Era (lote 1, Eras I–IV)".

### Bloco U — Lote 1, unidades das Eras I–IV (3 dias)

- [ ] **U1. Kit humano.** `human.js`: os valores da seção 6 no fim de cada lista do `KIT`, as chaves novas (`legs`,
  `back`, `toolMetal`, `eraLook`) com o primeiro valor = comportamento de hoje, as peças (uma função por peça, no
  padrão das de hoje), `items.muzzle` nas armas de fogo e `ERA_LOOKS.citizen` (tabela 5) aplicado no começo de
  `buildHuman`: `const P = { …padrões, ...params, ...(params.eraLook === 'citizen' && params.era > 0 ? ERA_LOOKS.citizen[params.era] : {}) };`.
  Os materiais das peças novas: use `M.steel`, `M.khaki`, `M.navy`, `M.flame` diretamente (criados no C1). Se uma peça
  precisa de material de time, use `M.team` (nunca uma cor fixa).
  As 35 unidades de hoje **não são reassadas**, mas o `tests/art-units-review.test.ts` mede a passada e o topo de cada
  uma no rig de AGORA e compara com o índice: nenhuma mudança pode alterar a geometria de quem não usa as chaves novas.
  *Conferir:* antes de editar, gere `node scripts/bake/pose-preview.mjs art/manifest/villager.json --anims idle,attack --dirs 0,2,5 --scale 4 --out scratch/e8/u1-antes.png`;
  depois, o mesmo comando com `--out scratch/e8/u1-depois.png` sai igual (olhe as duas; o hoplita e o hipeu idem), e os
  testes de rig: `npx vitest run tests/art-units-review.test.ts tests/art-heroes.test.ts tests/art-cavalry.test.ts`.
- [ ] **U2. Poses.** Acrescente em `art/poses/human.json` as poses da seção 7 que o lote 1 usa: `idle_pike`,
  `walk_pike`, `attack_pike`, `aim_sling`, `attack_sling`, `ride_attack_lance`. Confira cada uma com
  `pose-preview.mjs … --anims <anim> --dirs 0,2,5 --scale 4` (olhe: mão na arma, pé no chão).
- [ ] **U3. Cerco do lote 1.** `siege.js`: `KIT.style` + `trebuchet`, `ram`, `siphon`; pivô `barrel` no `JOINTS` e
  escalar `recoil` no `SCALARS` exportados (para o teste de poses); poses `idle_/roll_/fire_/die_` de cada estilo em
  `art/poses/siege.json`. Os `roll_<estilo>` seguem a regra que o `tests/art-units-review.test.ts` cobra de todo rig
  `siege`: a roda (pivô `wheel`) gira **90° por ciclo, para a frente (negativo), no máximo 15° por quadro** (6 quadros,
  como o `roll_petrobolos`).
- [ ] **U4. Cavalo.** `horse.js`: `barding` (`scale`: manta de escamas de bronze até o joelho; `plate`: peitoral e
  testeira de aço), `pack: 'mule'` (orelhas 1,6×, crina curta, cangalha com 2 fardos `canvas` e 2 jarras), `tail: 'fish'`
  + `swim: true` + coat `sea` (hipocampo, Bloco J; só o kit agora), e o escalar `tailWave`. `KIT` ampliado no fim de
  cada lista. O "sem cavaleiro" já existe (`rider: null`, o do Pégaso): nada a fazer para a caravana.
- [ ] **U5. Rig `ship` (`rigs/ship.js`, novo).** Exporte `shipUnit`, `KIT = { style: [...os 11 estilos da seção 9], rig: ['oar', 'square', 'sail', 'steam'] }`
  (o `era` não entra no `KIT`: é parâmetro das cópias),
  `JOINTS = ['root', 'hull', 'oarsL', 'oarsR', 'sail', 'paddle', 'turret']`, `SCALARS = ['oarPhase', 'billow', 'list', 'sink', 'recoil', 'net']`.
  Casco por perfil (`THREE.Shape` do contorno visto de cima extrudado com `bevel`), convés, amurada, esporão de
  `M.bronze` nas galés, olhos pintados na proa (I–III), remos como caixas finas que giram em `oarPhase` (0→1 =
  remada), velas como `PlaneGeometry` curvada por `billow` (material `M.sail`, dupla face), flâmula de time no mastro e
  faixa de time na amurada (acima de 0,9 m), chaminé/rodas de pás no vapor, torres que giram em `turret` (navios
  VII–VIII). Linha d'água em y = 0 e nada abaixo dela; o recorte do `sink` em clones dos materiais (seção 9). Devolva
  `{ group, pose(fr, poses), feet: [], thin: [os mastros e a flâmula], glide(a, poses) { return <tiles por ciclo> } }`
  — `glide` é **função** (o `measure.mjs` só a usa se `typeof unit.glide === 'function'`; sem ela a passada sai 0 e o
  `art:check` acusa "walk sem passada"): uma remada/um ciclo de vela avança `0,6 × comprimento` tiles (valor inicial).
  Confira o formato no `siegeUnit` (`rigs/siege.js`) e no `serpentUnit` (`rigs/serpent.js`, o `glide` de hoje).
  Poses em `art/poses/ship.json`: `idle_ship` (balanço `list` ±2°), `row` (remos), `sail` (`billow`), `steam` (rodas),
  `fire_ship` (`recoil` nas baterias), `sink` (`list` 0→25°, `sink` 0→0,8 m); os quadros de cada animação são os da
  tabela 9. Registre em `units.js` (`UNIT_RIGS`, `DEFAULT_POSES.ship = 'art/poses/ship.json'`, `UNIT_KITS`,
  `UNIT_POSE_KEYS`, `RIG_FILES.ship = ['scripts/bake/page/rigs/ship.js']`).
- [ ] **U6. Manifestos do lote 1** (Eras 0–3): `prodromos`, `trapezites`, `phalangite`, `skoutatos`,
  `rhodian_slinger`, `byzantine_archer`, `thureophoros`, `akritas`, `cataphract`, `athanatos`, `trebuchet`,
  `covered_ram`, `greek_fire_siphon` (tabela 8); `merchant`, `caravan` (tabela 8, "Os 2 da E2/E5"); `fishing_boat`,
  `transport_ship`, `merchant_ship`, `penteconter`, `trireme`, `quinquereme`, `dromon` (tabela 9; nos 3 com `eras`, o
  U8 assa só o base — as cópias `_e4`/`_e6` estão nos grupos `units_e4`/`units_e6` e saem no H6); `villager` com os
  campos da seção 5. Cada manifesto novo: `stage: 8`, `era` (= `UNITS[id].age`; confira com `window.aoe.debugData()` ou
  `npx tsx -e`), `docs` de uma linha com "glb" (exigido pela validação).
  *Conferir:* `npx vitest run tests/art-manifest.test.ts` (validação + poses existem) e
  `node scripts/bake/pose-preview.mjs art/manifest/<id>.json --anims idle,attack --dirs 0,2,5 --scale 4 --out scratch/e8/<id>.png`
  para cada um, olhando.
- [ ] **U7. Nós da E2 (props).** `props.js`: `case` para `limestone` (afloramento claro com blocos cortados; 3
  estágios), `naphtha` (poça escura irisada com pedras; 1), `oil_field` (terra escura com mancha brilhante; 1),
  `olive_grove` (3 oliveiras baixas em fileira; 1 — não use o nome `olive`, que é espécie de árvore), `vineyard`
  (4 fileiras de videiras em estacas; 1), `paros_marble` (afloramento branco; 3), `salt` (salina branca com montes;
  3), `wild_horses` (3 cavalos selvagens parados, direções 0/2/4/6: `buildHorse` de `rigs/horse.js` com `rider: null` —
  o A4 pôs o `horse.js` no hash dos props), `copper` (rocha verde-azulada; 3), `incense` (arbusto de olíbano com resina;
  1). `art/manifest/props-nodes.json`: itens com essas variantes (`limestone`/`paros_marble`/`salt`/`copper` `[0, 1, 2]`,
  `wild_horses` `[0, 2, 4, 6]`, os outros `[0]`).
  `src/render/art/logic.ts`: em `nodeFrameName`, `case 'limestone': case 'paros_marble': case 'salt': case 'copper': return propFrameName(type, amountStage(amount, max));`,
  `case 'naphtha': case 'oil_field': case 'vineyard': case 'incense': return propFrameName(type, 0);`,
  `case 'olive': return propFrameName('olive_grove', 0);` (o nó de oliveiral da E2 se chama `olive`: `RARE_NODES` em
  `src/core/constants.ts`), `case 'wild_horses': return propFrameName('wild_horses', animalDir(id));`;
  `nodeStage` devolve `amountStage` para os 4 minerais. `fish` e `rare_fish` (água, E4) continuam procedurais (a
  animação da água fica para depois da E8).
- [ ] **U8. Bake e fusão do lote 1 de unidades.**
  ```bash
  node scripts/bake/bake.mjs --only units_e0,units_e1,units_e2,units_e3 --scale 1,2 --out scratch/e8/lote1-un --contact scratch/e8/lote1-un/contato > scratch/e8/lote1-un.log 2>&1
  node scripts/bake/bake.mjs --only props --scale 1,2 --out scratch/e8/lote1-props --contact scratch/e8/lote1-props/contato > scratch/e8/lote1-props.log 2>&1
  node scripts/bake/merge-group.mjs scratch/e8/lote1-un --groups units_e0,units_e1,units_e2,units_e3
  node scripts/bake/merge-group.mjs scratch/e8/lote1-props --groups props
  npm run art:hud
  npm run art:check
  ```
  O `--only units_e3` assa todos os assets do grupo (unidades com `era: 3` e as cópias `_e3`, como `villager_e3`). Se o
  `merge-group` reclamar de um asset faltando no rascunho, inclua o id no `--only`. As cópias de Era > 3 dos
  barcos/cidadão (grupos `units_e4`, `units_e6`, `units_e7`) entram no lote 2 (H6). O grupo `units` (as 35 de hoje)
  **não** entra em nenhuma fusão. Olhe as folhas `scratch/e8/lote1-un/contato/etapa8-<id>-contato.png` e a do cidadão
  (`etapa…-villager-e<n>-contato.png`, só as direções 1 e 2).
- [ ] **U9. Alias.** Antes de tirar entradas, congele o procedural: em `src/render/art/alias.ts`, crie
  `UNIT_PROCEDURAL_ALIAS` com o conteúdo inteiro do `UNIT_ART_ALIAS` de agora (o `scratch/e8/alias-antes.txt` do 0.1) e
  `unitProceduralType`, e troque o `unitArtType(type)` do `TextureCache.unit` em `src/render/textures.ts` (passo D2 da
  E3) por `unitProceduralType(type)` — o procedural continua sendo a reserva com a arte desligada (os edifícios: o
  procedural não usa alias, nada a fazer). Depois tire do `UNIT_ART_ALIAS` os 15 ids do U6 que estão lá (as 13 de linha,
  `merchant` e `caravan`; os navios e o cidadão nunca estiveram).
  *Conferir:* `npx vitest run tests/art-etapa6.test.ts tests/hud-icons.test.ts tests/art-library.test.ts tests/art-units-review.test.ts`
  (o "nenhum procedural" do `art-etapa6` passa a contar os novos: aqui atualize a contagem esperada para o que já está
  assado e tire o filtro `UNITS[t].naval` da E4 dos navios do lote; o L4 fecha as contagens).
- [ ] **U10. Capturas, testes e commit.** `tests/art-units-review.test.ts`: os filtros `a.group === 'units'` passam a
  aceitar os grupos por Era (`/^units(_e\d)?$/`), o teste de deslizamento do pé pula `ship` e `vehicle` (como o
  `siege`) e o das passadas plausíveis ganha os ramos `ship` (a do `glide`, > 0,3) e `vehicle` (como o `siege`, > 0,2).
  No `tests/art-eras.test.ts`, o teste (4). Crie `scripts/artlines.mjs` (passo M3) com as cenas `roda` e `combate` para
  `--eras 0,1,2,3`; rode, olhe, e commit com os PNG: "E8 U: unidades, navios, cidadão e nós das Eras I–IV".

### Bloco F — Lote 1, maravilhas das Eras I–IV (2 dias)

- [ ] **F1. `rigs/buildings-wonders.js` (novo)** com `export const WONDER_BUILDERS = { wonder_lion_gate: (k, p) => {…}, … }`
  e `export const WONDER_STYLES = Object.keys(WONDER_BUILDERS)` para as 11 do lote 1 (tabela 11), no padrão dos
  builders de `buildings-military.js` (as 3 maravilhas de hoje são o modelo: obra pelo `p.stage` 0–2 com andaime,
  `k.breakable` nas peças que caem, `k.onDamage` para o dano estrutural, estandarte de time). Registre em
  `buildings.js` com `Object.assign(BUILDERS, WONDER_BUILDERS)` ao lado dos outros `Object.assign`. Este arquivo só
  entra no hash dos estilos `wonder_*` (A4): não use nele nada que os outros builders importem, nem o contrário.
- [ ] **F2. Manifestos** das 11, com `"atlasGroup": "wonders"` (campo do A1), `footprint [4, 4]`, `icon`, sem `eras`
  (D9).
- [ ] **F3. Bake e fusão.** O rascunho precisa dos edifícios base (o atlas `icons` é refeito com eles; D26): eles vêm do
  cache do R4 (o hash deles não inclui o `buildings-wonders.js`).
  ```bash
  node scripts/bake/bake.mjs --only buildings,wonders --scale 1,2 --out scratch/e8/lote1-mar --contact scratch/e8/lote1-mar/contato > scratch/e8/lote1-mar.log 2>&1
  grep "sem cache válido" scratch/e8/lote1-mar.log      # nenhum edifício
  node scripts/bake/merge-group.mjs scratch/e8/lote1-mar --groups buildings,wonders,icons
  npm run art:hud
  npm run art:check
  ```
  Olhe as 11 folhas de contato (`etapa3-wonder_<id>-contato.png`: obra 0–2, pronta, dano 1–2).
- [ ] **F4. Alias, capturas e commit.** Tire as 11 de `BUILDING_ART_ALIAS`; `artages.mjs --only maravilhas` (M2)
  mostra as 20 numa praça; olhe; `npx vitest run tests/art-library.test.ts tests/art-manifest.test.ts tests/hud-icons.test.ts`;
  commit com os PNG: "E8 F: maravilhas das Eras I–IV".
  Anote em `docs/eras/PROGRESSO.md`: "lote 1 pronto; capturas `docs/art/e8-*` aguardando o dono".

### Bloco G — Lote 2, edifícios das Eras V–VIII (2 dias)

- [ ] **G1. Plantas próprias das Eras 4, 6 e 7** (tabela 4): baluarte, torre de canhão, casamata, muralha de
  concreto e o portão de cada uma; forte estrelado, forte de tijolo, forte de concreto; fazenda com moinho e com
  cata-vento; as particularidades da coluna "o que muda além do kit" (silos, castelete, guindaste, galeria de ferro e
  vidro, observatório, garagem, doca seca). Mesma regra do R2 (`if (p.era === n)` e retorno; Era 1 intocada).
- [ ] **G2. Bake, fusão e prova.** Mexer nos builders muda o hash de **todos** os edifícios (base e as 111 cópias): o
  bake refaz tudo (longo, segundo plano) e a prova é que a base e as cópias 0–3 saem iguais.
  ```bash
  node scripts/bake/bake.mjs --only buildings,buildings_e0,buildings_e2,buildings_e3,buildings_e4,buildings_e5,buildings_e6,buildings_e7 --scale 1,2 --out scratch/e8/lote2-ed --contact scratch/e8/lote2-ed/contato > scratch/e8/lote2-ed.log 2>&1
  node scripts/bake/merge-group.mjs scratch/e8/lote2-ed --groups buildings,buildings_e0,buildings_e2,buildings_e3,buildings_e4,buildings_e5,buildings_e6,buildings_e7,icons
  node scripts/bake/cache-diff.mjs scratch/e8/cache-antes art/cache --ids academy,barracks,cornucopia,farm,fortress,gate,granary,house,lumber_camp,market,mine,rubble,siege_workshop,stable,temple,titan_gate,tower,wall,wonder_artemis,wonder_colossus,wonder_zeus --alias town_center@a1=town_center,town_center@a0=town_center_e0,town_center@a2=town_center_e2
  npm run art:check
  ```
  Confira com `git diff --stat public/art` que só os PNG de `buildings_e4…e7` mudaram (e o `manifest.json`, onde o
  `sourceHash` de todos muda): os de `buildings`, `buildings_e0…e3` e `icons` saem iguais byte a byte (o bake é
  determinístico). Se algum deles mudou, uma planta da Era 4–7 vazou para outra Era.
- [ ] **G3. Capturas e commit.** `artages.mjs --eras 4,5,6,7`; olhe; commit com os PNG: "E8 G: edifícios por Era
  (lote 2, Eras V–VIII)".

### Bloco P — Efeitos de pólvora, motor, vapor, chaminés e poderes da E6 (2,5 dias)

- [ ] **P1. Atlas `fx`.** `scripts/bake/fx/catalog.mjs`: em `FX_PROJECTILES` acrescente `bullet`, `shell`, `grenade`
  (seção 12; o `bullet` aditivo como o `bolt`, `shell`/`grenade` com SDF como a `stone`) e a família `flash` (4
  quadros) em `fxItems`; em `src/render/fx/FxTextures.ts`, as mesmas famílias em `FX_FAMILIES`
  (`'proj/bullet': { n: 8, … }`, `'proj/shell'`, `'proj/grenade'`, `flash: { n: 4, w: 16, h: 16 }`) e o desenho de
  reserva delas (o atlas procedural de quando o `fx` não carregou). `npm run art:fx -- --contact docs/art` e olhe a folha.
  `tests/fx-atlas.test.ts` confere o atlas contra `fxNames()` do catálogo e `allFxNames()` do `FX_FAMILIES`: os dois
  têm de ter os mesmos nomes; o teste de "projéteis iluminados" (8 vistas diferentes) só vale para os de SDF — se o
  `shell` não passar nele, ilumine-o, não tire o teste.
- [ ] **P2. Escolha do projétil.** Em `src/render/fx/logic.ts`, `PROJECTILE_KINDS` ganha `'bullet', 'shell', 'grenade'`,
  `isEmissive` passa a incluir `'bullet'` e o `projectileKind(src, data)` chama, dentro do `if (u) {` e **antes** de
  todas as regras (inclusive a `fire` → `'fireball'` que a E3 pôs como primeira linha):
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
  (`UnitDef` tem `id`, `tags`, `attackType` e `splash` — `src/core/types.ts`). `arcHeight`: `bullet` 0, `shell` 0,16,
  `grenade` 0,45. Os navios de V–VIII têm a tag `gunpowder` e ataque `crush` na E4 (→ `shell`); o dromon, o sifão, a
  Lâmpade, o dragão e a Fênix têm a tag `fire` e continuam no `'fireball'` da E3 (o sopro da Quimera): não crie projétil
  de fogo novo. As torres continuam com `arrow` (o `projectileKind` não recebe o estado: a torre de canhão da Era V
  atira flecha); fica anotado no Apêndice J como pendência visual.
- [ ] **P3. Clarão, fumaça de pólvora e explosão** (seção 12) em `projectile.ts` e `recipes.ts`; o ponto de boca vem
  de `UnitArt.muzzles?.[dir]` (campo novo, lido do índice como `tops`; se ausente, 0,6 tile à frente na direção).
  A família `gunsmoke` entra no `GROUP_CAP` de `src/render/fx/logic.ts` (`gunsmoke: 0.18`, ao lado de `smoke`, `dust`,
  `fire`; o `particles.ts` já lê o `GROUP_CAP`) e as partículas usam a prioridade de combate (`PRIO.combat`).
- [ ] **P4. Motor, vapor, esteira e chaminés** (seção 12): em `unitFx.ts`, a fumaça de motor (tag `mechanical`), a
  tabela `STACKS` por estilo de navio (offset da chaminé em tiles na direção 0, girado pela direção da vista; o estilo e o
  `rig` saem do asset da vista: `v.unit.art.id` → manifesto/índice) e a esteira, com os contadores `counts.engine`,
  `counts.stack`, `counts.wake` (o `artfx.mjs` e o `artlines.mjs` leem `fx.unitFx.counts`). Em `rules.ts`, a tabela
  nova `CHIMNEY_SMOKE: Record<string, { dx: number; h: number }>` (os 8 tipos com `B.eraChimney`) e
  `chimneyOn(b, bv) = !!CHIMNEY_SMOKE[b.type] && b.complete && !!bv && !!ERA_KITS[bv.era]?.chimney` (copie a tabela de
  Eras com chaminé para o `rules.ts` — o renderizador não importa `scripts/bake`); em `ambient.ts`, no `building()`,
  depois do bloco da `WORK_SMOKE` (que fica como está), o fio de fumaça `stack` a cada 0,7 s com um acumulador novo
  `stack` no `FxAcc` (`src/render/fx/FxSystem.ts`).
- [ ] **P5. Poeira da troca de Era**: preencha o `FxSystem.eraChange(view: BuildingView)` que o B5 criou vazio (seção 12).
- [ ] **P6. "+N ouro" da caravana** (D31, seção 12): observador no `unitFx.ts`, com a perna anterior (`routeLeg`)
  guardada no `UnitAcc` da vista. Só para o time do jogador local.
- [ ] **P7. Áudio e passos (D30).** `src/audio/events.ts`, `deathRecipe`: `if (def.tags.includes('mechanical')) return 'treeFall';`
  antes da linha do cavalo (o `cls === 'ship'` a E4 já pôs; confira). `src/render/fx/logic.ts`, `gaitOf`:
  `if (u.tags.includes('mechanical')) return 'wheel';` antes da linha dos cascos. `src/ui/input.ts`, `dominantClass`:
  uma unidade com a tag `mechanical` conta como `'siege'` (resposta `ackCreak`, sem relincho). `npx vitest run tests/audio.test.ts tests/fx-logic.test.ts`.
- [ ] **P8. Registro e testes.** `tests/fx-registry.test.ts` varre o núcleo atrás de tipos de efeito sem handler: os
  efeitos novos são do renderizador (nenhum tipo novo no núcleo), então só confira que o teste continua verde;
  acrescente em `tests/fx-logic.test.ts` (existe) os casos de `gunpowderProjectile` da seção "Testes".
- [ ] **P9. Poderes da E6 com arte própria** (D31). Em `src/render/fx/handlers/divine.ts` (da E6), troque o anel
  genérico por um ramo por `e.src`, com os emissores que o arquivo já importa (`flame`, `glow`, `haze`, `motes`, `ring`)
  e a prioridade de poderes; nada sob a névoa nem fora da tela, como hoje. Valores iniciais:
  | `src` | arte |
  |---|---|
  | `panic` (Pã) | anel verde-escuro rasteiro + 14 `motes` escuros fugindo do centro, 1,2 s |
  | `crossroads` (Hécate) | 6 tochas (`flame` pequeno) em círculo na origem e no destino do grupo + `haze` roxa, 1 s |
  | `spring` (Perséfone; também o `TimedHandler` `spring`) | flores (`motes` rosa e brancas) brotando no disco durante a duração; almas (`motes` brancos subindo) onde as Sombras voltam |
  | `gale` (Éolo; `TimedHandler` `gale`) | riscos de vento (`dust` esticado) cruzando o disco na direção do empurrão, folhas |
  | `tidal_wave` (Tritão) | anel azul que cresce + respingo `water` (o do `splash`) na borda |
  | `divine_harvest` (Deméter) | espigas douradas (`motes` dourados) subindo das fazendas no raio, `glow` âmbar |
  | `sun_chariot` (Hélio; `TimedHandler` `sun_chariot`) | faixa de fogo (`flame` + decalque `decal/burn`) ao longo de `dx`/`dy`, `glow` branco-dourado na frente |
  | `winged_victory` (Nice) | penas douradas caindo (`motes`) + brilho nas unidades do dono no raio |
  | `retribution` (Nêmesis) | anel vermelho-escuro pulsante, 3 batidas |
  | `phoenix` (renascimento) | explosão de fogo (`flame` em coroa) + cinzas (`motes` cinza) no ponto |
  O `POWER_ART` da E6 continua apontando para `'effect:divine…'` (o teste do registro não muda). Estenda a cena
  `poderes` do `scripts/artfx.mjs` com os 9 (uma partida própria por poder, como os de hoje) e a falha "poder sem a sua
  arte" para eles.
- [ ] **P10. Capturas e commit.** Cena nova `tiro` no `artfx.mjs` (mosqueteiros × hoplitas, canhões × muralha,
  metralhadora, tanque andando, couraçado a vapor — `debugSpawn`, e o couraçado num mapa `islands`), com
  `--only tiro` gerando `docs/art/e8-tiro-z10.png` e `e8-tiro-z22.png`; falha se não houver projéteis
  `bullet`/`shell` em voo, clarão ou fumaça de pólvora (os projéteis por tipo já se leem em `fx.live`, como a cena dos
  espinhos faz com `inst.s.kind`; clarão e fumaça pelos contadores novos). As unidades do lote 2 ainda saem com o alias
  (o H as assa): aqui o que se confere são os efeitos; a cena roda de novo no M. Rode também `--only poderes`; olhe
  tudo. Commit: "E8 P: efeitos de pólvora, motor, vapor, chaminés e poderes da E6".

### Bloco H — Lote 2, unidades das Eras V–VIII (4 dias)

- [ ] **H1. Poses de arma de fogo** (seção 7): `idle_gun`, `walk_gun`, `aim_gun`, `attack_gun`, `idle_mg`, `walk_mg`,
  `aim_mg`, `attack_mg`, `attack_grenade`, `attack_saber`, `ride_aim_carbine`, `ride_attack_carbine`, `ride_moto`,
  `ride_moto_attack`. Olhe cada uma no `pose-preview.mjs`.
- [ ] **H2. Cerco de pólvora**: estilos `bombard`, `field_gun`, `howitzer` no `KIT.style` do `siege.js` (poses da seção
  7; os `roll_*` com a regra da roda do U3).
- [ ] **H3. Rig `vehicle` (`rigs/vehicle.js`, novo).** `KIT = { style: ['tank', 'spg', 'motorcycle'] }`,
  `JOINTS = ['root', 'hull', 'turret', 'barrel', 'wheel']`, `SCALARS = ['recoil', 'track']` — o pivô se chama
  `wheel` porque o `measure.mjs` lê o giro da pose por esse nome (`poseAt(def, i, n, ['wheel'], [])`) para a passada
  das rodas; o rig devolve `wheels` (os grupos que giram: rodas da moto, rodas de apoio do tanque) e `wheelRadius`, como
  o `siegeUnit`. Tanque estilo 1916–1918 (losango baixo de 2,4 × 1,1 m em escala de jogo 1,6 × 0,8 tiles, esteiras
  envolvendo, torre pequena com canhão curto; `paintGreen` com faixa de time), autopropulsada (chassi de tanque com
  canhão longo em casamata aberta), motocicleta com sidecar (o cavaleiro humano aninhado `rider`,
  `NESTED_HUMAN.vehicle = 'rider'`; as poses dele pelo `posesOf` do A1). Esteiras: textura de elos que corre por `track`
  (0→1 = um passo, sincronizado com o giro das rodas). Poses em `art/poses/vehicle.json`: `idle_tank`, `roll_tank`,
  `aim_tank`, `fire_tank` (8 quadros, `recoil`), `die_tank` (6: fumaça é efeito; aqui só afunda 0,1 e inclina 8°),
  idem `spg`, `idle_moto`, `roll_moto`, `die_moto`. Registro em `units.js` como no U5 (`RIG_FILES.vehicle` com o
  `human.js`, por causa do motociclista).
- [ ] **H4. Manifestos do lote 2** (Eras 4–7): os 28 restantes da tabela 8 (`stradiot`, `hussar`, `mounted_scout`,
  `motorcyclist`, `pikeman`, `grenadier`, `fusilier`, `modern_infantry`, `arquebusier`, `musketeer`, `sharpshooter`,
  `machine_gunner`, `rodelero`, `chasseur`, `light_infantry`, `commando`, `cuirassier`, `dragoon`, `lancer`, `tank`,
  `knight_of_rhodes`, `guard_grenadier`, `evzone`, `sacred_band`, `bombard`, `field_gun`, `howitzer`,
  `self_propelled_gun`) e os navios `galleon`, `ship_of_the_line`, `ironclad`, `battleship` (tabela 9).
- [ ] **H5. Muzzles no índice.** `scripts/bake/measure.mjs` mede `tops`; acrescente `muzzles` (posição de tela do
  `items.muzzle` no quadro 2 de `attack`, por direção, em px a 1× relativos à âncora) quando o rig tiver o item;
  `bake.mjs` grava no índice (A4); `ArtLibrary.unit()` lê para `UnitArt.muzzles` (como `tops`).
- [ ] **H6. Bake e fusão do lote 2.**
  ```bash
  node scripts/bake/bake.mjs --only units_e4,units_e5,units_e6,units_e7 --scale 1,2 --out scratch/e8/lote2-un --contact scratch/e8/lote2-un/contato > scratch/e8/lote2-un.log 2>&1
  node scripts/bake/merge-group.mjs scratch/e8/lote2-un --groups units_e4,units_e5,units_e6,units_e7
  npm run art:hud
  npm run art:check
  ```
  Este é o bake mais longo das unidades (dezenas de assets, os navios grandes): deixe em segundo plano e confira o log.
  Entram aqui também as cópias `_e4`/`_e6`/`_e7` do cidadão e dos barcos.
- [ ] **H7. Alias, capturas e commit.** Tire os 28 ids de linha de `UNIT_ART_ALIAS` (os navios nunca estiveram);
  `artlines.mjs --eras 4,5,6,7` com as cenas `roda`, `combate`, `naval` e `desfile`; olhe;
  `npx vitest run tests/art-etapa6.test.ts tests/art-library.test.ts tests/art-units-review.test.ts tests/hud-icons.test.ts`;
  commit com os PNG: "E8 H: unidades e navios das Eras V–VIII".

### Bloco J — Criaturas da E6 e Talos (2 dias)

- [ ] **J1. Rig `bird` (`rigs/bird.js`, novo)**: corpo de ave (tronco ovoide, pescoço em 3 segmentos, cabeça com
  bico curvo), asas de `rigs/wings.js` (`buildWings`, reuso), cauda de 5 penas longas; `KIT = { finish: ['phoenix'] }`;
  poses em `art/poses/bird.json`: `idle_bird` (voo parado, 4), `fly_bird` (8), `aim_bird` (2), `attack_bird` (6,
  bico aberto lançando o fogo), `die_bird` (6: cai e vira cinza — a cinza é o quadro final escurecido). Sem
  `ability_bird`: o renascer da Fênix é o efeito `divine` com `src: 'phoenix'` (P9). Registro em `units.js` como no U5.
- [ ] **J2. Kits**: `biped.js` acabamentos `satyr`, `empusa`, `lampad`, `harpy` (com asas), `erinys`, `talos`;
  `beast.js` `face: 'eagle'` e `'dragon'` + carro de trigo; `serpent.js` `form: 'scylla'` e `'ceto'` (tabela 10);
  poses de voo do grifo e do dragão em `scripts/bake/gait.mjs` (`node scripts/bake/gait.mjs` regera
  `art/poses/beast.json`; `node scripts/bake/gait.mjs --check` tem de passar). Nada nos kits de hoje muda de valor
  padrão (o `tests/art-units-review.test.ts` mede as criaturas de hoje no rig de agora).
- [ ] **J3. Manifestos** das 12 (tabela 10; `page: 'own'`, `flying` só nas voadoras dos dados, `era`): `satyr`,
  `empusa`, `lampad`, `harpy`, `hippocampus`, `triptolemus_dragon`, `phoenix`, `griffin`, `erinys`, `scylla`, `ceto`,
  `talos`.
- [ ] **J4. Bake e fusão.** As criaturas estão nos grupos `units_e2` (Escila), `units_e4`, `units_e5` e `units_e6`: o
  `merge-group` pede todos os assets do grupo no rascunho, então asse os grupos inteiros de novo (as unidades do U e do
  H vêm do cache se os rigs delas não mudaram; se o J mexeu no `horse.js`, os montados desses grupos são reassados):
  ```bash
  node scripts/bake/bake.mjs --only units_e2,units_e4,units_e5,units_e6 --scale 1,2 --out scratch/e8/criaturas --contact scratch/e8/criaturas/contato > scratch/e8/criaturas.log 2>&1
  node scripts/bake/merge-group.mjs scratch/e8/criaturas --groups units_e2,units_e4,units_e5,units_e6
  npm run art:hud
  npm run art:check
  ```
- [ ] **J5. Alias, capturas e commit.** Tire as 12 entradas da E6 de `UNIT_ART_ALIAS`.
  `node scripts/artmyth.mjs http://localhost:4173/ --only roda,voo,bestiario --prefix e8` (estenda a lista de
  criaturas do script para ler os tipos com a tag `myth` de `debugData()` em vez da lista fixa; o bestiário passa de
  16 a 28 — as 13 míticas e os 3 titãs de hoje + as 12 da E6); olhe;
  `npx vitest run tests/art-etapa6.test.ts tests/art-myth.test.ts tests/art-units-review.test.ts`; commit:
  "E8 J: criaturas das Eras III–VII (Escila, Ceto, as 9 dos deuses menores) e Talos".

### Bloco K — Lote 2, maravilhas das Eras V–VIII (1 dia)

- [ ] **K1.** As 6 do lote 2 em `buildings-wonders.js` (tabela 11) e os manifestos.
- [ ] **K2.** Bake e fusão: mexer no `buildings-wonders.js` muda o hash das 17 maravilhas novas (todas reassadas); os
  edifícios base vêm do cache (o hash deles não inclui esse arquivo, A4) e refazem o `icons` (D26):
  ```bash
  node scripts/bake/bake.mjs --only buildings,wonders --scale 1,2 --out scratch/e8/lote2-mar --contact scratch/e8/lote2-mar/contato > scratch/e8/lote2-mar.log 2>&1
  node scripts/bake/merge-group.mjs scratch/e8/lote2-mar --groups buildings,wonders,icons
  npm run art:hud
  npm run art:check
  ```
- [ ] **K3.** Tire as 6 do alias; `artages.mjs --only maravilhas`; olhe; commit: "E8 K: maravilhas das Eras V–VIII".

### Bloco L — Ícones, alias e contagens finais (2 dias)

- [ ] **L1. Ícones do HUD** (seção 13). Os `unit/<id>` e `bld/<id>` dos tipos novos já saíram dos manifestos (o
  `npm run art:hud` do fim de cada bloco); aqui:
  1. Tire de `scripts/bake/hud/catalog.mjs` o `SHIP_ICONS` (E4; com a entrada do `merchant_ship` da E5) e o uso dele
     no `hudItems`/`hudNames`.
  2. `age/4`, `age/5`, `age/6` com os objetos novos em `hud-objects.js` (`cannon`, `tricorne`, `gear`).
  3. Estudos por degrau: o catálogo não importa TypeScript; gere a lista e cole as entradas em `TECH_ICONS`
     (`evo_<linha>_<n>: { kind: 'unit', unit: '<degrau>' }`, o mesmo formato do `automatons` de hoje):
     ```bash
     npx tsx -e "import {LINES,TECHS,evoTechId} from './src/core/data'; for (const [id,l] of Object.entries(LINES)) l.steps.forEach((s,k)=>{ const t=evoTechId(id,k); if (s && TECHS[t] && !l.steps.every((x)=>x===null||x===s)) console.log(t, s); })"
     ```
     Esperado: 50 linhas (43 das linhas de terra da E3 + 7 de `warship` da E4); cidadão, pesca e transporte não
     aparecem (continuam com o ícone da linha). Tire do `TECH_ICONS` os `evo_<linha>` das linhas que trocam de tipo (a
     E3 e a E4 puseram um por linha): o teste "o catálogo não tem ícone órfão" derruba quem sobrar. Fica `evo_citizen`,
     `evo_fishing` e `evo_transport`.
  4. `techIconKey(id)` (catálogo) passa a devolver o próprio `id` para `evo_<linha>_<n>` das linhas que trocam de
     tipo e `evo_<linha>` para `citizen`, `fishing` e `transport` (a regra `evo_` que a E3 pôs vira
     `/^evo_(citizen|fishing|transport)_\d$/`).
  5. `POWER_ICONS` próprios dos 9 poderes da E6 (objetos novos em `hud-objects.js`); os 9 bustos da E6 em
     `scripts/bake/page/hud-gods.js` revistos ao lado dos 12 de hoje (`npm run art:hud -- --only god/pan,god/hecate,… --scale 2 --contact scratch/e8/retratos`
     para iterar sem mexer no índice).
  `npm run art:hud -- --contact docs/art` e olhe.
- [ ] **L2. `src/ui/icons.ts`**: `techIconName(id)` com a mesma regra do `techIconKey` (o `tests/hud-icons.test.ts`
  exige `techIconName(id) === tech/${techIconKey(id)}` para todo estudo); `ic.age` até 7 (se a E1 ainda deixou o
  `Math.min(4, n)`). Confira `tests/hud-icons.test.ts` (ícone para todo conteúdo, nenhum órfão) e `tests/hud-text.test.ts`.
- [ ] **L3. Alias vazio.** `UNIT_ART_ALIAS` e `BUILDING_ART_ALIAS` em `src/render/art/alias.ts` ficam `{}` (deixe as
  funções `unitArtType`/`buildingArtType` devolvendo o próprio tipo e um comentário "E8: toda arte é própria; o
  procedural das unidades segue o UNIT_PROCEDURAL_ALIAS"). Compare com `scratch/e8/alias-antes.txt`: nenhum tipo ficou
  para trás.
- [ ] **L4. Testes de contagem** (seção "Testes"): `tests/art-etapa6.test.ts` passa a exigir arte assada para **todo**
  tipo de `UNITS` (35 + os novos; sai o filtro `UNITS[t].naval` da E4 nos dois laços e o do alias da E2) e
  `tests/art-library.test.ts` para todo tipo de `BUILDINGS` (os 21 → todos); commit: "E8 L: ícones por degrau e Era,
  alias de arte vazio".

### Bloco M — VRAM, desempenho, capturas finais e documentos (2 dias)

- [ ] **M1. Orçamento.** `npm run art:check` e preencha a tabela 14 em `docs/ART.md` §6 e no Apêndice J. Se algo
  passar do teto, aplique a regra da tabela 14 e reasse só o grupo afetado (rascunho + `merge-group`).
- [ ] **M2. `scripts/artages.mjs` completo** (D27): opções `--eras 0,…,7` (padrão: todas), `--campaign` (cidade com
  `config.visualEraMax = 2` e o jogador na Era 3: tem de sair igual à Era 2 — a captura compara os PNG das duas e
  falha se diferirem mais de 1 %), `--only maravilhas` (as 20 numa praça, prontas, + 3 em obra e 2 danificadas).
  As Eras dos edifícios saem de `debugData()` (a tabela fixa `AGE_OF` e o `TC_TIER` saem; o `expect` deixa de pedir
  `town_center:<a0|a1|a2>`, que não existe mais); os nomes das saídas: `docs/art/e8-cidade-e<n>.png`,
  `e8-cidade-campanha.png`, `e8-maravilhas.png`. Falha se algum edifício sair procedural (o script de hoje já confere;
  mantenha), se uma cópia de Era existir no índice e não for a usada (compare `view.bld.artId` com o esperado por
  `buildingEraId`), ou se faltar a poeira ao trocar a Era (cena extra `troca`: a Era do jogador local sobe uma, com a
  cidade à vista, e conta partículas de poeira).
- [ ] **M3. `scripts/artlines.mjs` (novo)**, no modelo de `scripts/artlote-distancia.mjs` (mesma abertura do
  Chromium, mesmas esperas por tick): opções `[url] [--out docs/art] [--prefix e8-linhas] [--eras 0,…,7] [--only roda,combate,naval,desfile]`.
  Para cada Era: `roda` (cada unidade da Era nas 8 direções, andando), `combate` (as unidades da Era em duas filas
  contra hoplitas de outro time, 20 s de jogo), `naval` (os navios da Era na água, andando e atacando, numa partida
  com o tipo de mapa `islands` da E4), `desfile` (fila a zoom 1 e 2,2). Lista de tipos de `debugData()` (`age === era`,
  sem as tags `myth`/`hero`; o cidadão e os barcos civis entram pelas cópias da Era). Saídas
  `docs/art/e8-linhas-e<n>-{roda,combate,naval,desfile}-z{10,22}.png`. Falha se: algum tipo sair procedural; quem
  anda não andar nas 8 direções; quem atira não tocar `aim` e `attack`; o projétil de uma unidade de pólvora não for
  `bullet`/`shell`/`grenade` (`fx.live`, `inst.s.kind`); um navio andando não soltar esteira; um navio a vapor não
  soltar fumaça; um tanque andando não soltar fumaça de motor (os contadores de `fx.unitFx.counts` do P4).
- [ ] **M4. `scripts/artparade.mjs`**: a lista dos 19 tipos da Etapa 4 vira "todos os tipos não míticos de
  `debugData()`" na cena `roda` e `desfile`; o resto igual. Rode e olhe.
- [ ] **M5. Desempenho.** `node scripts/renderperf.mjs http://localhost:4173/ 20 --quality medium` e o mesmo com 40;
  critério inicial: VRAM residente ≤ 120 MB (20 min) e ≤ 160 MB (40 min) no Médio; ms/quadro no máximo 10 % acima do
  `scratch/e8/antes/perf20.txt`. Conta de cabeça antes de rodar: hoje são 97,7 MB residentes; cada grupo
  `buildings_e<n>` em jogo soma ~20 MB e a pré-carga mantém as Eras de todos os jogadores + a próxima do local — com 4
  IAs espalhadas em 3 Eras, o teto de 120 MB fica justo. Se passar, anote o número no Apêndice J e leve ao dono
  (opções: não manter o grupo da próxima Era; liberar o `buildings` base quando ninguém está na Era II) em vez de
  afrouxar o critério sozinho. `node scripts/rendercpu.mjs http://localhost:4173/ --battle 100 --label e8` com
  linhas de pólvora: partículas abaixo do orçamento. Grave os JSON em `docs/perf/`.
- [ ] **M6. Regressões visuais.** `npm run art:shot` e `npm run art:diff`. As referências (`docs/art/ref/`, preset
  Baixo) são de uma partida que começa na **Era I**: depois da E8 a cidade da Era I é de adobe e sapé, então o diff das
  capturas da Era I **vai** passar de 2 % — é esperado. Olhe cada captura nova: o que estiver na Era II tem de bater com
  a de antes; a Era I tem de mostrar as cópias e0. Atualize as referências (`node scripts/artdiff.mjs --update`) com
  nota no commit. A prova de que a arte de hoje não mudou é o `cache-diff` (R6, G2) e a `artages --eras 1`.
- [ ] **M7. Documentos** (seção "Ao terminar").

## Testes a escrever ou atualizar

| Arquivo | O que testar |
|---|---|
| `tests/art-eras.test.ts` (novo) — manifesto | (1) `expandEraVariants` num edifício falso `{ id: 'x', kind: 'building', source: { type: 'param', rig: 'building', params: { style: 'barracks' } }, eras: [0, 3], eraParams: { '*': { a: 1 }, '3': { a: 2, glb: null } }, icon: {…} }` → ids `['x', 'x_e0', 'x_e3']`; `params.era` 1/0/3; `eraBase` 1 no base; `atlasGroup` `undefined`/`buildings_e0`/`buildings_e3`; `eraOf === 'x'` nas cópias; cópias sem `icon`; `params.a` 1 na e0 e 2 na e3; `glb` ausente na e3 (o `null` do `eraParams` apaga); com `eraNoVariants` as cópias não têm `variants`/`variantBy` e o base tem. Numa unidade falsa `{ id: 'u', kind: 'unit', source: { type: 'param', rig: 'horse', params: { rider: null } }, eras: [1, 3], eraParams: { '*': { k: 1 } }, … }` → ids `['u', 'u_e1', 'u_e3']`; o base é o manifesto sem `eras`/`eraParams` (sem `era` e sem `eraBase`: `atlasGroupOf` = `units`); as cópias com `era` 1/3 (`units_e1`/`units_e3`), `params.k === 1` e `params.rider === null` (o `null` do manifesto fica). (2) `validateManifest` recusa: `eras` com a Era base, repetida, fora de 0–7; `eras` em `wonder_parthenon`, `titan_gate`, `cornucopia`; chave de `eraParams` fora de `eras`; unidade com `era: 2` e `eras: [1]` (cópia abaixo da base). (3) Manifestos reais (`loadManifests`; entra no R6): para cada edifício de `BUILDINGS` sem `wonder`/`titan_gate`/`cornucopia`, `eras` é exatamente `[0..7]` sem a base e sem as menores que `age` (D10) — menos `wall`/`gate`/`tower` = `[0, 3, 4, 7]`, `fortress` = `[3, 4, 6, 7]`, `farm` = `[0, 4, 6]` e `naphtha_well` = `[4, 6]`; `town_center` sem `variants` e com o `eraParams` da D7. (4) (entra no U10) Toda unidade de manifesto com `era` tem `era === UNITS[id].age`; `villager` com `eras: [1, 3, 4, 6, 7]` e sem `era`; `fishing_boat`/`transport_ship` (`era: 0`) e `merchant_ship` (`era: 2`) com `eras: [4, 6]`. (5) `atlasGroupOf` e `matchesOnly` (`--only buildings` não pega cópia nem maravilha nova; `--only town_center` pega o base e as 7 cópias; `--only units_e3` pega `villager_e3` e não o `villager`). |
| `tests/art-eras.test.ts` — lógica | (6) `buildingEraId` com `{1:'x', 0:'x_e0', 3:'x_e3', 6:'x_e6'}` e tudo pronto: Era 0 → `x_e0`, 1 → `x`, 2 → `x`, 3 → `x_e3`, 5 → `x_e3`, 7 → `x_e6`; com `x_e3` não pronto, Era 5 → `x`; `eras = null` → o tipo; base 3 (`{3:'n', 4:'n_e4', 6:'n_e6'}`) com Era 2 → `n`. (7) O mesmo `buildingEraId` com o mapa do cidadão `{0:'villager', 1:'villager_e1', 3:'villager_e3', 4:'villager_e4', 6:'villager_e6', 7:'villager_e7'}` → Era 2 → `villager_e1`, 5 → `villager_e4`, 0 → `villager`; o `unitArtId` da hidra continua igual (`heads`). (8) `unitArtEra` num estado de verdade (o `quickGame()` de `tests/helpers.ts`, com as linhas ligadas): cidadão com Era 5 e só `evo_citizen_2…4` estudados → 3 (falta o `evo_citizen_5`, k = 4); `fishing_boat` na Era 6 sem `evo_fishing_7` → 5, com → 6; `config.visualEraMax = 2` e Era 3 → 2; `hoplite` (linha que troca de tipo) na Era 7 → 7. (9) `erasInPlay`: dois jogadores nas Eras 2 e 4, local = o da Era 2 → `[2, 3, 4]`; com `visualEraMax: 2` → `[2]` (o jogador 0 conta: não há Gaia). |
| `tests/art-eras.test.ts` — biblioteca | (10) Com o `FakeAtlas` de `tests/art-collect.test.ts` (copie o `vi.mock`): `ensureEras([3])` pede `buildings_e3` na escala do preset e ignora a Era 1; a chegada (`onChange('era')`) sobe `eraGen` e **não** `generation`; `buildingReady('x_e3')` é false enquanto carrega e **não** pede o carregamento; `releaseEras([], t)` só libera depois de 20 s de jogo sem uso e não libera um grupo que está no conjunto em uso; `erasOf('villager')` com a entrada base sem `eraBase` → base 0. (11) `BuildingView.setArt`: mesmo id → false; id novo → true, `state === ''`, e o `show` seguinte pede o quadro do id novo (lib falsa que registra as chamadas). |
| `tests/fx-logic.test.ts` (existe) | `gunpowderProjectile`: `musketeer` → `bullet`; `grenadier` → `grenade`; `field_gun` → `shell`; `tank` → `shell`; `galleon` → `shell`; `rhodian_slinger` → `stone`; `toxotes` → `null`. `projectileKind('dromon', 'arrow') === 'fireball'` (a regra da E3 continua); `arcHeight('bullet', 5) === 0`; `isEmissive('bullet')`; `gaitOf('tank') === 'wheel'`. |
| `tests/audio.test.ts` (existe) | `deathRecipe('tank') === 'treeFall'` e `deathRecipe('motorcyclist') === 'treeFall'`. |
| `tests/art-manifest.test.ts` | linha do CC (R6); orçamento: `r.stats.vramWorstMatch[s] ≤ BUDGET.maxVramMB × s²` e cada `vramByEra[s][n] ≤ BUDGET.maxEraVramMB × s²` no lugar do `vramByScale`; o teste do índice passa a usar `loadAssets(MANIFEST_DIR)` (com as cópias) para conferir que **toda** cópia está no índice com as animações. |
| `tests/art-library.test.ts` | o teste dos 21 edifícios vira "todo tipo de `BUILDINGS` tem arte assada no seu grupo" (`passOf(asset.group, …)`), mais "toda cópia `_e<n>` está no grupo `buildings_e<n>`" e o CC por `eraOf`; "toda unidade com arte… o tipo inteiro numa página por passe" vale para os novos (navios `titan` só a 1×); o teste de `warmUnitTypes` continua; acrescente que, com linhas, a pré-carga da Era 5 inclui `lineUnitOf` de cada linha. |
| `tests/art-etapa6.test.ts` | "nenhum procedural": **todo** tipo de `UNITS` sai assado a 1× (e a 2× se o manifesto tiver) com a ArtLibrary de verdade sobre os atlas (sem o filtro de navios da E4 nem o do alias da E2); as cópias por Era do cidadão e dos barcos também; o `toHaveLength(35 + 4)` dos servidos vira a contagem nova; silhuetas: as 16 de hoje mais as 12 da E6 ≥ 36 % entre si, menos o par Talos × Colosso (o mesmo esqueleto, de propósito); se outro par falhar (Escila × hidra é o candidato), mude o modelo, não o limite. |
| `tests/art-units-review.test.ts` | os filtros `a.group === 'units'` aceitam `units_e<n>`; o teste do pé de apoio pula `ship` e `vehicle` (como o `siege`); o das passadas plausíveis ganha os ramos `ship` e `vehicle`; a regra da roda (90° por ciclo, ≤ 15°/quadro) cobre os estilos novos do `siege`. A conferência "passada e topo no índice = medidos no rig" das 35 de hoje tem de continuar verde **sem reassá-las** (prova de que os kits novos não mexeram nelas). |
| `tests/art-military.test.ts` | `LOT` com o `shipyard` (o `MILITARY_STYLES` ganha o Estaleiro no R3). |
| `tests/fx-atlas.test.ts` | os nomes vêm de `fxNames()` e `allFxNames()`: confira que `proj/bullet/*`, `proj/shell/*`, `proj/grenade/*` e `flash/*` estão nos dois. |
| `tests/hud-icons.test.ts` | ícone para todo conteúdo (os novos), `tech/evo_<linha>_<n>` para todo estudo de evolução de linha que troca de tipo, nenhum `TECH_ICONS` órfão, `age/0…7`, `power/` dos 9 poderes da E6; `SHIP_ICONS` não existe mais. |
| `tests/fx-registry.test.ts`, `tests/render-pick.test.ts`, `tests/art-release.test.ts`, `tests/art-collect.test.ts` | sem mudança; têm de continuar verdes (o pick pelo alfa funciona com as cópias; a liberação das páginas próprias vale para os navios e criaturas novos; nenhum tipo de efeito novo no núcleo). |

## Verificação

Na ordem, depois do último bloco (e as partes que couberem no fim de cada bloco):

1. `npm run -s typecheck` — sem erros.
2. `npx vitest run tests/art-eras.test.ts tests/art-manifest.test.ts tests/art-library.test.ts tests/art-etapa6.test.ts tests/art-units-review.test.ts tests/art-military.test.ts tests/art-myth.test.ts tests/art-collect.test.ts tests/art-release.test.ts tests/fx-logic.test.ts tests/fx-atlas.test.ts tests/fx-registry.test.ts tests/audio.test.ts tests/hud-icons.test.ts tests/hud-text.test.ts tests/render-pick.test.ts`
   — tudo verde.
3. `npm test` — verde. Se sair com código 1 por "RPC timeout"/"onTaskUpdate" sem teste falhando, rode o arquivo
   citado sozinho (`npx vitest run <arquivo>`); se passar sozinho, é o tropeço conhecido do vitest, anote no commit.
4. `npm run art:check` — sem erros; anote PNG total (≤ 500 MB), MB por Era (≤ 40 a 1×, sem páginas próprias), pior
   caso (≤ 260 a 1×) e o PNG do `hud` (≤ 8 MB).
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
   - `node scripts/artfx.mjs http://localhost:4173/ --only tiro,combate,queda,desabamento,poderes`;
   - `node scripts/artcity.mjs http://localhost:4173/`, `node scripts/artcity-economia.mjs http://localhost:4173/` e
     `node scripts/artmilitary.mjs http://localhost:4173/` — continuam passando (as conferências não dependem da Era).
     Só o `artcity` (jogador na Era II, `age = 1`) sai com a mesma cara de antes; o `artcity-economia` (`age = 2`) e o
     `artmilitary` (`age = 4`) passam a mostrar as cópias daquelas Eras — olhe e confira que são as esperadas.
   Todos terminam sem "procedural", sem direção faltando e sem efeito faltando.
10. `npm run art:shot && npm run art:diff` — as capturas da Era II dentro dos 2 %; as da Era I mudam de propósito (M6):
    olhe e atualize as referências com `--update`, com nota no commit.
11. `node scripts/renderperf.mjs http://localhost:4173/ 20 --quality medium` e `… 40 --quality medium` — VRAM residente
    ≤ 120 MB e ≤ 160 MB; ms/quadro até 10 % acima do "antes". `node scripts/rendercpu.mjs http://localhost:4173/ --battle 100 --label e8`
    — partículas dentro do orçamento (200/800/2 000). JSON em `docs/perf/`.

## Critérios de pronto

- [ ] `UNIT_ART_ALIAS` e `BUILDING_ART_ALIAS` vazios; todo tipo de `UNITS` e `BUILDINGS` sai assado (teste de
  `art-etapa6` e de `art-library`).
- [ ] Os 21 edifícios de hoje saem **byte a byte** iguais na Era II (`cache-diff` com `igual`), o CC nas Eras I/II/III
  igual ao `a0/a1/a2` de antes, e o `art:diff` dentro de 2 % nas capturas da Era II (as da Era I com referência nova).
- [ ] As 8 Eras reconhecíveis nas capturas `docs/art/e8-cidade-e<n>.png` (a tabela 1 descreve o que ver); muralha,
  torre, fortaleza e fazenda com a evolução de função; a campanha (`e8-cidade-campanha.png`) igual à Era III.
- [ ] Ao avançar de Era, os edifícios do jogador trocam com poeira; os do inimigo sob a névoa não trocam.
- [ ] Cidadão em 6 aparências, barcos em 3, navios de guerra com remos/velas/vapor e esteira, tanque com fumaça de
  motor, armas de fogo com mira, clarão, fumaça e bala/obus/granada.
- [ ] As 12 criaturas da E6 assadas (as 9 dos deuses menores, Escila, Ceto e o Talos); 17 maravilhas novas assadas
  (20 no total na praça das maravilhas); os 9 poderes da E6 com arte própria e os ícones/retratos revistos.
- [ ] `art:check`: PNG ≤ 500 MB, cada Era ≤ 40 MB a 1×, pior caso ≤ 260 MB a 1×, `hud` ≤ 8 MB; `renderperf` ≤ 120/160 MB
  (ou o número medido levado ao dono, M5).
- [ ] Hash do `smoke 20 42` igual ao de antes; `SIM_VERSION` igual.
- [ ] `typecheck`, testes, playtests e scripts de captura verdes; documentos atualizados; commits feitos.

## Armadilhas

- **Nunca rode `npm run art:bake` sem `--out`**: ele refaz `public/art` só com o que está no cache, e o cache do
  contêiner não tem as 35 unidades de hoje. Sempre rascunho + `merge-group --groups <lista>`.
- **`merge-group` exige o grupo inteiro no rascunho** (todo asset do índice daquele grupo). Para trocar um asset de
  `units_e5`, asse `--only units_e5` (os outros vêm do cache). O grupo `units` (as 35 de hoje) **nunca** é reassado
  nem fundido na E8. O grupo `icons` (ícones de edifício da Etapa 3) não é ligado a assets: o `merge-group` o copia do
  rascunho, então funda `--groups buildings,icons` sempre que um edifício base ou cópia mudar, e rode
  `npm run art:hud` depois de criar manifestos novos (o atlas `hud` gera `unit/<id>`/`bld/<id>` dos manifestos).
- **O `manifest.mjs` entra no hash de todo edifício**, e `human.js`/`materials.js` no de toda unidade; todos os
  `page/buildings*.js` e `page/rigs/buildings-*.js` (menos o `buildings-wonders.js`, A4) entram no de todo edifício:
  qualquer edição invalida o cache desses assets (as 111 cópias também). É esperado; só não confunda "reassou" com
  "mudou" — a prova de que não mudou é o `cache-diff`.
- **Ordem de criação dos materiais**: material novo só no FIM de `createMaterials` (o id do material decide a ordem de
  desenho no three; trocar a ordem muda os edifícios de hoje).
- **A vista de materiais é `Object.create(M)`**: `Object.entries(V)` só vê as chaves trocadas. `applyDamage` e
  `texturize` usam o `M` original (`k.M0`), senão o dano não acha as paredes e a textura sai errada (mármore em cima de
  tijolo). A vista é memoizada por Era (`VIEWS`, A/C): sem isso, o cache de materiais clonados do `glb` cresce a cada
  asset.
- **Era 1 tem de seguir exatamente o código de hoje**: nada de `k.rand()` novo antes de chamadas antigas, nada de
  peça nova na Era 1, `ERA_REMAP[1] = {}` e `eraView` devolvendo o próprio `M`. A Era **não** entra na semente. As
  cópias do CC herdariam o `seedVariant` do base: o `eraParams` da D7 (`"*": a2`) existe por isso.
- **Névoa**: a troca de asset (`setArt`) só com o edifício vivo para o jogador local; senão o avanço de Era do inimigo
  vaza pela aparência dos edifícios vistos sob a névoa. (A vista refeita por mudança de `artId` já acontece hoje com a
  hidra; não "conserte" esse comportamento fora do escopo.)
- **Campanha**: sempre `visualEra(age, config.visualEraMax)`, nunca `age` direto, para edifícios **e** unidades (o
  cidadão também), e na pré-carga (`erasInPlay`). Não há jogador Gaia: o jogador 0 conta em `erasInPlay`.
- **`buildingReady`/`unitReady` não podem pedir carregamento**; quem pede é `ensureEras` (pré-carga) — senão toda
  consulta liga todos os grupos e a VRAM estoura. E `releaseEras` nunca libera um grupo que está no conjunto em uso
  (senão a pré-carga e a liberação brigam a cada 2 s).
- **Vista de unidade refeita a cada quadro**: se o id calculado (`unitArtEra` → `unitArtId`) oscilar, a vista é
  destruída sem parar. A Era da unidade só muda com estudo ou avanço; confira com um log temporário se nada pisca.
- **O cidadão base continua no grupo `units`**: não ponha o campo `era` no `villager.json` (moveria o base para
  `units_e0` e exigiria reassar o grupo `units` inteiro); as cópias saem do campo `eras` (D12), nunca do
  `unitVariants`. Só as cópias vão para `units_e<n>`.
- **Poeira na carga**: o primeiro `setArt` de uma vista recém-criada (partida carregada, entrada no campo de visão)
  não é troca de Era: só solte a poeira quando `v.eraSeen` já existia e subiu (B5).
- **`art-units-review` mede as 35 de hoje contra o rig atual**: mexer em `human.js`, `horse.js`, `siege.js` ou nas
  poses existentes (em vez de só acrescentar) quebra o teste mesmo sem reassar. Acrescente kits e poses; não altere
  os de hoje.
- **Passada obrigatória**: o `art:check` recusa `walk`/`run`/`carry` sem `stride > 0` em quem não voa. Navios e
  serpentes medem pelo `glide` (tem de ser **função**, `measure.mjs`); o `vehicle` mede pela junta `wheel` +
  `wheelRadius` (como o cerco).
- **Sem cavaleiro é `rider: null`** (o `horse.js` testa `P.rider`; `false` também funciona hoje, mas o `null` é o que o
  `eraParams` não apaga e o que os testes conferem). A túnica de time inteira é `tunicTeam: true` (já existe).
- **Folhas de contato só com `--contact <pasta>`** (a pasta é obrigatória): sem a opção o bake normal não grava
  nenhuma (só o `--preview` cai em `docs/art` sozinho); as folhas saem como `etapa<N>-<id>-contato.png` (`N` =
  `stage` do manifesto, padrão 3 nos edifícios e 2 nas unidades).
- **Nome `olive`**: é espécie de árvore nos props (`olive/<variante>/<porte>`); o nó de oliveiral usa o quadro
  `olive_grove/0`.
- **Ids da E6 e o Talos**: confira os 12 ids reais (`grep -n "satyr\|scylla\|talos" src/core/data/units.ts`) antes de
  criar os manifestos das criaturas; os da E6 valem. O Talos é tipo próprio (`talos.json`); a variante `colossus_e6`
  só se o `grep` do Talos vier vazio (seção 10).
- **Navios**: o `renderer.localClippingEnabled = true` já está ligado em `page/bake.js` (obra dos `.glb`); o `sink`
  corta com planos nos **clones** dos materiais (o `M` é compartilhado por toda a sessão do bake: plano no material
  original corta os edifícios seguintes). O `mirror: true` espelha as direções E/SE/NE — nada de letra ou número
  pintado no casco.
- **Galeras atiram flechas** (`ranged` perfurante → projétil `arrow`), não pedras; o fogo grego sai pela tag `fire` →
  `fireball` (não existe projétil `fire`).
- **Canal de Corinto é passável**: a ponte não pode passar de 0,6 tile de altura, senão cobre as unidades que andam por
  cima (a ordem de desenho é pela linha de base do edifício).
- **`art:diff` muda na Era I**: com as cópias `_e0` (CC, casas, cidadão), as capturas da partida na Era I deixam de
  bater com `docs/art/ref/`; é esperado — olhe cada uma e só então `npm run art:diff -- --update` (M6, Verificação 10),
  com nota no commit. Uma diferença nas capturas da Era II não é esperada: é bug.
- **PNG no git**: cada rebake de um grupo troca os PNG dele. Commit dos PNG só no fim de cada bloco de arte, depois das
  capturas olhadas; nunca um commit por tentativa.
- **Bake longo em primeiro plano** trava a sessão: sempre em segundo plano com log.
- **Não mexa em `src/core`**: nem para "facilitar" uma captura (use os ganchos `debug*` do `main.ts`, incluído o
  `debugSpawn` que a E4 já criou).
- O vitest às vezes sai com código 1 por timeout de RPC sem teste falhando: rode o arquivo sozinho antes de procurar
  um bug.

## Ao terminar

1. **`docs/eras/PROGRESSO.md`** (se faltar, crie com o modelo do "Ao terminar" da E1): na tabela
   (`| Etapa | Estado | Data | Commit | Notas |`), a linha da E8:
   `| E8 | feito | <dd/mm/aaaa> | <hash curto> | kit de Era (8 roupas, 111 cópias de edifício + cidadão/barcos por Era), 54 unidades/navios (41 de linha, Mercador, caravana, 11 navios), 12 criaturas da E6 (9 + Escila, Ceto, Talos), 17 maravilhas, efeitos de pólvora/vapor e poderes da E6; PNG <X> MB, pior caso <Y> MB a 1×; capturas docs/art/e8-* aguardando o dono |`.
   Durante a etapa, anote ali também o fim do lote 1 (Bloco F) e do lote 2 (Bloco K), e numa seção "Medições da E8"
   o `art:check` (PNG/VRAM por grupo), o `renderperf` e o `rendercpu` de antes e depois.
2. **`docs/ROADMAP.md`**: marque a E8 como concluída (semanas 13–18) e deixe "Aprovar as capturas de cada Era" como
   pendência do dono.
3. **`docs/ART.md`**: Apêndice J (E8) com as decisões D1–D31 resumidas, a tabela de Eras, o orçamento medido (§6) e os
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
   54 unidades e navios novos, as 12 criaturas da E6 (com Escila, Ceto e o Talos), 17 maravilhas, efeitos de
   pólvora/motor/vapor/chaminé e os poderes da E6, ícones por degrau. Nada muda no núcleo (smoke 20 42 com o mesmo
   hash final).

   <rodapé de atribuição da sessão>
   ```
   Faça push só para a branch da sessão (rotina do `docs/eras/LEIA-ME.md`); nunca para `main` sem pedido do dono.
