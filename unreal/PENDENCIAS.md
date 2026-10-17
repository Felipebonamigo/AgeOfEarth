# Pendências do Unreal (14/10/2026, após o U1)

Decisão do dono em 14/10/2026: **seguir no Unreal**. Itens que a sessão local não conseguiu fechar, para depois:

## Arte e animação
- **Criaturas sem esqueleto** (hidra, fênix, harpia, Pégaso, Cronos, máquinas, navios): desde 14/10 com movimento procedural por tipo (pairar, ondular, passada pesada, balanço no mar). Asas batendo e pescoços da hidra ainda pedem rig próprio. A hidra do Meshy vem com um pedestal de estátua embaixo: trocar de modelo. Caminho: rig próprio no Blender (instalado: Blender 5.2) ou outro modelo. Cavalaria, heróis, felinos, gigantes, dragão e grifo já animam (Mesh2Motion, 14/10).
- ~~Casa de telhado vermelho~~ **resolvida em 17/10**: o original (700 mil triângulos) já estava em `C:\Users\Felip\meshy-originais`; soldado sem normais + simplify topológico a 130 mil + textura 2048 JPEG (`house__greek-tavern_hq.glb`, 8 MB) fica limpo de perto e entrou como 2ª variante de `house` (junto da casa caiada).
- ~~Orientação das unidades~~ (14/10): `-AoEVitrine -AoEVitrineAndar` põe os 31 tipos andando para +X; uma tomada por tipo (`AOE_VITRINE` no log dá a posição) com a câmera em +X. 30 de 31 andavam de frente; a **mantícora** andava de lado e foi para yaw −135 no catálogo. Armas ficam como vieram nos modelos.
- **Efeitos**: flechas, pedras, poeira, fumaça e fogo por instâncias; cada poder com anel/faíscas/coluna próprios (14/10). Faltam: espuma clara (o `M_Poeira` só escurece; maremoto e vendaval saem cinza), faíscas de bronze no golpe, respingo/rastro de navio; Niagara de verdade pelo MCP numa sessão nova.
- **Ciclo de dia e variação de céu**; ajuste fino de contraste dos campos.
- **Nanite desligado** em folhagem/vento (73 malhas) por causa de travamento de GPU (`u1_nanite.py`); reavaliar em versão nova do motor.
- ~~Risco: copas no Nanite~~ **confirmado e resolvido em 15/10**: na build, vistas largas travavam a GPU
  (DXGI_ERROR_DEVICE_HUNG, trilha em `RenderVirtualShadowMaps(Nanite)`). Teste A/B nas mesmas condições: folhas no Nanite = 8
  travas em 17 rodadas (com e sem tesselação/raster programável, que não eram a causa); fora do Nanite = 0. As duas árvores
  saíram do Nanite e ganharam 4 LODs gerados (`u2_arvore.py`); `M_Folha` sem a flag de Nanite (`AOE_SEM_NANITE`). Sombras
  virtuais seguem ligadas (desligá-las derrubava o Épico para 29 fps).
- ~~Modelos a rebaixar do Meshy~~ **feito em 17/10** com os originais de `C:\Users\Felip\meshy-originais` (sem conta logada): serraria Thatchwood (1,7 mi → 130 mil, `lumber_camp__thatchwood-sawmill_hq.glb`) ficou ótima e substituiu a de 90 mil no Unreal; a Serenity (3,5 mi) segue em cacos mesmo a 150 mil e foi descartada de vez (a malha é sopa de triângulos). Procedimento: node + @gltf-transform + meshoptimizer (weld sem normais → simplify → compactar vértices → normais → textura JPEG 2048). Falta o celeiro: `granary__desert-oasis` é estilizado; buscar um celeiro/armazém grego realista na galeria CC0 (download livre, só avisar).
- ~~Árvores do Meshy facetadas de perto~~: resolvido em 14/10 com a island_tree_02 do Poly Haven (CC0, Nanite, folhas sem vento). Falta variedade: uma segunda espécie realista (oliveira, pinheiro-manso) no mesmo esquema.
- **Canteiro de obras** (referência do Rise of Kingdoms, 14/10): andaime de madeira, blocos de pedra, obra subindo de baixo para cima com a tampa de pedra no corte, guindaste grego com bloco subindo e descendo e carroça (obras de 3+ tiles), estradas de terra. Falta: cidadãos carregando blocos até a obra.
- **Muralhas e portões** não têm andaime (a pegada em zigue-zague deixava postes soltos); só sobem pelo recorte.

