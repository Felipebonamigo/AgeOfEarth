# Editor de cenários e mapas fixos

Documento de design das fases **3.2** (editor interno de cenários) e **3.3** (mapas fixos) do roteiro (`docs/ROADMAP.md`). É o contrato entre as etapas de implementação: formato de dados, pontos de contato com o código existente, fluxo do editor, plano por etapas com critérios de pronto, riscos e o que ainda depende do dono do projeto.

Ponto de partida real (HEAD `50bb387` + alterações não commitadas): já existem `src/core/map/fixed.ts` (`FixedMapData`, `mapToData`, `mapFromData`, `mapDataSize`), `GameConfig.map?: FixedMapData`, `createGame` carregando `config.map` em vez de gerar, `tests/fixedmap.test.ts`, e — não commitados — o seletor "Mapa fixo" na Partida rápida (`MainMenu.fixedMap`, `#m-fixed`, `#m-fixed-load`, `#m-fixed-clear`), o botão "Exportar este mapa" no menu da partida (`HUDCallbacks.onExportMap`, `window.aoe.mapData()`) e `scripts/playtest-fixedmap.mjs`. Este documento parte daí e não reinventa o formato: **estende `FixedMapData`** com campos opcionais.

---

## 1. Objetivo e escopo

### 1.1 Objetivo

1. **Mapas fixos (3.3)** — um mapa desenhado (ou exportado de uma partida gerada) é um arquivo JSON que joga em Partida rápida, Multiplayer (lockstep), replays, saves e campanha pelo **mesmo caminho** que existe hoje: `createGame(config)` com `config.map` inline. Nenhuma mensagem de rede nova; o relay já repassa e guarda `start.config`, `Session.replay` refaz `createGame(o.config)` e o instantâneo de reconexão leva `serialize(state)` com o mapa completo.
2. **Editor interno (3.2)** — um modo da sessão existente (`ui.mode = 'editor'`) que reaproveita Renderer, Camera, Minimap, HUD (modais/toasts), Input e `files.ts` para pintar terreno, colocar recursos, edifícios, unidades e inícios, validar, salvar, exportar e **testar numa partida real** (sempre reconstruída do arquivo). O editor é um *produtor de arquivos*: tudo que joga o mapa fica pronto e testado antes de existir uma tela de edição.
3. **Cenário declarativo** — formato JSON fechado e tipado (`ScenarioFile`) para objetivos, gatilhos, vitória/derrota e extras de HUD, compilado para o mesmo `ScenarioDef` que `runner.ts`, `hud.ts`, `tests/scenarios.test.ts` e `scripts/missions.ts` já consomem. É a última etapa deste plano e a base do editor público (Fase 7).

### 1.2 Ordem e princípios

- **3.3 antes de 3.2.** Formato + carregador + `createGame` (Etapa 1) e integração em menu/lobby/replay/save (Etapa 2) entregam valor ao dono (jogar mapas importados, inclusive online) com ~17 h; o editor vem depois.
- **Mapa sempre inline em `GameConfig.map`.** Sem "embutido por id" na rede: dois builds com mapas embutidos diferentes não podem carregar mapas diferentes em silêncio. Mapas embutidos existem só como *fonte* para o seletor; o que viaja é o dado.
- **Arquivo = fonte da verdade mínima e só inteiros.** `blocked`, `nodeAt`, `buildingAt`, `gateTeam` e ids de nós/entidades são sempre derivados no carregador (como `deserialize` já faz). Ids de nó: `resetNodeSeq()` + inserção na ordem canônica `(y, x)`.
- **Determinismo por construção.** Tudo em `src/core` continua sob a varredura de `tests/determinism.test.ts`. O editor vive em `src/editor/` (fora do núcleo) e muta o estado de uma sessão pausada diretamente, nunca por `Command`; **"Testar" e "Jogar" sempre reconstroem a partida com `createGame` a partir do arquivo** (rng, tick, nextId e névoa iguais para qualquer par).
- **Dado de outro par é não confiável.** `validateMap` roda no import, no anfitrião ao escolher e em **todos** os clientes antes de `Session.newGame`; o relay limita o tamanho do `start`. Textos vindos de arquivo/rede passam por escape antes de `innerHTML`.
- **Compatibilidade.** `mapSize` continua obrigatório em `GameConfig` (ignorado quando há `map`). Campos novos têm padrão no carregador e em `deserialize`. `v: 1` do `FixedMapData` permanece; só uma mudança incompatível vira `v: 2` com `migrateMap` (nunca `throw`).
- **Cada etapa termina verde**: `npm test`, `npm run typecheck`, `npx tsx scripts/missions.ts`, `npx tsx scripts/horde.ts`, playtests Playwright pertinentes, commit em português com o rodapé de atribuição, e `docs/ROADMAP.md` marcado.

### 1.3 O que fica para depois (fora deste plano)

- Terreno em RLE (`terrainRle`) e decor regenerado por ruído (reduz o arquivo médio de ~70 KB para ~40 KB) — só se o tamanho incomodar.
- IndexedDB/pasta `userData/maps` no Electron, miniaturas, tags, `workshopId`, publicação no Workshop (Fase 6/7).
- Editor de gatilhos por formulários (a Etapa 5 entrega textarea JSON validado + modelos).
- Migração de m2/m3/Horda para JSON (só m1 é reescrita como prova de cobertura; as missões existentes seguem em TS).
- Simetria rotacional, edição colaborativa, editor público standalone.

---

## 2. Modelo de dados JSON

### 2.1 `FixedMapData` (arquivo `<id>.map.json`) — `src/core/map/fixed.ts`

Campos existentes inalterados; os novos são **opcionais com padrão** (mesma versão `v: 1`).

```ts
export interface FixedMapData {
  v: 1;
  name?: string;                                 // PT (exibido); nameEn? para o seletor em inglês
  w: number; h: number;                          // 48..160 cada; w*h ≤ 25 600 (limite de validação)
  terrain: string;                               // base64 de w*h bytes (TERRAIN.*), como hoje
  decor: string;                                 // base64 de w*h bytes (só visual), como hoje
  nodes: [NodeType, number, number, number][];   // [tipo, x, y, quantidade] em ordem (y, x) — mapToData já ordena
  starts: [number, number][];                    // índice = índice do jogador; CC 3x3 em (x-1, y-1)
  // ---- novos (Etapa 1), todos opcionais ----
  id?: string;                                   // slug estável ("vale-do-eco"); gerado do nome no editor, não muda ao renomear
  nameEn?: string; author?: string; description?: string;
  startKit?: boolean;                            // padrão true: CC + 5 cidadãos + batedor em cada início (createGame)
  entities?: MapEntity[];                        // padrão []: edifícios antes de unidades, cada grupo em ordem (y, x, tipo, dono)
  startTeams?: number[];                         // sugestão de time por início (ex.: [0,0,1,1]) para "atribuição por time" no lobby
  koth?: [number, number];                       // colina do Rei da Colina; padrão: centro do mapa (como createGame faz hoje)
  relics?: boolean | [number, number][];         // padrão true: placeRelics sorteia pela semente; false em cenários; lista (G10) = posições fixas [x, y] (tiles, na ordem do arquivo; [] = nenhuma)
  scenario?: ScenarioFile;                       // cenário declarativo embutido (Etapa 5); ignorado até lá
}
export type MapEntity =
  | { kind: 'building'; type: string; owner: number; x: number; y: number; complete?: boolean; tag?: string }   // x,y = canto (tx,ty); complete padrão true
  | { kind: 'unit'; type: string; owner: number; x: number; y: number; tag?: string };                          // tile; nasce em (x+0.5, y+0.5) ou nearestFreeTile
```

Exemplo curto (2 inícios, 48×48, uma torre e um hoplita pré-colocados):

```json
{ "v": 1, "id": "vale-do-eco", "name": "Vale do Eco", "nameEn": "Echo Valley", "author": "Felipe",
  "w": 48, "h": 48,
  "terrain": "AAAAAAAAAAAAAAAAAAAAAAABAQEB…", "decor": "Fz5QZ3d4…",
  "starts": [[10, 10], [37, 37]], "startTeams": [0, 1], "startKit": true,
  "nodes": [["tree", 3, 0, 150], ["tree", 4, 0, 150], ["gold", 15, 2, 900], ["berry", 30, 2, 175]],
  "entities": [ { "kind": "building", "type": "tower", "owner": 0, "x": 14, "y": 8 },
                { "kind": "unit", "type": "hoplite", "owner": 1, "x": 34, "y": 36, "tag": "guarda" } ] }
```

Derivados, nunca gravados: `blocked`, `nodeAt`, `buildingAt`, `gateTeam`, ids de nós (`NODE_ID_BASE`, +1, +2… na ordem do arquivo) e de entidades (`state.nextId`), estado das unidades.

**API do módulo** (tudo determinístico, sem `Math.random`):

| Função | Papel |
|---|---|
| `mapToData(map, name?)` (existe) | `GameMap` → dados; passa a ser chamada por `saveMap(state, meta)` que acrescenta `entities` a partir de `state.buildings`/`state.units` vivos e os demais metadados, em ordem canônica |
| `mapFromData(data)` (existe) | dados → `GameMap`; passa a **derivar DEEP** (`deriveDeepWater`) quando o arquivo não tem nenhum tile 5, e a rejeitar (`throw`) tamanho fora dos limites |
| `canonicalize(data)` | ordena nós e entidades, remove campos com valor padrão; `saveMap(loadMap(f)) ≡ canonicalize(f)` |
| `mapHash(data): number` | FNV‑1a 32 bits (mesma mixagem de `stateHash`) sobre `w`, `h`, cada char de `terrain`, `starts`, `startTeams`, `startKit`, `nodes`, `entities`, `koth`, `relics`. **Não** inclui `name/author/description/decor`: renomear ou "variar visual" não muda o hash |
| `validateMap(data, opts?): MapIssue[]` | `MapIssue = { level: 'error' \| 'warn'; code: string; x?: number; y?: number; params?: Record<string, string \| number> }`; a interface traduz por `t('map.issue.' + code, params)` |
| `blankMap(w, h, nStarts, seed)` | grama com `decor` de `makeNoise(seed + 202)` (mesma fórmula de `generateMap`) e inícios em círculo (`unitCircle`), sem nós |
| `MAP_LIMITS` | `{ minSide: 48, maxSide: 160, maxTiles: 25_600, maxJsonBytes: 512 * 1024 }` |

**Regras de `validateMap`** (`opts = { players?: number; mode?: GameMode }`):

- Erros (bloqueiam Testar/Iniciar/Import): `size` (fora de `MAP_LIMITS`), `terrainLen`/`decorLen` (base64 não decodifica em `w*h` bytes), `badTerrain` (byte > 5), `startsCount` (< 2, > `MAX_PLAYERS` ou < `players`), `startOut` (a < 8 tiles da borda), `startBlocked` (3×3 do CC sobre água/montanha/nó, só se `startKit !== false`), `nodeOut`/`nodeOnBlocked`/`nodeDup`/`unknownNode`, `unknownType` (tipo fora de `UNITS`/`BUILDINGS`), `badOwner` (`owner >= starts.length`), `entityOverlap` (footprint sobre nó, água, montanha ou outro edifício), `fileTooBig`, `regicideNoTc` (modo `regicide` e algum jogador sem `town_center` nem kit inicial); com `relics` (G10): `relicsFormat` (`relics` que não é `true`/`false` nem lista, ou item que não é `[x, y]` com dois inteiros — conferido no valor recebido, porque o `map.data` de um cenário não passa por `migrateMap`), `relicOut` (fora do mapa), `relicDup` (duas no mesmo tile), `relicBlocked` (sobre água, montanha, nó, edifício que bloqueia ou o CC do kit), `relicUnreachable` (fora da região de todos os inícios: ilha, bolsão, atrás de muralha sem portão) e `relicsCount` (mais de `MAX_FIXED_RELICS` = 32).
- Avisos (não bloqueiam; listados no painel com "ir até"): `startsDisconnected` (inícios em `componentAt` diferentes), `chokepoint` (`articulationPoints` a ≤ 10 tiles de um início), `pocket` (componente passável < 8 tiles), `nodeNoAccess` (`nodeAccessTiles === 0`), `lowStartFood`/`lowStartWood` (sem comida a ≤ 14 / madeira a ≤ 16 tiles do início — os raios que `createGame` usa em `nearestNode` para as ordens iniciais), `kothUnreachable` (colina fora do componente de algum início), `wonderComplete` (maravilha completa pré-colocada inicia a contagem de vitória no tick 0), `mainComponentSmall` (maior componente < 60 % dos tiles passáveis), `aiNoTc` (jogador IA sem Centro Cívico: `aiThink` fica sem base).

**Tamanhos** (JSON, base64 = 4/3 dos bytes): pequeno 80×80 ≈ 8,5 + 8,5 + ~850 nós × 22 ≈ 36 KB; médio 112×112 ≈ 16,7 + 16,7 + ~1 700 × 22 ≈ 72 KB; grande 144×144 ≈ 27,6 + 27,6 + ~2 800 × 22 ≈ 118 KB. Cabe no WebSocket (`maxPayload` de 2 MiB no relay), no replay e na cota do `localStorage` (~5 MB) com margem; `aoe_save_v1` num mapa médio já tem ~300 KB.

