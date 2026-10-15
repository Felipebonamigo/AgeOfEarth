# Pendências do Unreal (14/10/2026, após o U1)

Decisão do dono em 14/10/2026: **seguir no Unreal**. Itens que a sessão local não conseguiu fechar, para depois:

## Arte e animação
- **Criaturas sem esqueleto** (hidra, fênix, harpia, Pégaso, Cronos, máquinas, navios): desde 14/10 com movimento procedural por tipo (pairar, ondular, passada pesada, balanço no mar). Asas batendo e pescoços da hidra ainda pedem rig próprio. A hidra do Meshy vem com um pedestal de estátua embaixo: trocar de modelo. Caminho: rig próprio no Blender (instalado: Blender 5.2) ou outro modelo. Cavalaria, heróis, felinos, gigantes, dragão e grifo já animam (Mesh2Motion, 14/10).
- **Casa de telhado vermelho** (`edificios/house__greek-tavern.glb`): malha estilhaçada de perto (simplificada de 565 mil para
  87 mil triângulos com `simplifySloppy`). Baixar de novo o original do Meshy (URL em `art/meshy/catalogo.json`) e reduzir com
  mais cuidado (200–300 mil, Nanite aguenta). **Fora do catálogo desde 14/10** (só a casa caiada aparece).
- ~~Orientação das unidades~~ (14/10): `-AoEVitrine -AoEVitrineAndar` põe os 31 tipos andando para +X; uma tomada por tipo (`AOE_VITRINE` no log dá a posição) com a câmera em +X. 30 de 31 andavam de frente; a **mantícora** andava de lado e foi para yaw −135 no catálogo. Armas ficam como vieram nos modelos.
- **Efeitos**: flechas, pedras, poeira, fumaça e fogo por instâncias; cada poder com anel/faíscas/coluna próprios (14/10). Faltam: espuma clara (o `M_Poeira` só escurece; maremoto e vendaval saem cinza), faíscas de bronze no golpe, respingo/rastro de navio; Niagara de verdade pelo MCP numa sessão nova.
- **Ciclo de dia e variação de céu**; ajuste fino de contraste dos campos.
- **Nanite desligado** em folhagem/vento (73 malhas) por causa de travamento de GPU (`u1_nanite.py`); reavaliar em versão nova do motor.
- ~~Risco: copas no Nanite~~ **confirmado e resolvido em 15/10**: na build, vistas largas travavam a GPU
  (DXGI_ERROR_DEVICE_HUNG, trilha em `RenderVirtualShadowMaps(Nanite)`). Teste A/B nas mesmas condições: folhas no Nanite = 8
  travas em 17 rodadas (com e sem tesselação/raster programável, que não eram a causa); fora do Nanite = 0. As duas árvores
  saíram do Nanite e ganharam 4 LODs gerados (`u2_arvore.py`); `M_Folha` sem a flag de Nanite (`AOE_SEM_NANITE`). Sombras
  virtuais seguem ligadas (desligá-las derrubava o Épico para 29 fps).
- **Modelos a rebaixar do Meshy (precisa da conta logada do dono)**: casa-taverna (`house__greek-tavern`) e serraria (`lumber_camp__sawmill-serenity`), as duas tiradas do catálogo em 14/10 por malha estragada na redução; com o original dá para reduzir a 200–300 mil triângulos sem `simplifySloppy` (o Unreal aguenta com Nanite). Celeiro (`granary__desert-oasis`) é estilizado (palmeiras, areia): buscar um celeiro/armazém grego realista na galeria CC0. O navegador embutido não está logado no Meshy; usar o Chrome do dono com o ok dele.
- ~~Árvores do Meshy facetadas de perto~~: resolvido em 14/10 com a island_tree_02 do Poly Haven (CC0, Nanite, folhas sem vento). Falta variedade: uma segunda espécie realista (oliveira, pinheiro-manso) no mesmo esquema.
- **Canteiro de obras** (referência do Rise of Kingdoms, 14/10): andaime de madeira, blocos de pedra, obra subindo de baixo para cima com a tampa de pedra no corte, guindaste grego com bloco subindo e descendo e carroça (obras de 3+ tiles), estradas de terra. Falta: cidadãos carregando blocos até a obra.
- **Muralhas e portões** não têm andaime (a pegada em zigue-zague deixava postes soltos); só sobem pelo recorte.

- **Cor de time no corpo** (14/10): o vermelho saturado da textura vira a cor do dono. Modelos sem pano vermelho (catafrata,
  cidadãs, arqueiros de branco) quase não mudam; para eles, máscara pintada no Blender.

## Engenharia
- Terreno do mapa médio exportado com 2 jogadores (`scripts/unreal/export-terrain.ts`, da nuvem): pedir `--players N` à nuvem.
- Cook leva só pastas explícitas (`DirectoriesToAlwaysCook`); os control rigs/ABP do Third Person estão quebrados (apontam para outra pasta) e ficam de fora.
- `-AoEPerfLog=` não grava arquivo na build (lê-se o log do jogo); VRAM por processo não medida (só `nvidia-smi` da placa).
- Mouse/gameplay no Unreal (U2a/U2b, 14/10): seleção, ordens, construir (B), treinar, poderes (G), Era (E), grupos, HUD e minimapa feitos. Faltam a névoa de guerra e o custo no menu de construção (campos da ponte pedidos à nuvem na resposta 0009).
- Licenças para `docs/LEGAL.md` §4 (nuvem): Poly Haven (CC0) e Manny/Quinn + animações da Epic (só dentro de jogo feito no Unreal).

## Depende do dono
- Aprovar o escopo do **U2** (`unreal/U2-PLANO.md`).
- Conta do Fab/Megascans (opcional; hoje tudo vem do Poly Haven CC0).