- **Cor de time no corpo** (14/10): o vermelho saturado da textura vira a cor do dono. Modelos sem pano vermelho (catafrata,
  cidadãs, arqueiros de branco) quase não mudam; para eles, máscara pintada no Blender.

- **Modelos próprios** para os 78 tipos que usam visual emprestado (`Dados/apelidos.json`): prioridade navios (todos são o
  galeão), maravilhas novas e as unidades da pólvora em diante (mosqueteiros, canhões, tanque). Precisa de modelos (Meshy com a
  conta do dono ou CC0).

- **U3 em andamento** (ver `U3-TERRENO-RUNTIME.md`): terreno, plantas e mar gerados na partida (`/Game/Maps/Partida`); pedir à nuvem que a ponte
  oficial mande `relevo`/`plantas` como o `u1-servidor.ts`. Próximos: biomas, LOD para mapas enormes.

- **CitySample** (projeto da Epic no PC do dono: `D:CitySample (movido pelo dono em 17/10; antes no OneDrive)`; licença Epic, só para jogo feito no Unreal): cidade moderna
  (Megascans: prédios modulares, asfalto, hidrantes). Pouco serve para o jogo grego. Candidatos: `Surfaces` (Stucco_Wall, Stone_Tiles_Facade,
  Patterned_Stone_Tiles, Gravel, sand, Wooden_Planks, Damaged_Wall_Plaster) para materiais e entulho (`Concrete_Rubble`, `Broken_*`) para
  ruínas. Migrar só o necessário (Content Browser > Migrate), nunca o projeto inteiro (OneDrive, muitos GB).

## Engenharia
- ~~Terreno do mapa médio exportado com 2 jogadores~~ (15/10): `unreal/scripts/u2-exportar-terreno.ts --players N`; U1M refeito com 4.
  O cliente avisa se a ponte mandar outro terreno (`Dados/mapas.json`). **Para o jogo de verdade** (qualquer semente, tamanho e
  número de jogadores) o relevo tem de ser montado no Unreal em tempo de execução a partir do hello (heightmap + camadas), não por
  mapa pré-construído: decisão de arquitetura para o U3.
- Cook leva só pastas explícitas (`DirectoriesToAlwaysCook`); os control rigs/ABP do Third Person estão quebrados (apontam para outra pasta) e ficam de fora.
- `-AoEPerfLog=` não grava arquivo na build (lê-se o log do jogo); VRAM por processo não medida (só `nvidia-smi` da placa).
- Mouse/gameplay no Unreal (U2a/U2b, 14/10): seleção, ordens, construir (B), treinar, poderes (G), Era (E), grupos, HUD e minimapa feitos. Faltam a névoa de guerra e o custo no menu de construção (campos da ponte pedidos à nuvem na resposta 0009).
- ~~Licenças para `docs/LEGAL.md` §4 (nuvem): Poly Haven (CC0) e Manny/Quinn + animações da Epic~~ (já registradas em `docs/LEGAL.md` §4, conferido 17/10).

## Depende do dono
- **DLSS (NVIDIA)**: o dono vai entrar no developer.nvidia.com, aceitar a licença e baixar o plugin do UE 5.8 em Downloads; instalar só no projeto como o FSR e medir.
- **FSR**: instalado e desligado (ver REVISAO §13). Para recriar a pasta: baixar o zip da gpuopen.com, copiar `FSR-580/FSR` para `unreal/AgeOfEarthUE/Plugins/FSR` (extrair com `tar`, o `unzip` do Git Bash ignora as subpastas).
- Aprovar o escopo do **U2** (`unreal/U2-PLANO.md`).
- Conta do Fab/Megascans (opcional; hoje tudo vem do Poly Haven CC0).