**Versionamento**: `v` inteiro. Campo novo ⇒ opcional com padrão no carregador. Mudança incompatível ⇒ `v: 2` + `migrateMap(data)` no `mapFromData` e no import (nunca `throw` por versão, ao contrário do save hoje).

### 2.2 `GameConfig` (`src/core/types.ts`)

```ts
export interface GameConfig {
  seed: number; mapSize: 'small' | 'medium' | 'large';   // obrigatório; ignorado quando map existe
  scenario?: string; players: …; revealMap?; startingAge?; startingResources?; mode?; mapType?;
  map?: FixedMapData;                                    // existe
  mapHash?: number;                                      // mapHash(map): identificação (lobby, replay, biblioteca), não segurança
  startOrder?: number[];                                 // jogador i usa map.starts[startOrder[i]] (atribuição por time/sorteio); padrão identidade
  startKit?: boolean | boolean[];                        // por partida/por jogador; padrão map?.startKit ?? true
  scenarioData?: ScenarioFile;                           // cenário declarativo (Etapa 5); precedência sobre scenario
}
```

- **Save** (`serialize`): continua gravando `config` inteiro (com `map`) — o teste `tests/fixedmap.test.ts` já exige `loaded.config.map` — porque replay a partir de save (`base`) e o relatório `aoe_desync_v1` dependem do config completo. Custo: +36–118 KB por save; aceitável. `deserialize` inalterado (defaults já cobrem).
- **Replay** (`Session.replayJSON`): `config` com `map` inline ⇒ replay autossuficiente.
- **Lobby** (`LobbyState.settings`): só metadados `map?: { id, name, w, h, starts, hash }` — `settings` é retransmitido a cada `lobby`; o `FixedMapData` vai **uma vez**, dentro de `start.config`, e o relay já o guarda em `room.config` para quem reconecta (`joined … config: r.config`).

### 2.3 `ScenarioFile` (cenário declarativo) — `src/core/scenario/schema.ts` (Etapa 5)

Gramática **fechada e tipada**, sem `eval`, sem strings de expressão, sem templates (`$i`). Cada operador mapeia 1:1 num helper existente ou novo em `helpers.ts`. Vive embutido em `FixedMapData.scenario` (arquivo único do criador) ou em `src/core/scenario/missions/<id>.scenario.json` (campanha), onde `map` indica a origem do terreno.

```ts
type Text = string | { pt: string; en?: string };                         // resolvido por tx() ao emitir; nunca entra no hash
type PlayerSel = number | 'local' | { team: number } | '$p';               // índice; primeiro humano; primeiro do time; jogador do forEachPlayer
type EntityRef = { tag: string; pick?: 'first' | 'alive' | 'nearest'; near?: Point }   // G5: grupo da tag; alive = 1º vivo; nearest exige near
               | { var: string } | { tc: PlayerSel }
               | { player: PlayerSel; type: string; pick?: 'first' | 'nearest'; near?: Point };   // first = menor id; nearest desempata por id
type Point = { at: [number, number] } | { start: number; dx?: number; dy?: number }
           | { tc: PlayerSel; dx?: number; dy?: number } | { entity: EntityRef; dx?: number; dy?: number };
type Value = number | { stat: 'age'|'pop'|'popCap'|'food'|'wood'|'gold'|'favor'|'knowledge'|'alive'|'relics'; player: PlayerSel }   // relics (G10): guardadas nos Templos do jogador
           | { stat: 'difficulty' }                                           // G3: 0 Fácil, 1 Normal, 2 Difícil
           | { var: string } | { add: [Value, number] }
           | { time: true };                                                  // G4: segundos de jogo agora (inteiro); com setVar marca um instante
type Cmp = { gte?: Value; lte?: Value; eq?: Value; gt?: Value; lt?: Value };

type Condition =
  | { all: Condition[] } | { any: Condition[] } | { not: Condition }
  | { time: Cmp } | { every: { seconds: number; after?: number } }              // ctx.seconds inteiro; seconds % n === 0
  | { objective: string; is: 'pending' | 'done' | 'failed' } | { fired: string } | ({ firedCount: { prefix: string } } & Cmp)
  | ({ units: UnitFilter } & Cmp) | ({ buildings: BuildingFilter } & Cmp) | ({ value: Value } & Cmp) | ({ var: string } & Cmp)
  | { entity: EntityRef; exists?: boolean; complete?: boolean; progress?: Cmp; hp?: Cmp }   // G9: hp = fração hp/maxHp (0–1); sem exists, exige a entidade viva
  | ({ koth: { team: number } } & Cmp) | ({ wonderHeld: { player: PlayerSel } } & Cmp)   // G2: segundos na colina (time T) / com a Maravilha de pé
  | { kingAlive: PlayerSel } | { alive: PlayerSel }                             // G2: rei vivo; jogador não eliminado
  | { difficulty: 'easy' | 'normal' | 'hard' | ('easy' | 'normal' | 'hard')[] }   // G3: config.campaignDifficulty (ausente = normal)
  | ({ powerUsed: { player: PlayerSel; id: string } } & Cmp)                    // G11: usos do poder desde o início; sem comparação = ao menos 1
  | ({ kills: { player: PlayerSel; type?: string | string[]; by?: { tag: string } | { type: string } } } & Cmp);   // G13: abates com autor (tipo da vítima; by = grupo da tag ou tipo do autor)
interface UnitFilter { player: PlayerSel; type?: string | string[]; tag?: string; excludeTag?: string; state?: UnitState;
  near?: { point: Point; radius: number };                                      // dx²+dy² < r², sem trigonometria
  reachable?: { buildingsOf: BuildingFilter } }                                 // rectReachable (objetivo da Horda)
interface BuildingFilter { player?: PlayerSel; team?: number; notTeam?: number; type?: string | string[]; complete?: boolean; tag?: string }   // tag: o grupo inteiro

type Action =
  | { do: 'say'; speaker: Text; text: Text; icon?: string }
  | { do: 'objective'; id: string; status: 'done' | 'failed' | 'pending' } | { do: 'reveal'; id: string }
  | { do: 'raid'; player: PlayerSel; units: string[]; target: Point; angle: number | { base: number; perIndex: number }; distance?: number }
  | { do: 'spawn'; player: PlayerSel; units: string[]; at: Point; tag?: string; state?: 'pray'; prayAt?: EntityRef; scaled?: boolean; name?: Text }   // scaled (G3): escala como raid; name (G8)
  | { do: 'place'; player: PlayerSel; building: string; at: Point; exact?: boolean; complete?: boolean; progress?: number; tag?: string; name?: Text }
  | { do: 'give'; player: PlayerSel; resources: Partial<Record<ResourceType, number>> }
  | { do: 'set'; player: PlayerSel; age?: number; resources?: Partial<Record<ResourceType, number>>; techs?: string[]; minorGods?: string[];
      powers?: { add?: string[]; remove?: string[]; reset?: string[] } }        // G11: remove → add → reset (ids de POWERS)
  | { do: 'removeAll'; player?: PlayerSel; team?: number }                       // removeBuildingNow/removeUnitNow
  | { do: 'setVar'; name: string; value: Value } | { do: 'addVar'; name: string; delta: number }
  | { do: 'storeEntity'; var: string; entity: EntityRef } | { do: 'advanceBuild'; entity: EntityRef; seconds: number }
  | { do: 'order'; units: { tag: string } | UnitFilter; order: { type: 'move' | 'attackMove'; at: Point }
      | { type: 'attack' | 'gather' | 'pray' | 'repair' | 'garrison'; target: EntityRef } | { type: 'ungarrison'; target?: EntityRef } }   // G6: garrison/ungarrison
  | { do: 'kill'; entity: EntityRef } | { do: 'ceasefire'; seconds: number }
  | { do: 'remove'; entity: EntityRef }                                          // G6: some na hora (removeUnitNow/removeBuildingNow), sem morte nem abate
  | { do: 'hpFloor'; entity: EntityRef; value: number }                           // G9: piso de vida (fração 0–1); value 0 tira o piso
  | { do: 'damage' | 'heal'; entity: EntityRef; amount?: number; fraction?: number }   // G9: pontos OU fração de maxHp; dano sem autor, respeita o piso
  | { do: 'defeat'; player: PlayerSel }                                          // derrota roteirizada: alive=false, evento e tudo do jogador some
  | { do: 'ability'; unit: EntityRef; target?: EntityRef | Point }               // G12: habilidade (Q) do herói pelo comando 'ability'; target: inimigo = atacar, aliado = ir, ponto = atacar-mover
  | { do: 'forEachPlayer'; team?: number; alive?: boolean; then: Action[] };    // dentro: '$p' = jogador, índice k para angle.perIndex

interface ScenarioFile {
  format: 'aoe-scenario'; version: 1;
  id: string; title: Text; subtitle?: Text; icon?: string; intro: Text[]; outro?: Text[]; hints?: Text[];
  map?: { gen: { mapSize: 'small' | 'medium' | 'large'; mapType?: MapType; seed: number }; relics?: boolean | [number, number][] }   // G10: relics só no mapa gerado
       | { data: FixedMapData };                   // omitido quando embutido num mapa; no mapa fixo, as relíquias ficam em data.relics
  config: { seed?: number; players: { name: Text /* G8 */; god; isAI; difficulty; team?; puppet?; maxAge?; forbid? }[]; startingAge?: number; startingResources?: …; revealMap?: boolean; startKit?: boolean | boolean[]; mode?: GameMode;
            maxAge?: number; forbid?: { buildings?: string[]; units?: string[]; techs?: string[] } };   // G6: travas globais; por jogador, maxAge substitui e forbid soma
  vars?: Record<string, number>;
  setup?: Action[];                              // após as entidades do mapa; tags → vars['#tag'] = id
  objectives: { id: string; text: Text; optional?: boolean; hidden?: boolean; done?: Condition; failed?: Condition }[];
  triggers: { id: string; when: Condition; then: Action[]; repeat?: boolean | { max: number } }[];   // G17: repeat conta os disparos em vars['@id']; max = teto
  victory: Condition; defeat?: Condition;        // a derrota implícita do runner (nenhum humano não-marionete de pé) continua; humanos em times diferentes: resultado por time (winnerTeam)
  hud?: ( { type: 'countdown'; seconds: number; while: Condition; label: Text; fromVar?: string }                     // G4: fromVar = relativo à marca
         | { type: 'progress'; entity: EntityRef; max: number; label: Text; while?: Condition; format?: HudFormat }       // obra de um edifício
         | { type: 'progress'; var: string; max: Value; label: Text; while?: Condition; format?: HudFormat } )[];        // G4: variável do cenário
}
type HudFormat = 'percent' | 'count' | 'time';   // "63%" (padrão), "12/30", "2:15 / 6:00"
```

**Ato III (G4, G6, G8, G9)** — semântica dos campos novos (`docs/STORY.md` §6):
- **G4 · HUD e tempo relativo.** `{ "do": "setVar", "name": "t0", "value": { "time": true } }` guarda o segundo atual; `{ "time": { "gte": { "add": [ { "var": "t0" }, 600 ] } } }` vale 600 s depois. `hud.countdown` com `fromVar` conta `seconds` a partir da marca (sem marca, não aparece; um valor em `vars` já vale como marca, então deixe a variável fora de `vars`). Variável ausente vale 0: o relativo sem marca conta do segundo 0, por isso guarde-o com `{ "fired": <gatilho da marca> }` no mesmo `all`. `hud.progress` com `var` desenha a barra da variável até `max` (número ou valor, ex.: `{ "var": "guarda" }`), só enquanto `while` valer; `format` escolhe o texto. O lint avisa `var` que nenhum `setVar`/`addVar` escreve (nem `vars`), `fromVar` sem `setVar` cujo valor tenha `{ "time": true }` e `fromVar` declarado em `vars`.
- **G6 · remove, guarnição e travas.** `remove` apaga a entidade sem morte, abate, Sombras de Hades nem escombros (o embarque da m11); a fila de um edifício removido (unidades, tecnologias, avanço de Idade) é reembolsada, como na destruição. `order garrison` põe as unidades no edifício aliado alvo (as que cabem, `canGarrison`); num edifício de outro time ninguém recebe a ordem (a atual segue, como no comando do jogador); `ungarrison` tira do alvo ou, sem alvo, de onde estiverem. A ordem é decidida pelo tipo: `at` em ordem por alvo (ou `ungarrison`) e `target` em `move`/`attackMove` são erros de validação. `config.maxAge` (0–4, nunca abaixo de `startingAge`) e `config.forbid` valem para todos; em `config.players[i]`, `maxAge` substitui o global e `forbid` soma. São conferidos em `commands.ts` (`canAdvanceAge`, `canTrain`, `canResearch`) e em `buildingLimitOk` (`src/core/sim/restrictions.ts`): o comando é recusado com "Proibido nesta missão" / "Forbidden in this mission", o botão do HUD aparece desabilitado com esse motivo e a IA não tenta (nem junta fundo para uma Idade travada). `spawn`/`place` do roteiro não passam pela trava. Save ou replay de missão embutida gravado antes das travas (config sem nenhuma) recebe as da missão atual ao carregar (`migrateScenarioLocks`).
- **G8 · nomes.** `spawn`/`place` com `name` gravam `{ pt, en? }` na entidade (`displayName`, salvo no save); o painel de seleção, a grade da seleção múltipla e o tooltip mostram o nome no idioma atual (o tipo vai na descrição). `config.players[i].name` aceita `{ pt, en }`: o estado guarda o texto do idioma ao criar a partida e `nameText` deixa o HUD trocar de idioma. O lint avisa nome sem `en`.
- **G9 · vida de chefe.** `{ "entity": …, "hp": { "lte": 0.5 } }` compara a fração da vida (números entre 0 e 1, arredondada a 1e-9: com o chefe no piso `f`, `{ "lte": f }` vale). `hpFloor` impede a vida de descer abaixo de `value × maxHp` em qualquer dano (combate, atrito, Raio, Maldição, Petrificação, `damage`); abaixo do piso ele não cura; `kill`, `remove` e dispensar continuam matando. `damage`/`heal` usam `amount` ou `fraction` (um dos dois); o dano do roteiro não tem autor (sem abate creditado). Tudo em `EntityRef` vale para uma entidade (numa tag de grupo, a primeira; use `pick`).

