# 0008 — Unreal U1: a fatia bonita (visual de jogo moderno, nada pixelado)
- de: nuvem · aberto: 2026-10-13 · prioridade: alta
- referência de qualidade, dada pelo dono em 13/10/2026: um print de um jogo de carro feito por ele no **Unreal 5** (Lumen,
  céu e nuvens reais, materiais PBR com reflexo, sombras suaves, resolução limpa). **Esse é o nível exigido para o
  Age of Earth.** O jogo web de hoje (sprites 2D do bake) é considerado "feio" e **não** serve de alvo de arte.
- o dono autoriza usar Unreal ou Unity, "o que for preciso". A decisão de setembro/outubro continua: **Unreal 5**.

## O que a simulação já tem (nuvem, tudo em `src/core`, pronto e testado; a ponte `npm run unreal:sim` entrega os tipos no `hello`)
- **8 Eras** (Arcaica, Clássica, Helenística, Bizantina, Pólvora, Iluminismo, Industrial, Moderna) com Biblioteca e árvore
  de estudos; Titãs na Era VIII pelo Portal. A campanha (12 missões) fica nas Eras I–IV.
- **Unidades**: 10 linhas de unidade × 8 degraus (da falange e do hoplita ao fuzileiro, tanque e artilharia), cidadão,
  Mercador, Caravana, os 5 heróis e o Rei.
- **Criaturas míticas (25)**: as de hoje (Pégaso, Minotauro, Centauro, Ciclope, Mantícora, Hidra, Leão de Nemeia,
  Medusa, Colosso, Quimera, Cérbero, Sentinela, Sombra) e as novas da E6 (Sátiro, Empusa, Lâmpade, Harpia e Dragão de
  Triptólemo voando, Fênix voando e renascendo, Grifo voando, Erínia, Hipocampo e Escila no mar, Ceto anfíbio, Talos);
  3 Titãs (Prometeu, Oceano que anda no mar, Cronos).
- **Mar**: baixio, navios de pesca, transportes, mercantes e a linha de guerra (Pentecôntero → Encouraçado), mapas
  Costeiro, Ilhas e Mediterrâneo; Estaleiro. **Comércio** por caravanas. **20 maravilhas** (Eras I–VIII).
- **Poderes (21)** com efeitos de área e de duração (raio, tempestade, terremoto, maremoto, vendaval, carro do sol,
  primavera, pânico, etc.), **18 deuses menores** e Bênçãos do Templo.
- **Recursos**: comida, madeira, pedra (calcário), ouro, petróleo (nafta e jazidas), Conhecimento, Favor, e 7 raros.

## Faça, pela ordem (marco **U1**), e responda em `art/meshy/canal/respostas/0008.md` (pode ser em partes)
1. **Terreno de verdade**: texturas reais (Megascans/Quixel pelo Fab, ou ambientCG/Poly Haven CC0) nas 4 camadas
   (grama mediterrânea, terra, areia, rocha), com variação, normal e roughness; Landscape com Nanite onde fizer sentido;
   água do plugin Water com ondas e espuma na margem (voltar ao `WaterBodyOcean`, anotado na resposta do 0006).
2. **Vegetação e cenário**: oliveiras, ciprestes, pinheiros, maquis, capim e flores com Foliage/PCG, instanciados,
   com vento; rochas e penhascos; árvores e nós de recurso do jogo (`tree`, `gold`, `limestone`, frutas) trocados por
   malhas reais, no mesmo lugar dos nós.
3. **Uma cidade grega Arcaica e Clássica** com modelos reais (Fab/Megascans, CC0 ou CC BY 4.0; **nada de licença
   proibida**, registre em `art/meshy/catalogo.json`): Centro Cívico, casa, templo, celeiro, serraria, mina, quartel,
   muralha com portão e torre, em obra/pronto/danificado. Pode partir dos `.glb` do Meshy que já estão em `art/meshy/`.
4. **Hoplitas e cidadãos animados** (esqueleto, ocioso/andar/atacar/morrer, equipamento visível, cor do time), com a
   animação dirigida pelo estado que a ponte já manda (`px,py,s`); câmera de jogo inclinada com zoom.
5. **Luz e pós-processo** como no print de referência: Lumen, sombras suaves, névoa, nuvens, ciclo de dia opcional,
   anti-serrilhado temporal (**nenhum pixel visível, nenhuma borda serrilhada, nenhuma textura borrada**).
6. **Medir** (build empacotado, 1920×1080, preset Alto): quadros/s, tempo de GPU, memória de vídeo, com 200 unidades em
   campo; anote os números. Meta de partida: ≥ 60 quadros/s na RTX 4070 Ti.
7. **Capturas** `HighResShot 2` (1920×1080) em `unreal/capturas/u1-*.png` e um vídeo curto: terreno com luz, a cidade, uma
   batalha de hoplitas, o mar. Ponha ao lado uma captura do jogo web de hoje (`docs/art/`) para o dono comparar.

## Portão de decisão
Ao fim do U1 o dono decide se o jogo segue todo no Unreal (U2 = Eras I–IV completas, U3 = Eras V–VIII com as 25
criaturas, o mar, os navios e as 20 maravilhas, U4 = desempenho, Steam e Early Access). **Se faltar campo na ponte**
(rotação, estado de animação, tipo de ataque, dados de visão/névoa), **peça** num pedido de volta em vez de mexer em
`scripts/unreal/`.

Regras: só arquivos em `unreal/` e `art/meshy/`; a simulação e os guias `docs/` são da nuvem. Sem gastar créditos do
Meshy. Sem licença que proíba uso comercial.
