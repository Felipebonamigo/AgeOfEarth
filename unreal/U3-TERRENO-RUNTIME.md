# U3 — terreno montado em tempo de execução (proposta para aprovação, 15/10/2026)

**Decisão pedida ao dono:** aprovar a opção B abaixo antes de qualquer código. É mudança de arquitetura do cliente Unreal.

## Problema

Hoje cada mapa do Unreal (`U1`, `U1M`) é montado **no editor** a partir de um terreno exportado (semente, tamanho e número de
jogadores fixos) e cozido na build. A partida de verdade tem qualquer semente, tipo de mapa, tamanho e número de jogadores, e os
mapas fixos do editor de cenários: não dá para pré-construir todos. Quando o terreno da ponte não bate com o do mapa, edifícios e
unidades caem na água ou no mato (visto em 14–15/10; desde 15/10 o cliente avisa "TERRENO DIFERENTE").

Limite técnico: o `ALandscape::Import` que usamos (`AoEMapTools::ImportLandscape`) só existe no editor (`#if WITH_EDITOR`);
numa build empacotada não há como criar um Landscape novo.

## Opções

| | Como | A favor | Contra |
|---|---|---|---|
| A. Mapas pré-construídos | um `.umap` por mapa oficial e por combinação de semente/tamanho/jogadores | nada muda no código | não cobre mapa aleatório nem do editor; build cresce |
| **B. Malha de terreno em tempo de execução** | no `hello`, o cliente gera a malha do relevo em blocos (`UDynamicMeshComponent`, 64×64 quads por bloco, LOD por distância), as camadas (grama/terra/areia/rocha/água) numa textura de pesos criada em memória, e o mesmo material de terreno lendo essa textura; plantas e árvores sorteadas no cliente com semente da partida | cobre qualquer mapa; o material e as plantas já existem | perde as ferramentas do Landscape (LOD contínuo, grama nativa); ~1–2 semanas |
| C. Landscape fixo deformado | um Landscape grande cozido, com alturas aplicadas em tempo de execução por textura de deslocamento | aproveita o Landscape | deslocamento por textura no Landscape é limitado e serrilha nas costas; arriscado |

**Recomendação: B.** A ponte já manda o terreno por tile; o relevo pode sair do mesmo algoritmo do exportador da nuvem
(`buildTerrain`, determinístico) portado para C++, ou a nuvem passa a mandar o mapa de alturas no `hello` (pedido à nuvem:
campo `heightmap` em base64, uint16, com `valuePerMeter`). A segunda é mais simples e evita divergência entre as duas cópias.

## Passos (se aprovado)

1. Pedido à nuvem: `hello.map.heightmap` (e as camadas, se a nuvem preferir mandar já calculadas).
2. `AoETerreno`: malha em blocos a partir do mapa de alturas, normais, UV em mundo; colisão de consulta (o cursor e o `GroundZ`
   passam a ler o mapa de alturas direto, sem traço de raio).
3. Textura de pesos das camadas em memória (`UTexture2D` transitória) e o `M_U1_Terreno` lendo pesos dela em vez das camadas do
   Landscape.
4. Mar: plano na cota da água do mapa (hoje fixo em −70).
5. Plantas: o sorteio de `u1_plantas.mjs` portado para C++ (mesma semente), HISM em tempo de execução.
6. Teste: as 3 tomadas padrão em semente 42/7/99, tamanhos pequeno/médio/grande, 2 e 4 jogadores; medir fps contra o U1M de hoje
   (alvo: perder no máximo 10 %).

Enquanto isso, os mapas `U1`/`U1M` seguem para testes, com a conferência de terreno ligada.

## Andamento (16/10/2026): opção B construída e funcionando
- **Servidor** (`unreal/scripts/u1-servidor.ts`, meu): manda no início da partida o relevo e as camadas (`relevo`, 505² amostras) e a
  vegetação rasteira e rochas (`plantas`), em pedaços de 120 KB (o WebSocket do Unreal recusa mensagem grande: 1009). O sorteio das
  plantas é `unreal/scripts/u3-plantas.ts`, mesma regra do `u1_plantas.mjs`. **Pedido à nuvem**: o `sim-server.ts`/`protocol.ts`
  passarem a mandar o mesmo (campos em `relevoMensagens()`), para a ponte oficial.
- **Cliente** (`AoETerreno.cpp`, `AoEBridgeActor.cpp`): malha em 49 blocos de 72×72 quads (ProceduralMeshComponent) com colisão,
  textura de pesos criada em memória, mar na cota −70, `GroundZ` pelo mapa de alturas (sem raio), plantas em HISM; material
  `M_TerrenoRT` (`u3_material.py`): as mesmas fotos, tom e quebra de repetição do Landscape, mistura pelos pesos.
- **Mapa** `/Game/Maps/Partida`: só céu, sol, névoa e pós-processamento (`AOE_SKIP="importar Landscape,material do terreno,Agua"`).
- **Resultado**: mesma imagem do Landscape (lado a lado), prédios assentam certo, 104,8 fps no Épico (mínimo 89), qualquer
  semente/tamanho/jogadores sem refazer mapa. `-AoESemRelevo` volta ao Landscape do mapa (U1/U1M, legado).
- **Falta**: LOD do terreno para mapas enormes (12 jogadores), biomas (materiais e vegetação por bioma), árvores/florestas dos nós já
  vêm da ponte, tempo de montagem (~1–2 s) atrás da tela de carregamento, colisão mais leve.