**G10–G13 e G17** — semântica (`docs/STORY.md` §6):
- **G10 · relíquias.** `map.relics` (mapa gerado) ou `map.data.relics` (mapa fixo): `true`/ausente sorteia pela semente, `false` tira todas e uma lista `[[x, y], …]` põe uma relíquia no centro de cada tile, na ordem da lista (no máximo 32). No mapa fixo, `validateMap` exige formato `[x, y]` inteiro sem repetir (`relicsFormat`, `relicDup`) e terra livre na região de algum início (`relicOut`, `relicBlocked`, `relicUnreachable`, `relicsCount`), e só as relíquias do mapa valem: `map.gen.relics` de um cenário embutido num mapa fixo é ignorado; no gerado, `validateScenario` confere formato, limites do tamanho e repetidas, e o lint gera o mapa pela semente e avisa a posição que cai em água, montanha, recurso, no CC do kit ou fora da região dos inícios (no jogo ela vai para a terra alcançável mais próxima, até 6 tiles, ou é descartada). `map.relics` junto de `data` é erro (use `data.relics`). `{ "value": { "stat": "relics", "player": 0 }, "gte": 2 }` conta as relíquias guardadas agora nos Templos do jogador (`relicsOf`: um Templo derrubado solta a dele).
- **G11 · poderes.** `{ "do": "set", "player": 0, "powers": { "remove": ["bolt"], "add": ["oracle"], "reset": ["curse"] } }` aplica, nesta ordem, remove (tira, inclusive o do deus maior), add (concede sem repetir; quem já tem fica como está) e reset (devolve o uso de quem já tem; não concede). A barra de poderes, o controle, a IA e o comando `power` leem a mesma lista (`player.powers`): tirar o poder que está sendo mirado cancela a mira. `{ "powerUsed": { "player": 0, "id": "bolt" } }` vale depois do 1º uso; com comparação (`"gte": 2`), compara os usos desde o início — reset e remove não zeram a contagem (`state.scenario.powerUses`, salvo no save; o evento `powerUsed` traz o id do poder).
- **G12 · habilidade.** `{ "do": "ability", "unit": { "tag": "aquiles" }, "target": { "tag": "aldeia1" } }`: o herói usa a habilidade (Q) por `useAbility`, o mesmo caminho do comando `ability` do jogador — em recarga, guarnecido, morto ou sem habilidade nada acontece (a habilidade não tem custo). Vale para marionete (sem IA). Com `target` e a habilidade usada: entidade de outro time = atacar; do mesmo time = ir até ela; ponto (`at`, `start`, `entity`, ou `tc` com `dx`/`dy`) = atacar-mover. `{ "tc": P }` sem deslocamento é o Centro Cívico (entidade). O raio das habilidades de área usa o hash espacial do tick, como o comando.
- **G13 · autoria de abate.** Toda unidade morta ou edifício derrubado por um inimigo (golpe, flecha, dano em área, petrificação, poder ou atrito) soma em `state.scenario.kills`: por jogador autor e tipo da vítima (`byPlayer`) e, quando há entidade autora (golpe, flecha, dano em área, petrificação), por entidade (`byEntity`, id). `{ "kills": { "player": 0, "type": "cronus", "by": { "tag": "perseu" } }, "gte": 1 }` = "Perseu deu o golpe final"; `by.tag` usa o grupo **atual** da tag (autores mortos continuam contando; reusar a tag num `spawn` troca o grupo); `by.type` conta qualquer autor desse tipo do jogador (`byType`: `"jogador:tipo do autor"` → tipo da vítima → n), para o herói único que pode ser retreinado (`{ "by": { "type": "perseus" } }` na m12). `kill`/`damage` do roteiro e dispensar não têm autor e não contam; alicerce (obra incompleta) derrubado também não conta, como em `stats.razed` ("derrube o Centro Cívico" não se cumpre com o alicerce de uma expansão). O registro só soma contadores: não mexe em `state.rng`, entidades ou eventos (a simulação é a mesma; os tempos de `scripts/missions.ts` não mudam). O lint trata `by.tag` como as demais tags futuras.
- **G17 · contador de repeat.** Todo gatilho `repeat` (JSON ou TS) conta os disparos em `vars['@<id>']`, já somado quando o `then` roda (1 no 1º disparo: `{ "var": "@onda" }` dentro do `then` numera a onda). `"repeat": { "max": 3 }` para no teto; `{ "do": "setVar", "name": "@onda", "value": 0 }` rearma. Gatilho repeat continua fora de `fired`: o lint avisa `{ "fired": <gatilho repeat> }` (use `{ "var": "@id", "gte": 1 }`) e `@x` (condição, valor, `setVar`/`addVar`, HUD) sem gatilho repeat `x`. Um `hud.progress { "var": "@onda" }` dispensa `setVar`.

Trecho da missão 1 reescrita (prova de cobertura; a versão TS continua canônica até o teste de paridade passar):

```json
{ "format": "aoe-scenario", "version": 1, "id": "m1_despertar", "icon": "🏺",
  "title": { "pt": "O Despertar de Argos", "en": "The Awakening of Argos" },
  "map": { "gen": { "mapSize": "small", "seed": 1101 } },
  "config": { "players": [ { "name": "Argos", "god": "zeus", "isAI": false, "difficulty": "easy" },
                           { "name": "Saqueadores", "god": "hades", "isAI": false, "difficulty": "easy", "puppet": true } ],
              "startingResources": { "food": 400, "wood": 300, "gold": 150 }, "startKit": [true, false] },
  "setup": [ { "do": "place", "player": 1, "building": "barracks", "at": { "start": 1 }, "complete": true },
             { "do": "spawn", "player": 1, "units": ["hoplite", "hoplite", "toxotes", "toxotes"], "at": { "start": 1, "dy": 3 } } ],
  "objectives": [ { "id": "vill", "text": { "pt": "Treine 10 Cidadãos", "en": "Train 10 Villagers" }, "done": { "units": { "player": 0, "type": "villager" }, "gte": 10 } },
                  { "id": "camp", "text": { "pt": "Destrua o acampamento" }, "hidden": true, "done": { "buildings": { "player": 1 }, "eq": 0 } } ],
  "triggers": [ { "id": "raid1", "when": { "time": { "gte": 240 } }, "then": [ { "do": "raid", "player": 1, "units": ["hoplite", "hoplite", "toxotes"], "target": { "tc": 0 }, "angle": 3, "distance": 20 },
                                                                              { "do": "say", "speaker": "Batedor", "text": { "pt": "Saqueadores se aproximam pelo sul!" }, "icon": "🐎" } ] },
                { "id": "reveal_camp", "when": { "objective": "age", "is": "done" }, "then": [ { "do": "reveal", "id": "camp" }, { "do": "give", "player": 0, "resources": { "gold": 200 } } ] } ],
  "victory": { "all": [ { "objective": "vill", "is": "done" }, { "objective": "camp", "is": "done" } ] } }
```

Cobertura dos casos reais de `campaign.ts`: `vars.targetTc` (m2) = `storeEntity` + `{ entity: { var } , exists: false }` + `hud.countdown`; ritual do Portal (m3) = `place … complete:false, tag:"gate"` + `spawn … state:"pray", prayAt:{tag:"gate"}` + gatilho `repeat` com `every 1s` e `advanceBuild 0.3` + `hud.progress`; ondas por defensor da Horda = `forEachPlayer` + `raid … angle:{ base, perIndex:3 }` (a Horda em si permanece em TS).

`validateScenario(file)` rejeita: `format/version`, ids de unidade/edifício/tecnologia/deus menor inexistentes (`UNITS`, `BUILDINGS`, `TECHS`, `MINOR_GODS`), `player` fora do intervalo, objetivo referenciado sem definição, ids duplicados, `do`/operador desconhecido, profundidade > 8, JSON > 256 KB, e **ids reservados** (`horde` e os 12 ids oficiais da campanha, `m1_despertar` … `m12_titanomaquia`, de `CAMPAIGN_PLAN`; prefixo `wave`) para não interferir em `achievements.ts` e `aoe_campaign`.

---

## 3. Arquitetura

### 3.1 Como `createGame` carrega um mapa fixo (estado atual + mudanças)

Hoje: `resetNodeSeq()` → `config.map ? mapFromData(config.map) : generateMap(…)` → `size = { w: map.w, h: map.h }` (territory/visibility e colina do KotH já usam o mapa real) → `throw` se `starts.length < players.length` → kit inicial por jogador → `placeRelics` → KotH → cenário → purga de mortos → território/névoa → ordens iniciais de coleta (só se houver CC).

Mudanças (Etapa 1), na ordem do código:

1. `const startOf = (i) => map.starts[config.startOrder?.[i] ?? i]` (validação: permutação válida, senão identidade).
2. `const kit = (i) => Array.isArray(config.startKit) ? (config.startKit[i] ?? true) : (config.startKit ?? config.map?.startKit ?? true)`; sem kit não há CC, cidadãos nem batedor; em `regicide` o basileus nasce em `spiralSearch` a partir do início quando não há CC.
3. Após os jogadores e antes de `placeRelics`: aplicar `config.map.entities` na ordem do arquivo — edifício: `canPlaceBuilding(state, p, type, tx, ty, true, true).ok` → `placeBuilding(state, owner, type, tx, ty, complete ?? true)`; unidade: `nearestFreeTile(map, x, y, 6)` → `spawnUnit(state, owner, type, t.x + 0.5, t.y + 0.5)`; `owner >= players.length` é ignorado; tags vão para `state.scenario?.vars['#tag']` quando há cenário. Depois `recomputePop` de todos e `stats.buildingsBuilt/unitsTrained = 0`, `events = []`.
4. Relíquias por `config.map ? config.map.relics : config.relics` (G10; com mapa fixo valem só as dele — um cenário embutido montado como `{ ...gameConfigFor(sc), map }` não as troca nem apaga): lista → `placeRelicsAt` (posições fixas, sem `state.rng`; tile bloqueado ou fora da região dos inícios procura terra alcançável até `RELIC_SNAP_RADIUS` = 6 tiles, senão a relíquia é descartada — só acontece em mapa gerado, pois o fixo é validado); `false` → nenhuma; senão `placeRelics` sorteia. KotH usa `config.map?.koth ?? centro`. `config.relics` vem de `map.relics` de um cenário em mapa gerado; `mapHash` inclui as posições (mapas sem lista mantêm o hash); redimensionar desloca as posições e corta as que saem (`ResizeReport.relics`).
5. Purga de mortos do `setup` passa a usar `removeBuildingNow`/`removeUnitNow` (hoje não zera `gateTeam` nem chama `invalidateComponents` — bug latente).
6. Ordens iniciais de coleta continuam condicionadas a existir CC.

### 3.2 Arquivos novos e alterados

