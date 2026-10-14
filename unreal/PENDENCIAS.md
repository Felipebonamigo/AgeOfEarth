# Pendências do Unreal (14/10/2026, após o U1)

Decisão do dono em 14/10/2026: **seguir no Unreal**. Itens que a sessão local não conseguiu fechar, para depois:

## Arte e animação
- **Cavalaria, criaturas, heróis montados e navios sem esqueleto**: hoje só balançam ao andar e avançam no golpe. O Meshy gratuito
  não traz rig. Caminhos: (a) Mixamo (animações humanas; exige login Adobe do dono) para heróis/centauros bípedes; (b) Blender com
  auto-rig (Rigify/auto-skin) por espécie, preparado pela nuvem (`scripts/bake/`); (c) animação por vértices (shader) só para voadoras.
- **Casa de telhado vermelho** (`edificios/house__greek-tavern.glb`): malha estilhaçada de perto (simplificada de 565 mil para
  87 mil triângulos com `simplifySloppy`). Baixar de novo o original do Meshy (URL em `art/meshy/catalogo.json`) e reduzir com
  mais cuidado (200–300 mil, Nanite aguenta) ou trocar pela outra casa.
- **Orientação das armas** (yaw −90 assumido): lanças/escudos de algumas unidades olham para o lado. Conferir tipo a tipo com captura de perto.
- **Efeitos** (poeira, fogo, golpes, fumaça de obra): a ponte já manda `events`/`effects`; falta Niagara (sem API de Python prática, fazer no editor).
- **Ciclo de dia e variação de céu**; ajuste fino de contraste dos campos.
- **Plantas à sombra** ficam escuras (folhagem sem translucência): material de folha com *subsurface*.
- **Nanite desligado** em folhagem/vento (73 malhas) por causa de travamento de GPU (`u1_nanite.py`); reavaliar em versão nova do motor.

## Engenharia
- Terreno do mapa médio exportado com 2 jogadores (`scripts/unreal/export-terrain.ts`, da nuvem): pedir `--players N` à nuvem.
- Cook leva só pastas explícitas (`DirectoriesToAlwaysCook`); os control rigs/ABP do Third Person estão quebrados (apontam para outra pasta) e ficam de fora.
- `-AoEPerfLog=` não grava arquivo na build (lê-se o log do jogo); VRAM por processo não medida (só `nvidia-smi` da placa).
- Mouse/gameplay no Unreal: só seleção e `move`; faltam construir, treinar, atalhos, HUD (U2).
- Licenças para `docs/LEGAL.md` §4 (nuvem): Poly Haven (CC0) e Manny/Quinn + animações da Epic (só dentro de jogo feito no Unreal).

## Depende do dono
- Aprovar o escopo do **U2** (`unreal/U2-PLANO.md`).
- Conta do Fab/Megascans (opcional; hoje tudo vem do Poly Haven CC0).
