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

## Tempo de carregamento e dois defeitos achados (16/10/2026)
- Servidor: relevo + plantas em 0,2–0,3 s (mapa grande incluso). Cliente: montar a malha levava **15,4 s** (colisão dos 49 blocos na
  thread do jogo); com `bUseAsyncCooking` caiu para **1,3 s**. O fps em jogo é o do mapa antigo (altura do chão agora sem traço de raio).
- O `M_TerrenoRT` não era cozido (só carregado por código): a build ficava com o material padrão cinza. `/Game/Terreno` entrou em
  `DirectoriesToAlwaysCook` e a conferência do `u1-empacotar.sh` falha em "sem /Game/…".
- As copas das árvores sumiam de longe (LODs com menos de ~10 % dos triângulos colapsam os cartões de folha; já no mapa antigo). LODs
  agora 22 %/9 %/4,5 %/2,2 %: copas de volta, Épico ~75–80 fps (era ~105 sem copa de longe). Pendência: copa simplificada própria para a
  distância (mais barata que reduzir a malha).

## Biomas (16/10/2026): Ática e Egeu
- `Dados/biomas.json`: cada bioma troca as tintas das 4 camadas do terreno (`Tom_grass/dirt/sand/rock` no `M_TerrenoRT`), as cores
  do mar (`CorRaso/CorFundo` no `M_Mar`) e opcionalmente névoa e sol. A ponte manda o id em `relevo.cab.bioma`
  (`u1-servidor.ts --bioma egeu`); `-AoEBioma=egeu` força no cliente; `-AoESemBioma` desliga (diagnóstico).
- **Ática** = o visual de sempre (verde, tintas neutras). **Egeu** = seco e dourado, calcário claro, mar turquesa forte, sol ×1,12.
- Armadilha: sobrescrever a COR do sol por `SetLightColor` deixou a cena toda amarelada/desbotada mesmo com o valor igual ao do mapa;
  por isso o sol do bioma é só um fator de intensidade (`intensidadeX`).
- Falta: Montanha, Creta árida/Egito e Submundo; vegetação por bioma (oliveiras no Egeu, pinheiros na montanha); escolha automática
  pelo tipo de mapa e opção manual no menu de partida (U4).

## Pinheiro (17/10/2026)
`pine_sapling_small` (Poly Haven, CC0, 3 variantes) importado com LODs, registrado no catálogo, acervo e doc do estúdio, mas **fora da mata**:
com ele as medições deram 52–75 fps contra 74 sem ele, só que outra sessão disputava a GPU e uma rodada sem pinheiro também deu 26 fps.
Para decidir: medir com a máquina livre (`nvidia-smi` < 5 %) e várias rodadas. Para ligar: acrescentar as 3 malhas
`/Game/Vegetacao/pine_sapling_small/pine_sapling_small/StaticMeshes/pine_sapling_small_{a,b,c}` em `nos.tree.malhas`.
`island_tree_03` (4,7 mi de triângulos) derrubou o editor ao gerar LODs: descartada.

## Terceiro bioma: Montanha (17/10/2026)
`--bioma montanha`: grama verde-esmeralda fria, rocha e areia acinzentadas mais claras, mar azul fundo e frio, sol ×0,92, névoa mais densa.
Captura `u3-bioma-montanha.png`. Faltam Creta árida/Egito e Submundo, vegetação por bioma e a escolha pelo menu (U4).

## Quarto bioma: Deserto (17/10/2026)
`deserto` (Egito, Creta árida): areia dourada, rocha de arenito, grama seca ocre-oliva, mar turquesa, sol ×1,22, névoa quente. Captura `u3-bioma-deserto.png` (mapa tipo `desert` com `-AoEBioma=deserto`). A ponte ainda manda `atica` para esse mapa e as árvores e o capim seguem verdes: pedido 0014 à nuvem. Falta só o Submundo.