| Arquivo | Mudança |
|---|---|
| `src/core/map/fixed.ts` | Campos novos em `FixedMapData`; `saveMap(state, meta)`, `canonicalize`, `mapHash`, `validateMap`, `blankMap`, `MAP_LIMITS`, `migrateMap`; `mapFromData` valida limites e deriva DEEP. Continua sob `tests/determinism.test.ts` |
| `src/core/map/mapgen.ts` | Exportar `NODE_AMOUNT`, `ensureConnectivity`, `widenChokepoints`, `carveCorridor`; extrair `deriveDeepWater(map, rect?)` (passo 1) e `placeStartResources(map, rng, start)` (passo 4) sem alterar o resultado de `generateMap` (teste de regressão: `serialize(quickGame())` idêntico antes/depois) |
| `src/core/types.ts` | `GameConfig.mapHash?`, `startOrder?`, `startKit?`, `scenarioData?` |
| `src/core/sim/entities.ts` | `removeBuildingNow(state, b)` (limpa `buildingAt`/`blocked`/`gateTeam`, `delete`, `invalidateComponents`, `territoryDirty`, `recomputePop`; sem escombros/eventos/reembolso) e `removeUnitNow(state, u)` (ejeta guarnição, `delete`, `recomputePop`) |
| `src/core/sim/game.ts` | Itens 1–6 acima |
| `src/core/net/hash.ts` | `stateHash` mistura o terreno inteiro (`Uint8Array`, ~20 k ops a cada 100 ticks; ~0,1 ms) e, por nó, `id` e `floor(amount)`: mapa divergente ou coleta divergente aparece no **primeiro** hash trocado (tick 100) |
| `src/core/serialize.ts` | Sem mudança de formato; `deserialize` já tolera os campos novos de `config` |
| `src/core/data/maps/index.ts` + `*.map.json` | `BUILTIN_MAPS: Record<string, FixedMapData>` (import estático; `resolveJsonModule` já ligado); 2 mapas oficiais na Etapa 4 |
| `src/game/maps.ts` (novo) | Biblioteca local: índice `aoe_maps_v1` = `{ id, name, w, h, starts, hash, updatedAt }[]` + item `aoe_map_<id>`; `listMaps/getMap/putMap/removeMap/duplicateMap`; `exportMap` (`exportText('<id>.map.json')`) / `importMap` (`importText` + `migrateMap` + `validateMap`); `allMaps()` = embutidos + locais; trata `QuotaExceededError` com toast sugerindo exportar |
| `src/game/session.ts` | `UIMode` ganha `'editor'`; `UIState.editor?: EditorUI` (ferramenta, pincel, jogador ativo, overlays) |
| `src/editor/ops.ts` (novo, puro, sem DOM) | `EditOp = paint{tiles, terrain} \| addNode \| removeNode \| setNodeAmount \| setStart \| removeStart \| placeEntity \| removeEntity \| setEntity \| batch{ops}`; `applyEditOp(state, op): EditOp` devolve a **inversa exata**; pintar água/montanha remove nós sob o pincel (`removeNode`), empurra unidades (`pushUnitsOutOfTile`) e **recusa** sob edifício; após pintar: `deriveDeepWater` no retângulo ±1, `rebuildBlocked`, `invalidateComponents`, `territoryDirty`. Geometria: `brushTiles(cx, cy, r, shape, w, h)` (círculo por `dx²+dy² ≤ r²`), `lineTiles` (movido de `input.ts` e exportado), `floodRegion` |
| `src/editor/editor.ts` (novo, sem DOM) | `MapEditor`: cria a sessão (`createGame({ seed, mapSize: 'medium', map: { ...file, startKit: false, relics: false }, players: placeholders humanos (1 por início, máx. 4), revealMap: true })`, `session.paused = true`, `ui.mode = 'editor'`); pilhas undo/redo (um traço = um `batch`); retângulo sujo por quadro → `renderer.invalidateRect` + `minimap.invalidate`; `toFile()` (`saveMap` canônico), `validate()` (cache até a próxima op), `dirty`, autosave `aoe_editor_autosave` (debounce 5 s e antes de Testar); ações de correção (`ensureConnectivity`, `widenChokepoints`, `placeStartResources` com semente) como `batch` desfazível; `pointerDown/Move/Up(tile, button, mods)`, `key(e)` |
| `src/editor/panel.ts` (novo, DOM) | Painel `#editor` montado em `#bottom` (no lugar de `#selection`/`#commands`) e `#editor-top` em `#top`: abas de ferramentas, subpaleta, pincel, jogador ativo, inspetor, lista de validação, botões; usa `hud.showModal/toast`; strings `t('editor.*')` |
| `src/ui/input.ts` | `setEditor(ed: MapEditor \| null)`; desvio **no início** de `onDown/onMove/onUp/onMinimap` (logo após `modalOpen`/`overHud`, antes de `place/attackMove/contextCommand`) e em `onKey` logo após o teste de `INPUT/TEXTAREA/SELECT` (antes de `Enter`, `Esc`, F1/F2/F11, `P`, `+/-`, `H`, `Delete`, 1–9) quando `s.ui.mode === 'editor'`; câmera (WASD, borda, roda, botão do meio) continua na `Input`; `renderUI()` acrescenta `editor` |
| `src/render/renderer.ts` | `invalidateRect(x0, y0, x1, y1)` destrói só os chunks tocados e atualiza `chunkNodeCount`; `chunkCacheLimit` (60 → `ceil(w/CHUNK)*ceil(h/CHUNK)` no editor); `cam.minZoom` calculado para enquadrar o mapa (`min(width/(w*TILE), height/(h*TILE))`); `setState` tolera `starts` vazio (centra no meio); overlays de `RenderUI.editor`: contorno do pincel, fantasma de edifício (verde/vermelho), marcadores numerados dos inícios com anel de raio 8, fantasma do kit inicial (CC 3×3 + 6 pontos de `spots`), grade, overlay de regiões (componentes coloridos, textura w×h como a névoa); `TERRAIN_PALETTE` centralizada (hoje `TCOL` em `renderer.ts` e `TERRAIN_COLORS` em `minimap.ts` duplicam as cores) |
| `src/render/minimap.ts` | `invalidate()` força `buildBase`; marcadores de inícios; no modo editor o botão direito não chama `contextCommand` (o desvio em `onMinimap` já cobre) |
| `src/ui/hud.ts` | `setEditorMode(on)` alterna a classe `editor` em `#hud` (CSS esconde `.res`, `.age`, botão de idade, `#gods`, `#objectives`, `#idle`, `#selection`, `#commands`; mantém `#minimap-wrap`, `#messages`, `#tooltip`, `#modal-back`); Esc no editor abre o menu do editor; textos de mapa/cenário passam por `esc()` antes de `innerHTML`; Etapa 5: `refreshObjectives` usa `def.hud` genérico no lugar dos `if` por `m2_cerco`/`m3_portal` |
| `src/ui/menu.ts` | (a) Partida rápida: `#m-fixed-sel` "Mapa: Aleatório \| embutidos \| Meus mapas \| Importar arquivo…" mantendo `#m-fixed`, `#m-fixed-load`, `#m-fixed-clear` (o playtest existente os usa); mapa fixo desabilita `#m-map` e `#m-maptype`, limita `#m-ais` a `starts.length − 1`, valida modo (`validateMap(..., { mode })`), grava a escolha em `aoe_setup.fixedMapId` (a chave `map` já significa `mapSize`); `onStart` envia `map`, `mapHash`, `startOrder` (por time quando `startTeams` existe e `teams !== 'ffa'`). (b) Lobby: mesmo seletor para o anfitrião; `net.settings({ map: meta })`; todos veem "Mapa: nome (w×h, N inícios, #hash)"; `#mp-start` envia `map` inline + `mapHash` + `startOrder` (por `startTeams`/times do lobby); Horda aceita mapa fixo se `starts.length ≥ humanos + 1`. (c) Aba **Editor** (`data-tab="editor"`): Novo mapa, Continuar rascunho, Meus mapas (Editar/Duplicar/Exportar/Excluir), Importar; `MenuCallbacks.onEditor(file)`. Nomes vindos de arquivo/rede com `esc()` |
| `src/main.ts` | `startEditor(file)`, `exitEditor()`, `testFromEditor(opts)` (valida → autosave → `startGame({ seed, mapSize, map, mapHash, players, mode, revealMap })` com `returnToEditor = file`; `onQuit` e fim de partida voltam ao editor); laço pula `achievements.update`, `saveReplay` e o `F5` de save quando `ui.mode === 'editor'` ou `returnToEditor`; `startNetworkGame` roda `migrateMap` + `validateMap` antes de `Session.newGame` (erro → `netStatus` na sala, sem criar sessão); `window.aoe.startEditor/editor` para o Playwright |
| `src/net/client.ts` | `LobbyState.settings.map?: { id, name, w, h, starts, hash }` |
| `server/relay.mjs` | `new WebSocketServer({ port, maxPayload: 2 * 1024 * 1024 })`; em `case 'start'`, recusa (`error`) se `JSON.stringify(msg.config).length > 1_000_000`; `settings.map` limitado a metadados (descarta `terrain`/`decor` se vierem) |
| `src/ui/styles.css` | `#hud.editor …{display:none}`, `#editor`, `#editor-top`, `.tool.active`, `body.cur-brush`, `body.cur-erase`, `#editor .issues li` |
| `src/i18n/strings.ts` | Chaves `main.editor`, `main.fixedMapSel*`, `mp.mapInfo`, `editor.*`, `map.issue.*` em PT e EN (`tests/i18n.test.ts` garante paridade) |
| `scripts/headless.ts`, `scripts/mapcheck.ts` (novo), `scripts/export-map.ts` (novo), `scripts/playtest-editor.mjs` (novo), `scripts/playtest-fixedmap.mjs`, `scripts/playtest-mp.mjs` | `--map caminho` no smoke/balance; `mapcheck` valida embutidos e arquivos passados e roda 2 min de IA×IA em cada; `export-map` gera um `.map.json` de semente/tamanho/tipo (semeia embutidos e fixtures); playtests do editor e do multiplayer com mapa fixo |
| Etapa 5: `src/core/scenario/schema.ts`, `text.ts`, `compile.ts`, `missions/m1_despertar.scenario.json`; `runner.ts` (`getScenarioFor(state)`: `config.scenarioData` compilado com cache por hash+locale, senão registro embutido); `helpers.ts` (`placeExact`, `nearCount`, `prayAt`, `removeAllOf`, `advanceBuild`) | Ver §2.3 |
| `docs/EDITOR.md` (este), `docs/ROADMAP.md`, `docs/DESIGN.md`, `docs/QA.md`, `CLAUDE.md` | Marcar 3.3/3.2, acrescentar comandos e playtests à matriz de QA e ao CLAUDE.md |

### 3.3 Como o lobby transmite

1. Anfitrião escolhe o mapa (embutido, biblioteca ou importado) → `menu.fixedMap = data` em memória → `net.settings({ map: { id, name, w, h, starts: starts.length, hash: mapHash(data) } })`. Todos veem os metadados; `#mp-ais` limitado a `starts − humanos`; `#mp-maptype` desabilitado.
2. `#mp-start` → `net.start({ …, map: data, mapHash, startOrder }, delay)` → relay guarda `room.config` e faz `broadcast({ t: 'start', config })` (sem inspecionar, além do limite de tamanho).
3. Cada cliente em `startNetworkGame`: `migrateMap` → `validateMap(config.map, { players: config.players.length, mode })` → erro ⇒ `netStatus = t('map.issue.…')`, permanece no lobby; ok ⇒ `Session.newGame(config, local)`. `stateHash` com terreno+nós garante que qualquer divergência restante aparece no tick 100 pelo relatório de desync já existente.
4. Reconexão: `joined … config: r.config` já leva o mapa; o instantâneo (`serialize(state)`) leva `state.map`. Nada muda.

### 3.4 Como saves e replays incluem o mapa

- Save: `config.map` dentro de `config` (já hoje) + `state.map` completo. Tela de carregar mostra `config.map.name` e `#hash` quando existir.
- Replay: `config.map` inline; `Session.replay` → `createGame(config)` reconstrói o mesmo mapa (ids de nó canônicos). Replays gravados a partir de save usam `base` (inalterado).
- Diagnóstico (`aoe_desync_v1`): já guarda `config` + `state`; passa a ter o mapa por consequência.

### 3.5 Campanha

`ScenarioDef.config` é `Omit<GameConfig, 'seed' | 'scenario'> & { seed }` e já aceita `map`, `startKit`, `startOrder`. Uma missão da Fase 3.4 declara `config: { seed, mapSize: 'small', map: BUILTIN_MAPS['tartaro-portal'], startKit: [true, false], players }` e mantém `setup`/objetivos/gatilhos em TS (helpers `placeNear`/`spawnGroup`/`raid` dependem só de `starts` e regiões). `startMission` já espalha `def.config`: nada muda em `main.ts`. Flag `?dev=1`: "Abrir missão no editor" congela o mapa gerado de uma missão existente (`mapToData(state.map)`) e o exporta para virar embutido.

---

## 4. Fluxo do editor

### 4.1 Entrar

Menu principal → aba **Editor** (`data-tab="editor"`):

- **Novo mapa**: nome; tamanho (Pequeno 80 / Médio 112 / Grande 144 ou largura×altura livres 48–160); nº de inícios (2–4); base: "Grama vazia" (`blankMap`) ou "Gerado por semente" (semente + tipo de mapa → `generateMap`, que já entrega inícios, raio 8 limpo, recursos e conectividade — o caminho mais rápido para um mapa bom, só retocar).
- **Continuar rascunho** (`aoe_editor_autosave`), se existir.
- **Meus mapas**: lista de `aoe_maps_v1` + embutidos, com Editar / Duplicar / Exportar / Excluir (embutidos só Editar-como-cópia).
- **Importar arquivo…** (`.map.json`): `migrateMap` + `validateMap`; erros mostram o motivo, avisos abrem mesmo assim.

Abrir chama `main.startEditor(file)`: `MapEditor` cria a sessão pausada com névoa revelada, `renderer.setState`, `hud.setSession` + `setEditorMode(true)`, `input.setEditor(ed)`, `menu.hide()`; câmera enquadra o mapa inteiro (`minZoom` recalculado). O relógio não anda (`Session.step` retorna cedo com `paused`).

