# Age of Earth no Unreal Engine 5 — plano técnico

Decisão do dono (09/10/2026): **a qualidade gráfica é o ponto principal** — visual moderno e realista, arquitetura
seguindo as Eras. O jogo passa a ser desenhado no Unreal Engine 5. Cronograma em `docs/ROADMAP.md`.

## Arquitetura

```
 simulação TypeScript (src/core: regras, IA, Eras, campanha, mapas)    ← não muda; determinística, testada
        │  estado a 10–20 Hz (JSON por WebSocket local)      ▲ comandos do jogador (o mesmo `Command` de hoje)
        ▼                                                     │
 cliente Unreal 5 (C++ + Blueprints): terreno, unidades, edifícios por Era, efeitos, câmera, interface, som
```

- **Primeiro (U0–U1): a simulação roda num processo Node ao lado do jogo** (`scripts/unreal/sim-server.ts`, a escrever
  na nuvem) e o Unreal conecta por WebSocket em `localhost`. É o caminho mais curto e o servidor já pode ser testado
  aqui com um cliente falso.
- **Depois (U2–U4): a simulação vai para dentro do jogo**, pelo plugin Puerts (V8/TypeScript no Unreal) ou como
  processo filho empacotado. O multiplayer lockstep e os replays continuam funcionando, porque a simulação é a mesma.
- O cliente nunca muda o estado: ele interpola posições entre dois estados (como o renderizador web faz com `px/py`) e
  manda comandos.

## Protocolo da ponte (rascunho, fecha no U0)

- `hello` (servidor → cliente, ao conectar): `simVersion`, `tickRate`, mapa (`w`, `h`, `terrain` em base64 — `TERRAIN.*`
  de `src/core/constants.ts`), jogadores (id, nome, cor, deus), nós de recurso.
- `state` (a cada 2 ticks): `tick`, unidades `{ id, t, o, x, y, px, py, hp, mhp, s, atk }` (tipo, dono, posição em
  tiles, posição anterior, vida, estado, último ataque), edifícios `{ id, t, o, tx, ty, w, h, hp, mhp, c, p, age }`,
  eventos do tick (mortes, projéteis, poderes, Era nova) e recursos do jogador local.
- `cmd` (cliente → servidor): um `Command` como hoje, sanitizado por `sanitizeCommand` (`src/core/sim/validate.ts`).
- Unidade de medida: 1 tile = 2 m = 200 cm no Unreal (o mesmo `M2T = 0,5` do bake).

## Terreno

- O exportador (`scripts/unreal/export-terrain.ts`, a escrever na nuvem) gera, de um mapa (semente ou `.map.json`): um
  heightmap 16 bits `.r16` no tamanho que o Landscape aceita (ex.: 1009 × 1009), máscaras de camada (grama, terra,
  areia, rocha, água rasa, água funda) e a lista de nós e inícios. O Unreal importa como Landscape com materiais
  Megascans; a água é o plugin Water do próprio Unreal.

## Arte

- **Fontes, nesta ordem**: Fab/Megascans (terreno, rochas, vegetação, materiais), Meshy (modelos de arquitetura grega e
  de personagens — galeria pronta primeiro, geração com créditos só com aprovação do dono; pedidos 0004 e 0005 do canal),
  Mixamo (animações humanas), Blender (preparo: escala, pivô, redução, materiais com cor de time —
  `scripts/bake/cycles-render.py` e `scripts/bake/export-glb.mjs` já existem) e, se o orçamento permitir, um artista
  para retoques.
- **Arquitetura por Era**: um kit por Era (madeira e adobe → pedra e telha → mármore → bizantino → … → concreto e aço,
  `docs/ERAS.md` §5), cada edifício montado com as peças da Era do dono.
- **Cor de time**: parâmetro de material (máscara pintada nas peças de time), como a máscara do bake.
- **Licenças**: só CC0, CC BY 4.0 ou a licença padrão do Fab/Unreal (uso em jogo liberado); tudo no catálogo e nos
  créditos (`docs/LEGAL.md` §4).

## Divisão do trabalho

| Quem | O quê |
|---|---|
| Nuvem (esta sessão ou o modelo mais barato) | simulação e Eras (`docs/eras/`), ponte e protocolo, exportador de terreno, testes, preparo de modelos no Blender, documentação |
| Sessão local no PC do dono (RTX 4070 Ti, Unreal 5 + a habilidade Unreal) | projeto Unreal por scripts (Python do editor, compilação, capturas com `HighResShot`), importação dos modelos, materiais, animação, mapa, interface; Meshy e Mixamo |
| Dono | aprovar cada marco pelas capturas, orçamento de créditos, conta Steam |

- O projeto Unreal mora no PC (pasta `unreal/AgeOfEarthUE/`, fora do git por causa do tamanho dos `.uasset`); entram no
  repositório só os scripts, a configuração e as capturas em `unreal/` (ex.: `unreal/scripts/`, `unreal/capturas/`).
  Versionar o conteúdo binário fica para depois (Git LFS ou repositório próprio).
- A conversa nuvem ↔ local segue o canal de `art/meshy/canal/` (`docs/MESHY_LOCAL.md` §8), com a sessão local podendo
  escrever também em `unreal/`.

## Marcos

- **U0** ambiente e ponte: o Unreal abre o projeto, conecta na ponte e mostra caixas no lugar das unidades, andando.
- **U1** fatia bonita: capturas e vídeo de um pedaço de mapa realista com uma cidade grega e hoplitas/cidadãos
  animados, comparados com o jogo web de hoje. **O dono decide aqui se segue tudo no Unreal.**
- **U2** cliente completo das Eras I–IV · **U3** Eras V–VIII · **U4** desempenho, Steam e Early Access.
