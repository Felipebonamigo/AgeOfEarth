# Unreal — ponte com a simulação e exportador de terreno

Plano geral: `docs/UNREAL.md`. Este arquivo é o guia prático de quem monta o projeto no Unreal (a sessão local do dono).
O projeto Unreal em si (`unreal/AgeOfEarthUE/`) fica só no PC do dono; aqui entram scripts, exportações pequenas e capturas.

## 0. Primeira vez no PC (Windows)

Cole o prompt de `unreal/PROMPT-SESSAO-LOCAL.md` na sessão local, ou rode direto `powershell -ExecutionPolicy Bypass -File unreal\scripts\setup-windows.ps1` (instala Git, Node e o Epic Games Launcher; o Unreal Engine em si o dono instala pelo Launcher).

## 1. Rodar a simulação e a ponte

```bash
npm ci
npm run unreal:sim -- --seed 42 --size medium --reveal          # ws://127.0.0.1:8790
# opções: --port 8790 --ais 1..3 --god zeus|poseidon|hades --difficulty easy|normal|hard|expert --map arquivo.map.json
#         --every 2 (um state a cada 2 ticks = 10 Hz) --speed 1 --age 0 --paused --reveal (sem névoa, para desenvolver)
```

O jogador do cliente é sempre o 0; os outros são IAs. Vários clientes podem conectar (veem e comandam o jogador 0).

## 2. Protocolo (JSON, uma mensagem por frame de WebSocket)

Definição e comentários: `scripts/unreal/protocol.ts`. Unidades de medida: **tiles** na simulação; no Unreal,
**X = x · 200, Y = y · 200** (1 tile = 2 m). Rotação: derive do deslocamento (`px,py` → `x,y`) ou do alvo.

Servidor → cliente:

| `type` | Quando | Conteúdo |
|---|---|---|
| `hello` | ao conectar | `protocol`, `simVersion`, `tickRate` (20), `stateEvery`, `uuPerTile`, `player`, `map` {w,h,terrain,decor (base64, 1 byte/tile; `TERRAIN`: 0 grama, 1 água, 2 montanha, 3 areia, 4 terra, 5 água funda), starts}, `nodes`, `players`, `ages`, `unitTypes`, `buildingTypes`, `gods` |
| `fog` | quando a névoa muda | `v` = base64 de w·h bytes (0 inexplorado, 1 explorado, 2 visível) |
| `state` | a cada `stateEvery` ticks | `tick`, `time`, `units[]`, `buildings[]`, `nodes[]` (só mudanças: `[id, quantidade]`, `-1` = sumiu), `events[]`, `effects[]`, `me` (recursos, pop, Era, poderes…), `players[]` |
| `over` | fim de partida | `winner`, `events` |
| `pong` | resposta ao `ping` | `t`, `tick` |

Unidade: `{ id, t (tipo), o (dono), x, y, px, py, hp, mhp, s (estado: idle|move|attack|gather|return|build|pray|hold|garrison…), atk (tick do último ataque), tid (alvo), nid (nó), carry, kills, heads }`.
Edifício: `{ id, t, o, tx, ty, w, h, hp, mhp, c (completo 0/1), p (progresso 0–1), q (fila), v (2 visível, 1 só explorado), age (Era do dono → arquitetura) }`.
Efeitos: projéteis, quedas, poderes etc. nascidos desde o `state` anterior (`type`, `x`, `y`, `tx`, `ty`, `src`…): são a deixa para o Niagara/som.

Cliente → servidor: `{type:'cmd', cmd}` (o mesmo `Command` de `src/core/types.ts`: `move`, `attack`, `gather`, `build`, `train`,
`research`, `advanceAge`, `power`…; o campo `player` é ignorado — vale o do cliente), `{type:'pause', paused}`, `{type:'speed', speed}`, `{type:'ping', t}`.
Comandos inválidos são descartados em silêncio.

Interpolação: entre dois `state` (100 ms) desenhe a unidade entre a posição anterior e a atual; o jogo web faz o mesmo.

## 3. Exportar um terreno para o Landscape

```bash
npm run unreal:terrain -- --seed 42 --size medium --out unreal/exports/meu-mapa [--landscape 1009]
npm run unreal:terrain -- --map src/core/data/maps/egeu.map.json            # mapas oficiais
```

Gera `heightmap.r16` (uint16 LE, linha 0 = Y mínimo; **1 m = 128**, zero = 32768), `heightmap.png` (16 bits),
`layer-{grass,dirt,sand,rock}.png`, `water.png` (8 bits) e `terrain.json` (escalas do Landscape e os nós e inícios em
unidades do Unreal com a altura do chão). Importação: Landscape → *Import from File* → `heightmap.r16`, resolução
N×N (N = `landscape.resolution`), **Scale = (scaleXY, scaleXY, 100)**, localização (0, 0, 0); camadas pelos
`layer-*.png`; água (plugin Water) no nível Z = 0 recortada por `water.png`. O jogo não tem altura: o relevo é
sintetizado (mar até −7 m, montanha até ~20 m) e dá para esculpir por cima no Unreal sem mexer na simulação — **desde
que o terreno andável continue o mesmo** (a navegação é a grade de tiles do jogo).

## 4. Primeiro marco (U0)

1. Exportar o terreno de um mapa pequeno e importar no Landscape.
2. Conectar na ponte (WebSocket no Unreal: plugin *WebSockets* ou *Puerts*) e mostrar, no lugar das unidades e
   edifícios, caixas coloridas pelo dono, andando e se atualizando.
3. Clicar com o botão direito mandando `move` (raycast no Landscape → tile → comando) e ver a caixa andar.
4. Captura (`HighResShot`) de um terreno bonito com céu e luz (SkyAtmosphere, DirectionalLight, Lumen) em `unreal/capturas/`.