### 4.2 Layout

- **Topo** (`#editor-top`, dentro de `#top`): nome do mapa (clique renomeia) + "•" quando há alterações; contadores de desfazer/refazer; status de validação (✔ ou ⚠ N); botões **Validar**, **▶ Testar**, **💾 Salvar**, **Exportar**, **Propriedades**, **Gatilhos** (Etapa 5), **Sair**.
- **Rodapé** (`#bottom`): minimapa (inícios numerados; clique centra) · painel `#editor` com abas de ferramentas e subpaleta · inspetor + lista de validação.
- Canvas: mesma câmera (rolagem na borda, WASD, roda, botão do meio).

### 4.3 Ferramentas e atalhos (finais, Etapa 4)

Como na partida, **`A`, `R` e `U` ficam de fora** também no editor (atacar-mover, ponto de encontro e liberar) e `W`/`S`/`D` continuam movendo a câmera: a ferramenta Unidades usa `M` e o overlay de regiões usa `L`. `tests/data.test.ts` confere que os atalhos do editor (`TOOL_KEYS`, `EDITOR_KEYS`, `TERRAIN_KEYS` em `src/editor/editor.ts`) são únicos e não usam essas letras; a tela de atalhos (`H`) lista os mesmos.

| Tecla | Ferramenta / ação |
|---|---|
| `T` | **Terreno**: subpaleta `1` grama · `2` areia · `3` terra · `4` água · `5` montanha · `6` água profunda forçada (a profunda é derivada: interior de água cercada de água); pincel círculo/quadrado, raio 1–8 (`[` `]`, `X` alterna a forma); arrastar pinta contínuo; `Shift+clique` traça linha desde o último ponto (`lineTiles`). Pintar água/montanha remove nós sob o pincel e empurra unidades; sob edifício é recusado com aviso |
| `F` · botão 🪣 | **Balde**: `F` preenche a região contígua do mesmo terreno sob o cursor (água e água profunda contam como o mesmo); com o botão 🪣 ligado, o clique preenche (`Shift+clique` continua traçando linha). Um preenchimento = um passo de desfazer |
| `N` | **Recursos**: árvore, frutas, cervo, javali, ouro, pedra de Poseidon (`lure`); quantidade padrão de `NODE_AMOUNT`, editável no inspetor; pincel de árvores com densidade (determinística por posição) |
| `B` | **Edifícios**: paleta por categoria a partir de `BUILDINGS` (inclui `titan_gate` e a cornucópia `notBuildable`); dono = jogador ativo; `C` alterna Completo/Em obra; fantasma verde/vermelho via `canPlaceBuilding(state, p, type, tx, ty, true, true)` (ignora idade, limite e território; exige terreno e tiles livres); muralha por arraste como no jogo |
| `M` | **Unidades**: paleta por classe (`UnitClass`); dono = jogador ativo; clique em tile passável |
| `I` | **Inícios**: clique coloca/move o próximo início; `Tab` cicla; número + anel de raio 8 sempre visíveis |
| `V` | **Selecionar/inspecionar**: clique em entidade ou tile (terreno, nó com quantidade, dono, completo, tag); arrastar move entidade; `Delete` apaga |
| `E` / botão direito | **Borracha**: unidade > edifício > nó > início sob o cursor (com qualquer ferramenta, o botão direito apaga) |
| `P` · `Alt+clique` · botão 💧 | **Conta-gotas** (um clique): copia terreno, recurso (tipo e quantidade), edifício (tipo, dono, completo) ou unidade (tipo, dono) para a ferramenta correspondente, sem editar o mapa; o botão direito ou trocar de ferramenta desarma |
| `Shift+1…4` | Jogador ativo (cor do slot) |
| `G` / `L` / `O` / `K` | Grade · regiões conexas (ilhas e bolsões saltam à vista) · tiles bloqueados · fantasma do kit inicial (CC 3×3 e os pontos dos cidadãos/batedor) com o anel de recursos de raio 16. A colina do Rei da Colina aparece sempre (dourada quando o arquivo a define; apagada no centro) |
| `Ctrl+Z` / `Ctrl+Y` (`Ctrl+Shift+Z`) | Desfazer / refazer (um traço de pincel, um balde, uma correção ou um redimensionamento = um passo) |
| `Ctrl+S` · `Ctrl+Enter` · `Esc` · `H` | Salvar · Testar · menu do editor (Salvar / Exportar / Testar / Propriedades / Gatilhos / Voltar ao menu, com confirmação se houver alterações) · atalhos na tela |
| `W A S D` · setas · borda · roda · botão do meio | Câmera (como na partida); `F1` ajuda · `F2` enciclopédia · `F11` tela cheia · `Ctrl+M` mudo |

Todo gesto vira `EditOp` aplicado à sessão pausada; o editor acumula o retângulo sujo e, uma vez por quadro, chama `renderer.invalidateRect` e `minimap.invalidate` — a pintura aparece no mesmo quadro sem regenerar o mapa.

### 4.4 Propriedades e validação

**Propriedades** (modal `hud.showModal`): id (só leitura), nome PT/EN, autor, descrição, kit inicial, times sugeridos por início (`startTeams`, ex.: `1,1,2,2`), colina do KotH (🎯 escolher no mapa / voltar ao centro), relíquias sim/não (desmarcar é um passo de `Ctrl+Z`, que devolve as posições fixas) e 🏺 Pôr relíquia no mapa (acrescenta uma posição fixa; a borracha tira a relíquia de um tile sem mais nada; as fixas aparecem como sobreposição, com anel vermelho sobre tile bloqueado), "Variar visual" (nova semente de `decor`) e **Tamanho do mapa**: largura × altura (48–160, ≤ 25 600 tiles) + âncora (9 posições); a prévia diz o que será cortado (recursos, edifícios/unidades), quais inícios serão trazidos para a margem de 8 tiles e se a colina volta ao centro; confirmar abre uma **instância nova** (`MapEditor.resized` → `resizeMapData`), e `Ctrl+Z` no começo da pilha dela volta à anterior com a pilha intacta (`Ctrl+Y` refaz).

**Validar** roda `validateMap` (também automaticamente 300 ms após a última edição): erros em vermelho (bloqueiam Testar, Exportar e Salvar como embutido), avisos em amarelo. Cada item com posição tem **Ir até** (centra a câmera e pisca o tile) e, quando cabe, **Corrigir** — sempre um único passo de `Ctrl+Z`:

| Código | Correção |
|---|---|
| `startsDisconnected` | Ligar inícios (`ensureConnectivity`: corredores de areia/terra) |
| `chokepoint` | Alargar gargalos: nós ao redor de todos os pontos de articulação (`widenChokepoints` do gerador) e, a ≤ 10 tiles de um início, também o terreno em volta (água → areia, montanha → terra), repetindo até sumir o gargalo; nunca sob edifício nem no 3×3 do CC |
| `lowStartFood` / `lowStartWood` | Recursos do início N (`placeStartResources` com semente sorteada) |
| `startBlocked` | Limpar raio 8 (grama, sem nós) |
| `startOut` (erro) | Trazer para dentro (início na margem de 8 tiles) |
| `pocket` | Fechar bolsão (pinta a região pequena com o sólido que mais a cerca: água ou montanha) |
| `nodeNoAccess` | Remover recurso |
| `kothUnreachable` | Ligar a colina (corredor até a colina, como o gerador faz no Rei da Colina) |
| `wonderComplete` | Marcar em obra |
| `noBase` / `aiNoTc` | Centro Cívico no início N |
| `relicOut` / `relicBlocked` / `relicUnreachable` | Mover relíquia para a terra livre alcançável mais próxima (a busca de `placeRelicsAt`, até 6 tiles, fora do CC do kit e de outra relíquia; fora do mapa começa da borda) ou, sem tile que sirva, Remover relíquia |
| `relicDup` | Remover relíquia (a repetida) |
| `relicsFormat` / `relicsCount` | Limpar lista de relíquias (tira os itens malformados e os acima de 32) |

Sem correção automática (só Ir até, quando há posição): `startOverlap`, `entityOverlap`, `mainComponentSmall` e os erros estruturais (tamanho, base64, tipos desconhecidos — o editor nem os cria). Abaixo da lista, a **tabela de recursos por início** (comida/madeira/ouro a ≤ 16 tiles, `startResourceTable`; em vermelho o que estiver abaixo de 80 % do maior) mostra o equilíbrio à vista.

### 4.5 Salvar, carregar, exportar

- **Salvar** (`Ctrl+S`): `putMap(toFile())` em `aoe_maps_v1` + `aoe_map_<id>`; toast de sucesso ou de cota cheia (sugere exportar).
- **Exportar**: `exportText('<id>.map.json', JSON.stringify(canonicalize(file)))` — diálogo nativo no Electron (`file:save`), download no navegador.
- **Abrir**: modal com a biblioteca (mesmos cartões da aba Editor). **Importar** também existe na Partida rápida e no lobby, para quem só quer jogar um arquivo recebido.
- Autosave em `aoe_editor_autosave` (debounce 5 s, e sempre antes de Testar).

### 4.6 Testar

`▶ Testar` / `Ctrl+Enter` abre um modal leve: jogar como início 1..N; para cada outro início: IA (dificuldade) / vazio; deus do criador; modo (`conquest`/`deathmatch`/`regicide`/`koth`); revelar mapa; "Lembrar". Iniciar: `toFile()` → `validateMap` (erros impedem; avisos pedem confirmação) → autosave → `startGame({ seed: sorteada, mapSize, map, mapHash, players, mode, revealMap })` com `returnToEditor = file`. É uma **partida nova de verdade** — o mesmo `createGame` que o multiplayer usará —, com selo "Modo de teste · Voltar ao editor" no topo; conquistas e replay automático desligados. Sair pelo menu ou terminar a partida volta ao editor com documento, câmera e pilha de desfazer intactos (`startEditor(file)` restaura do objeto em memória).

### 4.7 Jogar

- **Partida rápida**: seletor "Mapa: Aleatório | Estreito (1v1) | Egeu (2v2) | Meus mapas… | Importar arquivo…". Mapa fixo desabilita tamanho e tipo, limita oponentes a `starts − 1`, mostra `w×h · N inícios · #hash`; a semente continua sorteada (IA, relíquias, rng); `mode` validado (`regicide` exige CC por jogador; `koth` usa `koth` do arquivo ou o centro). Times: se o mapa tem `startTeams` e o jogador escolhe coop/aliança, `startOrder` coloca aliados em inícios do mesmo time.
- **Multiplayer**: §3.3. O anfitrião pode escolher "Atribuição de inícios: pelo arquivo | por time | sorteada pela semente"; o resultado vai em `startOrder` (o arquivo e o hash não mudam).
- **Campanha**: §3.5; na Etapa 5, "Cenários personalizados" lista mapas da biblioteca com `scenario` e permite importar e jogar (`startScenarioFile`), sem marcar progresso da campanha nem conquistas de missão para ids não oficiais.

---

## 5. Plano de implementação

Estimativas de horas do agente; cada etapa é um ou mais commits em português com o rodapé de atribuição. Ordem pensada para o dono jogar mapas fixos (Etapas 0–2) antes de o editor existir.

### Etapa 0 — Commitar o que já está na árvore (1 h)

- **Arquivos**: `src/ui/menu.ts`, `src/ui/hud.ts`, `src/main.ts`, `src/i18n/strings.ts` (diff atual), `scripts/playtest-fixedmap.mjs`.
- **Ajustes antes do commit**: `esc()` no nome do mapa em `#m-fixed`; `aoe_setup` não ganha chave nova ainda; `#m-maptype` desabilitado quando `fixedMap` existe.
- **Testes**: `npm test`, `npm run typecheck`, `npm run preview` + `node scripts/playtest-fixedmap.mjs` (todas as linhas "ok", `errors: none`).
- **Pronto quando**: commit "Mapas fixos: carregar arquivo na Partida rápida e exportar o mapa da partida" no HEAD; `docs/QA.md` lista o playtest.

### Etapa 1 — Núcleo do mapa fixo (3.3‑a) (8 h)

