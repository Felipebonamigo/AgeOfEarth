# Lista de assets de arte e áudio (briefing para artistas) — Fase 2

Estilo proposto: 2.5D pintado, vista de cima com leve inclinação (como Age of Mythology/Age of Empires), paleta
quente (mármore, bronze, terracota, oliva), contornos suaves. Tile base de **32×32 px** (zoom 1); sprites entregues em
**2× (64 px por tile)** em PNG com transparência, atlas por categoria. Cor do jogador via máscara separada (canal de
cor de time) para tingir capas, estandartes e detalhes.

## Unidades (34) — 8 direções × animações
Animações por unidade: parado (4 quadros), andar (8), atacar (6), morrer (6). Cidadão: também carregar (8) e
construir/coletar (6). Unidades voadoras (Pégaso): planar (6). Tamanho de referência por classe:

| Classe | Unidades | Tamanho (tiles) |
|---|---|---|
| Civis | Cidadão, Batedor | 0.6–0.7 |
| Infantaria | Hoplita, Hipaspista, Mirmidão, Milícia, Peltasta | 0.6 |
| Arqueiros | Toxota, Arqueiro Cretense | 0.6 |
| Cavalaria | Hipeu, Hetairo | 0.8 |
| Cerco | Petróbolo, Helépole | 1.0–1.2 |
| Heróis | Jasão, Odisseu, Héracles, Aquiles, Perseu | 0.7 (silhueta distinta, capa colorida) |
| Míticos | Pégaso, Minotauro, Centauro, Ciclope, Mantícora, Hidra (5 cabeças progressivas), Leão de Nemeia, Medusa, Colosso, Quimera, Cérbero, Sentinela, Sombra | 0.8–1.4 |
| Titãs | Prometeu, Oceano, Cronos | 2.2 (4 direções bastam) |

## Edifícios (21) — estados: em construção (3 estágios), concluído, danificado (2 níveis), destroços
Centro Cívico (3×3), Casa (2×2), Fazenda (2×2, 3 estágios de plantio), Celeiro, Serraria, Mina (2×2), Mercado (3×3),
Templo (3×3, brilho no altar), Quartel, Estábulo, Oficina de Cerco, Academia (3×3), Torre (1×1), Muralha (1×1, com
variações de conexão: reta, canto, T, cruz), Portão (1×1, aberto/fechado), Fortaleza (4×4), Estátua de Zeus, Templo de
Ártemis, Colosso de Rodes (4×4), Portal dos Titãs (5×5, animação de abertura), Cornucópia (2×2).

## Terreno e recursos
Tileset com transições (grama, terra, areia, água rasa, água profunda animada 4 quadros, montanha), 4 variações por
tipo; árvores (3 espécies, 2 tamanhos, tocos), arbustos de frutas (cheio/vazio), veio de ouro (3 estágios), cervos
(animação parado/comer), javalis, Pedra de Poseidon; decorações (pedras, flores, colunas caídas, ruínas).

## Interface
HUD temático (mármore e bronze): barra de recursos com 5 ícones, painel de seleção, grade de comandos 5×4, minimapa
com moldura, painel de poderes divinos, caixa de diálogo com retrato; ícones (48×48): 34 unidades, 21 edifícios, 65
tecnologias, 12 poderes, 5 recursos, posturas; retratos (256×256) dos 3 deuses maiores e 9 menores; cursores (normal,
atacar, construir, poder, inválido); telas: menu principal (ilustração de fundo), carregamento, vitória/derrota;
fonte com acentos PT/EN; logo.

## Efeitos
Poderes (12): raio, isca, sentinelas, restauração, trégua, pestilência, oráculo, bronze, maldição, tempestade,
abundância, terremoto; projéteis (flecha, dardo, pedra, espinho, fogo); impactos; morte/petrificação; fumaça de
construção; sangue opcional (configurável).

## Áudio
~80 efeitos: seleção/confirmação por classe, ataques por arma, impactos, mortes, construção, coleta (machado,
picareta, colheita), edifício concluído, alerta de ataque, poderes (12), UI; ambiente por bioma (floresta, costa,
montanha); trilha: menu, exploração (3 intensidades por Idade), batalha, vitória, derrota; vozes dos deuses (opcional,
PT/EN).

## Entrega técnica
Atlas PNG 2048×2048 + JSON (formato TexturePacker/Pixi), nomes `unidade_direcao_animacao_quadro`; animações a 10 fps;
âncora no pé da unidade; sombras em camada separada.