- **Arquivos**: `src/core/map/fixed.ts` (campos novos, `saveMap`, `canonicalize`, `mapHash`, `validateMap`, `blankMap`, `MAP_LIMITS`, `migrateMap`, DEEP derivado), `src/core/map/mapgen.ts` (exports + extrações), `src/core/types.ts`, `src/core/sim/entities.ts` (`removeBuildingNow`/`removeUnitNow`), `src/core/sim/game.ts` (§3.1), `src/core/net/hash.ts`, `scripts/export-map.ts`, `scripts/mapcheck.ts`, `scripts/headless.ts` (`--map`).
- **Testes** (`tests/fixedmap.test.ts` ampliado, `tests/lockstep.test.ts`, `tests/determinism.test.ts`, `tests/sim.test.ts`):
  - `saveMap(loadMap(f))` deep‑equal a `canonicalize(f)` (nós fora de ordem entram ordenados; entidades reordenadas); `mapFromData` duas vezes → mesmas chaves de `map.nodes` na mesma ordem; `mapHash` estável e muda ao trocar 1 tile, 1 nó ou 1 início, mas não ao renomear.
  - `validateMap`: cada código de erro e de aviso tem um caso (terreno curto, início em água, nó em montanha, nó duplicado, tipo inexistente, dono ≥ inícios, edifício sobre nó, inícios em regiões diferentes, maravilha completa, regicídio sem CC); um mapa de `export-map` passa sem erros.
  - `createGame({ map })`: `startKit:false` → nenhum CC; `startKit:[true,false]` → só o jogador 0 tem kit; entidades: edifício completo com `buildingAt` preenchido e `popCap` contando, portão completo com `gateTeam`, unidade com pop, dono inválido ignorado; `stats.buildingsBuilt === 0` e `events` vazio após o setup; `startOrder` troca os inícios; `relics:false` → `state.relics` vazio; `koth` do arquivo respeitado; `regicide` sem kit não lança.
  - Determinismo: duas partidas com o mesmo `config.map` e IA ativa → `serialize` idêntico após 1500 ticks (padrão de `tests/determinism.test.ts`); a regex continua varrendo `fixed.ts` e `mapgen.ts`; regressão `serialize(quickGame())` idêntico antes/depois das extrações.
  - Lockstep: dois `NetworkScheduler` em memória com `config.map` → hashes iguais por 400 ticks; **negativo**: um tile diferente num par → `onDesync` no tick 100.
  - `npx tsx scripts/missions.ts`, `scripts/horde.ts`, `npm run smoke 5 42 -- --map <arquivo>` (o `--` é necessário: o npm engole `--map`; ou `npx tsx scripts/headless.ts 5 42 --map <arquivo>`).
- **Pronto quando**: tudo verde; `scripts/mapcheck.ts` valida um mapa gerado e roda 2 min de IA sem erro.

### Etapa 2 — Jogar mapas fixos em todo lugar (3.3‑b) (8 h)

- **Arquivos**: `src/game/maps.ts`, `src/core/data/maps/index.ts` (+1 mapa gerado por `export-map` como placeholder), `src/ui/menu.ts` (seletor `#m-fixed-sel`, `aoe_setup.fixedMapId`, limites, `startOrder`, lobby com `settings.map` e `#mp-start` com mapa inline, Horda em mapa fixo, `esc()`), `src/net/client.ts`, `server/relay.mjs` (`maxPayload`, limite do `start`, filtro de `settings.map`), `src/main.ts` (validação em `startNetworkGame`, tela de carregar com nome/hash), `src/i18n/strings.ts`, `tests/scenarios.test.ts` (missão existente criada com `config.map = blankMap(80, 80, 2, 1)` + `startKit:[true,false]` roda o `setup` e `raid()` respeita regiões), `tests/i18n.test.ts`, `tests/data.test.ts` (todos os `BUILTIN_MAPS` passam em `validateMap`; tipos das entidades existem).
- **Playtests**: `playtest-fixedmap.mjs` estendido (seletor, biblioteca, save/load e replay no mapa fixo); `playtest-mp.mjs` com `--map` (anfitrião injeta `window.aoe.menu.fixedMap`, dois navegadores iniciam, hashes iguais no tick 300, sem toast de desync); caso negativo: config com tipo inexistente injetado no convidado → permanece no lobby com mensagem.
- **Pronto quando**: do menu, jogar skirmish num arquivo importado; sala com 2 navegadores no mapa fixo; replay e save/load funcionam; ROADMAP 3.3 marcado ✅; CLAUDE.md "Estado atual" atualizado.

### Etapa 3 — Editor MVP (3.2‑a) (18 h)

- **Arquivos**: `src/game/session.ts` (`'editor'`, `UIState.editor`), `src/editor/ops.ts`, `src/editor/editor.ts`, `src/editor/panel.ts`, `src/ui/input.ts` (desvio + `lineTiles` exportado), `src/render/renderer.ts` (`invalidateRect`, cache, `minZoom`, overlays, `starts` vazio, `TERRAIN_PALETTE`), `src/render/minimap.ts` (`invalidate`), `src/ui/hud.ts` (`setEditorMode`), `src/ui/styles.css`, `src/ui/menu.ts` (aba Editor), `src/main.ts` (`startEditor/exitEditor/testFromEditor`, laço, `window.aoe.editor`), `src/i18n/strings.ts`.
- **Testes**: `tests/editor.test.ts` (sem DOM): para cada `EditOp` (incluindo pintar água sob nó e sob unidade, `setStart`, `placeEntity`/`removeEntity`, `batch`), aplicar e depois aplicar a inversa devolve `serialize(state)` idêntico; pintar água sob nó remove o nó e `blocked` fica 1; pintar sob edifício é recusado; pintar grama num lago converte DEEP→WATER nas bordas; `placeEntity` recusa sobre nó e aceita sem território/idade; `toFile()` canônico independentemente da ordem de edição; `MapEditor` sobre `blankMap` e sobre mapa gerado; `validate()` reflete o estado após ops; `brushTiles`/`lineTiles` sem trigonometria e dentro dos limites.
- **Playtest** `scripts/playtest-editor.mjs`: abre o editor por `window.aoe.startEditor`, pinta um lago e um bosque, coloca torre e hoplita, move o início 2, `Ctrl+Z`/`Ctrl+Y`, salva, Testar → `session.state.map.w` esperado, torre presente, `config.map.startKit` correto → sair → editor de volta com o mesmo mapa e pilha de undo; exporta; `errors: none`.
- **Pronto quando**: criar mapa (vazio ou gerado), pintar, colocar recursos/edifícios/unidades por jogador, mover inícios, desfazer, salvar/exportar, testar contra IA e voltar; o mapa salvo aparece nos seletores de skirmish e lobby.

### Etapa 4 — Validação, correções, mapas oficiais, documentação (8 h) ✅

- **Arquivos**: `src/editor/*` (lista de avisos completa com Ir até/Corrigir, tabela de recursos por início, overlays de regiões/passabilidade/kit, balde, conta-gotas, propriedades com `startTeams`/`koth`/`relics`/redimensionar), `src/core/data/maps/estreito.map.json` (1v1, 80×80) e `egeu.map.json` (2v2, 113×113, `startTeams`) desenhados no editor, `scripts/mapcheck.ts` (roda também em `tests/data.test.ts`), `docs/EDITOR.md` (atalhos finais), `docs/ROADMAP.md` (3.2 parcial: "gatilhos em JSON" → Etapa 5), `docs/DESIGN.md`, `docs/QA.md`, `CLAUDE.md`.
- **Testes**: `npm run balance 35 1,2,3 --map src/core/data/maps/egeu.map.json` com idades nas faixas do projeto (Clássica ~5, Heroica ~15–20, Mítica ~20–28) e nenhuma IA parada aos 5 min; `mapcheck` verde para os embutidos; playtest do editor cobre "Corrigir" (aviso de gargalo some após alargar).
- **Pronto quando**: 2 mapas oficiais jogáveis em skirmish/multiplayer, validação confiável, docs e roteiro atualizados. **Fim do MVP (≈ 43 h).**
- **Feito (25/09/2026)**: lista de avisos com Ir até/Corrigir para todos os códigos que têm correção (tabela do §4.4), tabela de recursos por início, overlays de regiões/passabilidade/kit (+ anel de recursos e colina), balde por botão e por `F`, conta-gotas por `P`/botão/`Alt+clique`, Propriedades com `startTeams`/colina/relíquias/redimensionar (desfazível), atalhos finais sem `A`/`R`/`U` (§4.3). `src/core/map/check.ts` (`checkMap`) é o mesmo que `npm run map:check` imprime e que `tests/data.test.ts` exige dos embutidos (sem erros, 2 min de IA sem IA parada). Os dois mapas oficiais são **desenhados por script** com as ops do editor (`scripts/maps/estreito.ts`, `scripts/maps/egeu.ts`, ajudantes em `scripts/maps/lib.ts`) e o teste confere que o script gera exatamente o arquivo embutido. Números no §5b.

### Etapa 5 — Cenário declarativo em JSON (3.2‑b) (16 h)

- **Arquivos**: `src/core/scenario/schema.ts`, `text.ts`, `compile.ts`, `missions/m1_despertar.scenario.json`, `runner.ts` (`getScenarioFor`, `vars` iniciais), `helpers.ts` (novos helpers), `src/core/types.ts` (`scenarioData`), `src/ui/hud.ts` (`def.hud` genérico; `tx()`), `src/main.ts`/`menu.ts` (`startScenarioFile`, "Cenários personalizados", `scenarioData` no `#mp-start`), `src/editor/*` (modal **Gatilhos**: textarea JSON com `validateScenario` ao vivo, erros com caminho do campo, "Inserir modelo": diálogo, invasão, objetivo de contagem, cronômetro, onda periódica; "pegar ponto" clica no mapa), `scripts/missions.ts`/`horde.ts` (validam schema dos JSON), `scripts/gen-horde.ts` **não** (Horda fica em TS).
- **Testes** `tests/scenario-json.test.ts`: semântica de cada operador (`time`/`every` com segundos inteiros, `firedCount`, `units.near` sem trig, `units.reachable` via `rectReachable`, `value.add`, `entity{tag}`/`storeEntity`, `advanceBuild` concluindo com `onBuildingComplete`, `forEachPlayer` + `perIndex`, `removeAll` limpando `gateTeam`); **paridade** m1: versão JSON e versão TS por 14 min sem jogador → mesmos `fired`, `objectives`, `outcome` e contagens por jogador; `validateScenario` rejeita os casos de §2.3 e ids reservados; determinismo com `scenarioData` (regex cobre `schema/compile/text`); `tests/scenarios.test.ts` existente intocado; `tests/i18n.test.ts` (`tx()` cai para PT).
- **Playtest**: editor com cenário embutido → Testar mostra intro e objetivos; importar `.map.json` com `scenario` na Campanha → jogável; multiplayer com `scenarioData` no `start`.
- **Pronto quando**: cenário completo editável em JSON, jogável em skirmish/multiplayer/replay sem código; ROADMAP 3.2 ✅. Decisão de migrar m2/m3/Horda fica para o dono (§7).

---

## 5b. Decisões tomadas na implementação (Etapas 0–5 concluídas)

- `validateMap`: `nodeNoAccess` só para nós que não são árvores (árvore no meio do bosque é normal); `pocket` só quando a região pequena faz fronteira com terreno sólido ou edifício (clareiras fechadas por nós abrem ao coletar); `chokepoint` emite um aviso por início (o ponto de articulação mais próximo a ≤ 10 tiles); `entityOverlap` de unidade só checa mapa/água/montanha (createGame usa o tile aberto mais próximo); `aiNoTc` exige `opts.ai`; máximo de 25 itens por código; com kit inicial o 3×3 do CC conta como bloqueado na análise de regiões e como ocupado para entidades (`entityOverlap`) e para outros inícios (`startOverlap`). Códigos além do §2.1: `badNodeAmount`, `kothOut`, `startOverlap` (erros) e `noBase` (aviso: jogador sem kit, sem edifício e sem cidadão só sobrevive enquanto tiver unidades — a regra de derrota respeita isso via `hasStartKit`).
- Tipos de nó/edifício/unidade só valem com chave própria das tabelas (`'constructor'`/`'__proto__'` são rejeitados na validação e ignorados em `createGame`).
- Forma canônica: `canonicalize` deriva a água profunda quando o arquivo não tem nenhum byte DEEP (mesma regra de `mapFromData`), para que importar e salvar uma vez não mude o `mapHash`; `mapHash` inclui a `tag` das entidades e não aloca `w*h` com tamanho inválido; `blankMap` usa a mesma rotação de inícios de `generateMap` para a mesma semente.
- `createGame`: `owner` de uma entidade é o índice do **início** (segue `startOrder`); obra pré-colocada incompleta é `unpaid` (cancelar/excluir não reembolsa); `complete` só booleano; unidade pré-colocada nasce em região com ≥ 8 tiles quando possível; em regicídio sem kit o basileus só nasce se o mapa não o pré-colocou; colina inválida cai no centro; `stats.buildingsBuilt/unitsTrained` e `events` são zerados só quando há `config.map`.
- Hash do estado: terreno inteiro (4 bytes por mistura, ~0,05 ms num mapa médio) + `id` e `floor(amount)` de cada nó; o contador de ids de nós (`nodeSeq`) é gravado no save/instantâneo para que quem reconecta gere os mesmos ids.
- `removeBuildingNow` limpa `gateTeam` só para portões e `blocked` só para não passáveis; maravilha removida zera a contagem de vitória e recalcula modificadores.
- Lobby: `settings.fixedMap` leva só `{ id, name, w, h, starts, hash }` (o relay descarta o resto); o mapa inteiro vai em `start.config` (limite de 1 MB; `maxPayload` de 2 MiB). A Horda aceita mapa fixo quando há início para cada humano + Tártaro.
- Biblioteca local (`src/game/maps.ts`): `aoe_maps_v1` + `aoe_map_<id>`; importar um arquivo na Partida rápida/lobby também o guarda em Meus mapas (cota cheia → só em memória); a escolha fica em `aoe_setup.fixedMapId`. Primeiro mapa embutido: `estreito` (gerado na Etapa 2; redesenhado por script com as ops do editor na Etapa 4, como o `egeu`).
- Scripts: `npm run map:export`, `npm run map:check`, `npm run smoke N S -- --map arquivo` (o `--` é obrigatório com o npm).

- Etapa 5 (parte 1): `UnitFilter.military?: boolean` (equivale a `helpers.military`) e `config.campaignDifficulty` entraram na gramática; `compileScenarioCached` guarda até 8 compilações por (hash do JSON, idioma) e lança em cenário inválido; `gameConfigFor(file)` monta o `GameConfig` de um arquivo; `getScenarioFor(state)` é a única porta para o HUD e o runner (o registro embutido continua para `config.scenario`); gatilhos `repeat` não entram em `fired` (só os não repetidos contam em `firedCount`); `place` incompleto marca `unpaid`; `spawn`/`place` com `tag` gravam `vars['#tag']` (primeiro id) e `vars['#tag[k]']`; o m1 em JSON é oficial e usa id reservado só porque vive em `src/core/scenario/missions/` (`allowReserved`). Correção derivada: as ordens iniciais de coleta em `createGame` só atingem cidadãos ociosos (cidadãos que o cenário já pôs a rezar ficam rezando).

- Etapa 5 (parte 2): o HUD lê o cenário só por `getScenarioFor(state)` e desenha `def.hud` (countdown/progress) — as missões m2/m3 declaram `hud` em `campaign.ts`; progresso de campanha, "Próxima missão" e conquistas de missão só para ids oficiais e fora do modo de teste. Editor: modal **Gatilhos** (textarea JSON com validação ao vivo por caminho, 5 modelos, "Pegar ponto", Remover) grava `meta.scenario`; `MapEditor` copia `file.scenario` para `meta`; "Testar com o cenário embutido" usa `gameConfigFor(scenario)` + mapa inline. Campanha: "Cenários personalizados" (Meus mapas com `scenario` + importar; ids reservados recusados na importação). Multiplayer: `settings.fixedMap.scenario` leva só o título; os humanos da sala ocupam as primeiras vagas do cenário (IAs do lobby ignoradas), `scenarioData` viaja em `start` e é validado em todos os clientes; sem intro em rede. `scripts/playtest-scenario.mjs [url] [relay]`.

- Revisão adversarial da Etapa 3 (24 achados corrigidos): ids únicos ao criar/copiar mapas (`uniqueMapId`), autosave só quando houve edição (não substitui o rascunho anterior) e também em `pagehide`, aviso de cota no autosave e confirmação de saída diferente quando o rascunho não pôde ser guardado, `setRevealAll(false)` ao sair do editor, testes não registram deus jogado nem oferecem Salvar/Carregar, `esc()` nos toasts com nome do mapa, "Escolher no mapa" só dentro do mapa com indicador e cancelamento (Esc/menu/troca de ferramenta), times por início validados, traço encerrado ao sair do canvas, avisos/tooltip não bloqueiam o hover, controles de intervalo/caixas não retêm os atalhos, botão direito no minimapa sem menu do navegador, tooltips sem `<br>`, textos padrão traduzidos, rodapé do editor com altura proporcional.

- Campanha (docs/STORY.md §6, G0–G7): o registro `CAMPAIGN` (`campaign.ts`) serve menu, HUD, `startMission`/"Próxima missão" e runner; missões JSON oficiais são compiladas por `compileScenarioCached`. Operadores novos da gramática: `koth`, `wonderHeld`, `kingAlive`, `alive`, `difficulty` (condições), `{ stat: 'difficulty' }`, `spawn.scaled`, `BuildingFilter.tag` e `EntityRef { tag, pick, near }`. Objetivos ocultos são avaliados (revelam-se ao mudar de estado). Em cenário, `eliminatePlayers` roda sem declarar vencedor e só elimina quem não tem edifício que conta **nem nenhuma unidade**; marionetes são explícitas (`players[i].puppet: true`) e o `alive` delas é "tem entidade viva"; `{ do: 'defeat', player }` derrota qualquer jogador. A derrota implícita vale quando nenhum humano (não marionete) está de pé; com humanos em times diferentes, o resultado vale por time (`scenario.winnerTeam`, tela de fim por cliente). `validateScenario(f, { warnings: true })`/`lintScenario(f)` devolvem avisos (`level: 'warn'`: tag futura sem `fired`, oculto que nunca aparece, oculto revelado por gatilho sem `{ fired }` no `done`/`failed`, humano de outro time sem `puppet`, fala sem `en` ou > 200 caracteres), exibidos no modal Gatilhos sem bloquear o salvar. Entidades do mapa com a mesma tag viram grupo (`#tag[k]`).

- Etapa 4: **atalhos** sem `A`/`R`/`U` também no editor (Unidades = `M`, regiões = `L`, conta-gotas = `P`); o conta-gotas armado vale com qualquer ferramenta e o botão direito o desarma sem apagar. **Redimensionar** não é uma `EditOp` (mudaria o tamanho de todos os arrays do estado e das texturas): `resizeMapData` (em `fixed.ts`, puro e testado) gera o arquivo novo, `MapEditor.resized` cria outra instância ligada à anterior (`resizedFrom`/`resizedTo`) e `undo`/`redo` nas pontas da pilha trocam de instância por `onSwitch` (em `main.ts`, `switchEditor`); editar a anterior descarta o refazer. Tiles novos são grama com decoração pelo ruído; nós/entidades fora são cortados; inícios nunca somem (vão para a margem de 8 tiles, mantendo donos e times); a colina volta ao centro se sair; a borda nova nunca fica com água profunda. **Correções** são calculadas numa cópia do mapa e reaplicadas como um `batch` (inversa exata). **Tabela de recursos** conta nós a ≤ 16 tiles (distância euclidiana entre tiles; comida = frutas, cervos, javalis e pedra de Poseidon).
- Mapas oficiais (Etapa 4): feitos por **script reprodutível** em vez de à mão, para que a simetria seja exata e qualquer retoque seja um diff legível: `MapBuilder` (`scripts/maps/lib.ts`) parte de `blankMap`, aplica `paint`/`addNode`/`setStart` pela `MapEditor`, decide terreno e nós só no representante canônico de cada órbita do grupo de simetria (rotação de 180° no 1v1, espelho duplo no 2v2) e usa as correções do editor (Fechar bolsão) até zerar os avisos; `finish()` recusa gravar se houver erro, assimetria de terreno/nós, recursos diferentes por início, **vizinhança diferente na orientação absoluta** — os 12 tiles em volta de cada início (`placeStartLayout`: 12 frutas a leste/oeste, 6 ouros a norte/sul, 4 cervos, 2 javalis, 4 bosquetes nas diagonais) são invariantes pelos espelhos locais (antes obrigatório, porque o kit inicial nascia sempre ao sul do Centro Cívico; hoje o kit e a IA usam o referencial voltado ao centro do mapa e a checagem fica como folga) — ou **rota selável**: `routeReport` fecha as zonas das outras rotas (cada script declara as suas: vaus, ilhas), mede o corte mínimo de vértices entre os inícios (fluxo máximo, 4-conexo como `canStep`) e varre edifícios quadrados de 1×1 a 4×4 em terreno construível perto da rota; exige corte ≥ 5 e nenhum edifício que a sele sozinho (senão um humano fecharia o mapa com três casas; a IA já é protegida por `wouldSeal`). Os oficiais gravam `relics: false` (relíquias sorteadas pela semente quebrariam a simetria). **Estreito** (1v1, 80×80): estreito diagonal em S com ilhotas de pedra e três vaus de areia (o central, largo e guardado por rochedos; dois laterais mais estreitos — meia largura em x + y de 7 e 6, cortes de 6, 5 e 5 tiles), serra e bosque às costas; 3180 de comida, 15 450 de madeira e 5400 de ouro a ≤ 16 tiles de cada início. **Egeu** (2v2, 113×113 — lado ímpar para que a colina padrão fique no centro exato de simetria, a 48 tiles de caminho de cada início —, `startTeams [0,0,1,1]`): mar leste–oeste com costa recortada e ilhotas, três ilhas no eixo ligadas às duas costas por baixios de meia largura 3,6 (oeste, central com a colina e 8 veios de ouro, leste; cortes de 6, 5 e 6 tiles), lago entre os aliados, morros e serras nos cantos; 3180 / 13 800 / 5400 por início. `scripts/maps/fairness.ts` roda IA x IA com o mesmo deus em todos os inícios e conta vitórias e idades por início; critério (desde 26/09/2026): 45 min, ≥ 16 sementes em espelho **nas duas ordens de inícios** (`--both`: o jogador 0 começa ora num lado, ora no outro), nenhum lado com mais de 65 % das partidas **decididas + à frente no fim** (nas sem vencedor, o lado com mais edifícios + unidades), tanto por POSIÇÃO (lado do início) quanto por ÍNDICE (lado dos jogadores na ordem padrão).
- Números da Etapa 4 (IA Normal, 35 min), depois da revisão: `fairness` **em espelho** (o mesmo deus nos dois lados; com deuses diferentes quem decide é o deus mais forte, e isso escondia o viés de posição), sementes 1–16. **Estreito**: Zeus × Zeus → início 1 8, início 2 6, 2 sem vencedor; Poseidon × Poseidon → 6 × 10; total 14 × 16 (53 %, dentro do critério); Heroica 15,4–16,3, Mítica 19,6–21, Titãs 27–28 nos dois inícios. O Estreito anterior (vaus de meia largura 3,5 e 2,5) dava 6 × 18 com o mesmo método (p ≈ 0,02) e o início 2 chegava à Heroica ~1 min antes; a causa não foi isolada — orientar a espiral de `findBuildSpot` pelo centro do mapa não a removia (experimento: 2 × 13 com Zeus) —, e o viés sumiu ao alargar os vaus. **Egeu** (times do arquivo, 4× Zeus): norte 8, sul 0, 8 sem vencedor (antes: 6 × 1 em 12 sementes); os quatro inícios chegam às idades juntos (Heroica 16,1–17,6), mas o sul perde as partidas decididas — era defeito do motor/IA, corrigido em 26/09/2026 (item abaixo). `npm run balance 35 1,2,3 -- --map` (cada IA por si, deuses Zeus/Poseidon/Hades/Zeus): Estreito Clássica 5–6, Heroica 13–18, Mítica 17–21, Titãs 27 (Poseidon, no início 2, vence as 3 — é o deus: em espelho o Estreito fica dentro do critério); Egeu Clássica 5–6, Heroica 13–17, Mítica 18–22, Titãs 25–32; nenhuma IA parada aos 5 min (a linha "aos 5 min" do `balance.ts` acusa). Os mapas gerados de antes davam a um início 8100 de ouro a ≤ 16 tiles e ao outro 900 (Estreito) — no balanço, o início 1 vencia sempre.
- **Justiça de posição (26/09/2026)** — o viés norte do Egeu era do motor/IA, não do mapa (exatamente simétrico): seguia a POSIÇÃO (com os jogadores trocados de início o norte continuava vencendo, 23 × 4 somando 48 partidas) e se invertia no Egeu transposto. Causa: uma soma de regras com orientação absoluta — kit ao sul do CC, `nearestNode`/`findSpawnTile` desempatando pela ordem da varredura (norte/oeste primeiro), distâncias medidas do canto dos nós e das pegadas, espiral de `findBuildSpot` que testava o norte primeiro (templo, mercado e casas sempre ao sul do CC: à frente para quem começa ao norte, atrás para quem começa ao sul), âncora das casas com y absoluto, cidadãos assustados indo para `tc.y + 3`, formação por id — e, tiradas elas, efeitos de ÍNDICE (a IA do jogador 0 pensava 1 s antes, as IAs pensavam sempre na ordem 0→3, a unidade mais antiga golpeava primeiro). Correção, em duas rodadas (a 2ª depois da revisão que reprovou a 1ª):
  - `centerFrame` (`src/core/map/grid.ts`: sinais e eixo dominante do vetor ponto→centro, sem trigonometria; invariante a espelho nos dois eixos e à rotação de 180° em todo o mapa, e à transposição fora das diagonais |dx| = |dy|) orienta o kit (fileira que vira coluna em mapas leste×oeste), a âncora das casas, a Fartura (a cornucópia 2×2 fica centrada no ponto: a espiral anda pelos centros de pegada), a Isca, os javalis da Praga, o basileus e as entidades pré-colocadas sobre um tile ocupado; `towardFrame` (o lado de quem chega, com `tie` = `centerFrame` do ponto no caso alinhado) orienta a espiral dos destinos bloqueados de um grupo, `nearestFreeTile`, as sentinelas (cada canto procura para fora do edifício) e os empurrões de unidades sob um edifício novo ou um tile que fecha (`pushUnitsOutOfTile`).
  - Desempates: distância ao centro do mapa e, se ainda empatar, `frameCompare` (b, depois a, no referencial local do âncora/ponto) em `findBuildSpot`, `findSpawnTile`, `nearestNode` e `nearestUnclaimedNode`. Sem o 2º passo, com os inícios do Estreito exatamente na diagonal do mapa, os candidatos refletidos na diagonal empatavam em tudo e (y, x) absolutos escolhiam o norte dos dois lados (templo, casa, quartel, torre, fazenda e o ponto de nascimento do início 2 não eram a rotação dos do início 1: sondagem 4/10). Centros de tile/pegada em vez de cantos; `findBuildSpot` em ordem de distância âncora→centro da pegada (ordem em cache por pegada, raio e fração do âncora, bit a bit a da ordenação direta) e **sem tirar o último acesso de um recurso** (`sealsNode`: a nova ordem encostava a mina no único veio de ouro da Liga na m7 e os mineiros atravessavam o mapa).
  - IAs: todas começam juntas e a ordem gira **por rodada** (`state.aiRound`, salvo no estado, 0 em saves antigos; `aiThinkOrder`: abre `round % n`, o sentido alterna a cada n rodadas, e a rodada só avança nos ticks com 2+ IAs pensando). O rodízio é exato **entre IAs do mesmo período de pensamento**; com dificuldades diferentes, a mais rápida pensa mais vezes e por isso abre mais vezes (ex.: Fácil × Difícil em 3 IAs, 114 × 56 em 45 min) — é o ritmo da dificuldade, não viés de posição. A 1ª versão girava por segundo e, com a IA Fácil (a cada 2 s), o jogador 0 abria todas as vezes (1v1: 1349 × 0 em 45 min); com a Difícil em 3 IAs, o jogador 2 abria o dobro. Unidades e edifícios em ordem invertida nos ticks ímpares; formação invariante a espelho; alvo "mais fraco" desempatado pelo inimigo mais perto (antes, o de menor índice); herói leva a relíquia ao lado do Templo voltado a ele; sem CC inimigo, `enemyDirection` aponta ao centro.
  - `SIM_VERSION` = 2: replays antigos são recusados com mensagem, e o relay recusa na sala, também com mensagem clara (erro `simVersion`, traduzido no lobby; sala de outra versão marcada na lista), quem tiver outra versão da simulação. Antes, os dois lados dessincronizavam no 1º hash. Testes: `tests/position-fairness.test.ts` (inclui as sondagens de simetria no estado inicial: Egeu 30/30 e Estreito 10/10, como na revisão) e `tests/relay-version.test.ts`.
- Números da versão final (26/09/2026; IA Normal, 45 min, o mesmo deus em todos, `--both`: cada semente nas duas ordens de inícios). "dec." = partidas decididas; "+ à frente" soma as sem vencedor pelo lado com mais edifícios + unidades no fim. O critério (> 65 % para um lado) é aplicado a cada conjunto de sementes, por POSIÇÃO (lado do início) e por ÍNDICE (lado dos jogadores 0–1 na ordem padrão). Conjuntos: sementes 1–16 (32 partidas) e sementes novas 101–132 (64 partidas); as JSON de cada rodada ficam fora do repositório.
  - **Egeu** (norte × sul): posição 16 × 14 dec. (18 × 14 = 56 %) e 29 × 30 (33 × 31 = 52 %); índice **10 × 20 dec. (67 %)** — 12 × 20 = 63 % com as à frente — e 33 × 26 (37 × 27 = 58 %). União das 96: posição 45 × 44 dec., índice 43 × 46. Idades por início: Clássica 5,5–5,8, Heroica 15,9–16,9, Mítica 20,7–21,5.
  - **Egeu transposto** (`--transpose`, oeste × leste): posição 17 × 14 (18 × 14 = 56 %) e 32 × 26 (36 × 28 = 56 %); índice 15 × 16 e 26 × 32 (30 × 34 = 53 %). União: posição 49 × 40 dec. (55 % para o oeste), índice 41 × 48.
  - **Estreito** (Zeus): posição **11 × 21 (66 %, fora por 1 ponto, a favor do início 2)** e 37 × 25 (38 × 26 = 59 %, a favor do início 1); índice 15 × 17 e 27 × 35 (28 × 36 = 56 %). União: posição 48 × 46 dec., índice 42 × 52 (55 %). **Poseidon**, 1–16: posição 18 × 14 (56 %), índice 16 × 16.
  - `--mirror-ai` (a mesma personalidade de IA em todos): Estreito 1–16, posição 14 × 17 (15 × 17 = 53 %), índice 17 × 14; Egeu 1–16, posição 15 × 14 (16 × 16), índice **8 × 21 dec. (72 %; 10 × 22 = 69 %), fora**; Egeu 101–132, posição 30 × 27 (33 × 31 = 52 %), índice 28 × 29 (33 × 31 = 52 %).
  - Para comparar (medido na revisão, mesmo método). HEAD sem correção: Egeu 1–16, posição 23 × 7 dec. (77 %); 101–124, 33 × 11 (75 %); Estreito 101–132, início 2 18 × 45 (72 %); todos fora. 1ª correção: Estreito 101–132, início 1 37 × 25 (60 %), e sondagem de simetria do Estreito 4/10; hoje, 10/10.
  - **O que os números dizem.** A posição deixou de decidir as partidas: nas 96 partidas de cada mapa, o Egeu dá 45 × 44, o transposto 49 × 40 e o Estreito 48 × 46, e as idades por início coincidem. Sobram três coisas:
    1. Com 32 partidas, o critério de 65 % reprova uma moeda honesta em ~11 % das vezes: a chance de 21 × 11 ou pior é 0,11. É o caso do Estreito 1–16 por posição (66 %), cujas sementes 101–132 pendem para o outro início. Antes de declarar viés, use ≥ 32 sementes × 2 ordens: com 64 partidas, a chance cai a ~2 %.
    2. Há um efeito de ÍNDICE no Egeu que só aparece nas sementes 1–16: os jogadores 2–3 vencem 20 de 30 decididas, e 21 de 29 com `--mirror-ai`. Nas sementes 101–132 o efeito some (33 × 26 e 28 × 29), e a união fica 43 × 46. Não vem da ordem das IAs (rodízio exato por par) nem da personalidade (não some com `--mirror-ai`). Candidatos ainda por índice: o empate exato de território, a ordem de vizinhos do A* (`DIRS`) e os desempates pela ordem de criação (ids menores dos jogadores 0–1). Fica em observação.
    3. A personalidade da IA vem do índice, (semente + 7·i) % 97, e jogadores vizinhos escolhem deuses menores opostos. É balanceamento, não posição; com `--mirror-ai` o Estreito fica em 53 %.
  - Leitura: o Egeu e o Estreito são justos por POSIÇÃO dentro do que 96 partidas medem. O Egeu não passa no critério por ÍNDICE nas sementes 1–16 (67 % das decididas; só entra com as à frente). **Mapa gerado** 1v1 (small, semente 42): 16 × 0 antes e depois da correção. O mapa é desigual (ouro a ≤ 16 tiles: 3600 × 1800), e isso não é viés de posição do motor.
- Revisão da Etapa 4: **redimensionar** desloca junto os pontos absolutos `{ at: [x, y] }` do cenário embutido (os relativos a início/Centro Cívico/entidade acompanham sozinhos) e a prévia/confirmação avisam os pontos que saem do mapa e as tags de entidades cortadas que o cenário usa; **Alargar gargalos** só mexe em volta dos gargalos a ≤ 10 tiles de um início (o `widenChokepoints` global do gerador tirava centenas de árvores do mapa inteiro num mapa desenhado); **Fechar bolsão** respeita o 3×3 do Centro Cívico do kit, como `validateMap` (um bolsão colado ao CC não se fechava); trocar de instância (redimensionar, Ctrl+Z/Ctrl+Y entre tamanhos) grava o rascunho da instância exibida.

## 6. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| `nodeSeq` é global de módulo: ids de nó divergem entre máquinas se um mapa for carregado sem `resetNodeSeq` ou se duas sessões coexistirem (`window.aoe` permite) | `createGame` já reseta; `mapToData` grava em ordem `(y, x)` e o loader insere na ordem do arquivo; a sessão do editor é a única viva; teste de ordem de inserção; Testar sempre reconstrói do arquivo |
| Renderer/minimapa só invalidam por contagem de nós; sem `invalidateRect` a pintura "não aparece"; pincel largo arrastado assa dezenas de chunks (`generateTexture`) por quadro | Retângulo sujo agregado por quadro, chunks só do retângulo, cache maior no editor; se travar em 144×144, chunks com `resolution` 0,5 no editor |
| Mapas desenhados pulam as garantias do gerador (conectividade, raio 8, recursos perto, gargalos, nós com acesso): IA parada, cidadãos sem comida, unidades presas | `validateMap` com os avisos ligados aos raios reais de `createGame`/`ai.ts`; botões de correção; `mapcheck` roda 2 min de IA; `npm run balance --map` obrigatório antes de embutir um mapa oficial |
| Conteúdo de outro par: `w*h` gigante, tipo inexistente (`UNITS[type]` quebra no tick), dono fora do intervalo, XSS por nome/autor | `migrateMap` + `validateMap` em todo cliente antes de `createGame`; `MAP_LIMITS`; `maxPayload` e limite do `start` no relay; `esc()` em menu/hud/painel |
| Mudar `stateHash` (terreno + nós) faz clientes de versões diferentes acusarem desync imediato | Desejável; mensagem `msg.desync` ganha dica "versões diferentes do jogo?"; `stateHash` do terreno custa ~0,1 ms a cada 100 ticks |
| Cota do `localStorage` (~5 MB): save ~300 KB + replay com mapa inline + biblioteca (~15–20 mapas médios) | `QuotaExceededError` tratado com toast e sugestão de exportar; RLE/IndexedDB só se o dono pedir muitos mapas |
| Entidades pré-colocadas passam por `placeBuilding(complete)` → `onBuildingComplete` (maravilha inicia contagem de vitória, portal emite evento) | `validateMap` avisa (`wonderComplete`); `createGame` zera `events`/stats após o setup; é decisão consciente do autor |
| Atalhos e cliques da partida vazam para o editor (`P` pausa, `+/-` velocidade, `Delete`, `1–9`, `F5` salva a sessão do editor como save, minimapa emite `contextCommand`) | Desvio no início dos handlers de `Input`, antes desses tratamentos; `F5` e `achievements.update` condicionados em `main.ts`; playtest do editor verifica que `P` e `F5` não têm efeito |
| Modos de jogo em mapa fixo: `regicide` sem CC quebra hoje (`tc.x`), `koth` pode ficar inalcançável, `mapType` é irrelevante | `regicideNoTc`/`kothUnreachable` em `validateMap` com `mode`; spawn do basileus por `spiralSearch` do início; `#m-maptype`/`#mp-maptype` desabilitados |
| Atribuição de inícios em mapas de time (aliados em cantos opostos, jogador 1 sempre no mesmo canto) | `startTeams` no arquivo + `startOrder` no config (arquivo e hash inalterados); opção no lobby |
| Conquistas e progresso de campanha com conteúdo personalizado ("farmar" kills em mapas com exércitos pré-colocados) | Testes do editor não contam; ids de cenário reservados; `startKit:false` desliga `achievements.update` (§7.2) |
| WIP na árvore (menu/hud/main/strings) toca os mesmos arquivos do editor; commits grandes conflitam | Etapa 0 commita primeiro; PRs/commits pequenos por etapa; `tests/sim`/`determinism` a cada rebase |
| Gramática de gatilhos virar linguagem (pressão por `$i`, aritmética livre) | Conjunto fechado; `Value` só com `add`; Horda e listas geradas ficam em TS; cada operador novo entra com validação + teste |
| Custo de `compileScenario` chamado pelo HUD (`getScenario` em `refreshObjectives` a cada 0,12 s) | Cache por (hash do JSON, locale); recompilar só ao trocar idioma |
| `setLocale` muta `UNITS/BUILDINGS.name`: paletas e listas do editor ficam com o idioma antigo | `onLocaleChanged` re-renderiza o painel; `tx()` resolve textos de cenário na emissão; nada de texto entra no hash |
| Save antigo/replay antigo com config sem os campos novos | Todos os campos têm padrão; `deserialize` já tolera; `migrateMap` no import e no `start` |

---

## 7. Perguntas ao dono do projeto

1. **Ordem**: confirma fechar mapas fixos + editor de mapas (Etapas 0–4, ≈ 43 h) antes dos gatilhos em JSON (Etapa 5)? A alternativa (JSON primeiro) só compensa se você quiser começar as missões da 3.4 já em JSON em vez de TS.
2. **Conquistas em conteúdo personalizado**: proposta — ligadas em Partida rápida/Multiplayer com mapa fixo e kit inicial (é só um mapa), desligadas em testes do editor e em mapas com `startKit:false` (bases pré-montadas). Aceita?
3. **Mapas oficiais**: dois nomes/temas para começar ("Estreito" 1v1 e "Egeu" 2v2 são sugestões) — você quer desenhá-los no editor ou prefere que eu gere por semente e retoque? Precisam de nome em inglês desde já.
4. **Migrar m2/m3/Horda para JSON** depois da Etapa 5 (≈ 8 h, com teste de paridade) ou manter em TS e usar JSON só nas missões novas?
