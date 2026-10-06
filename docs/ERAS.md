# Age of Earth — Expansão das Eras (plano de design)

Decisões do dono (06/10/2026):

- **História inteira, como no Rise of Nations**: da Grécia arcaica até a era do petróleo, com os deuses gregos atravessando
  tudo (a mescla com o Age of Mythology continua: deuses maiores e menores, poderes, criaturas míticas, heróis e Titãs
  usados na guerra em todas as Eras).
- **Tudo na Biblioteca**: as Eras, as 4 linhas e a evolução de cada tipo de unidade se estudam na Biblioteca, **um estudo
  por vez** em cada uma (com fila). A evolução muda a força e a aparência da linha inteira, inclusive das unidades que já
  existem. Não é uma evolução separada e automática: o jogador escolhe o que estudar.
- Recursos: comida, madeira, **pedra**, **petróleo** (a partir de uma Era avançada) e outros.
- **Naval** entra agora (não fica para depois do lançamento).
- **Comércio por caravanas**: sim.
- **Maravilhas**: umas 20, que façam sentido.

Este documento é o plano; o cronograma está em `docs/ROADMAP.md`. O que já existe está em `docs/DESIGN.md`.

---

## 1. As 8 Eras

| # | Era | Inspiração | Arquitetura | Pessoas e armas | Novidades |
|---|---|---|---|---|---|
| I | **Arcaica** | Idade do Bronze, ~1200–800 a.C. | madeira, adobe, palha | linho, bronze simples, lança e arco | hoplita, toxota, batedor, pentecôntero, barco de pesca |
| II | **Clássica** | Atenas e Esparta, ~500 a.C. | pedra, telha, ordem dórica | couraça de bronze, elmo coríntio | cavalaria, peltasta, trirreme, caravana, 1º deus menor |
| III | **Helenística** | Alexandre, ~300 a.C. | mármore, ordem coríntia | sarissa, companheiros | heróis, cerco (petróbolo, helépole), quinquerreme |
| IV | **Bizantina** | Constantinopla, ~600–1000 | tijolo, cúpulas, mosaico | lamelar, catafractos | **petróleo** (nafta para o fogo grego), dromon, trabuco, universidade |
| V | **Pólvora** | Creta veneziana, ~1450–1600 | fortes estrelados, pedra e reboco | arcabuz, couraça de aço | bombarda, galeão, muralhas abaluartadas |
| VI | **Iluminismo** | ~1700–1800 | neoclássico | mosquete com baioneta, casacas | canhão de campanha, navio de linha |
| VII | **Industrial** | ~1850–1900 | tijolo, ferro, chaminés | fuzil, uniforme | poços de petróleo e refinaria, fábrica, couraçado a vapor |
| VIII | **Moderna** | ~1914–1945 | concreto e aço | capacete de aço, metralhadora | tanque, encouraçado, **Portal dos Titãs** |

- A identidade grega atravessa as Eras: Bizâncio é grego, o neoclássico é o renascimento grego, e os deuses nunca saem.
- **Os Titãs são o clímax da Era Moderna** (como as armas finais do Rise of Nations): o Portal dos Titãs só abre na VIII.
- **Era inicial e Era final configuráveis** na partida (como no Rise of Nations): quem quiser só a Antiguidade mítica joga
  I–III (ou I–IV); a campanha atual continua nas Eras I–IV.
- Ritmo alvo de uma partida padrão (`npm run balance`): II ~4 min, III ~9, IV ~14, V ~20, VI ~26, VII ~33, VIII ~40;
  partida completa em 45–60 min. Deathmatch começa numa Era mais alta.
- As 5 Idades de hoje viram I–IV (Arcaica, Clássica, Heroica→Helenística, Mítica→Bizantina) e a Idade dos Titãs vira a VIII.

## 2. A Biblioteca

A Academia passa a se chamar **Biblioteca** (o id interno `academy` fica, para não quebrar saves, campanha e arte).

- **Um estudo por vez** em cada Biblioteca, com fila de até 5. Mais Bibliotecas (limite 3, uma por cidade) = mais estudos
  em paralelo.
- O que se estuda:
  1. **Avançar de Era** (sai do Centro Cívico e vai para a Biblioteca). Cada avanço pede um número de estudos das linhas
     (como hoje) e escolhe o deus menor da Era (II–VII).
  2. **As 4 linhas** (Militar, Cívica, Comércio, Ciência): passam de 5 para **8 níveis**, um por Era.
  3. **Evolução de cada tipo de unidade** (seção 4): uma por linha por Era — por exemplo, "Infantaria pesada: Falangita".
     Ao terminar, as unidades da linha que já existem se transformam (com a vida proporcional e um efeito de poeira e
     brilho), e o treino passa a sair na versão nova. Cidadãos, navios e batedores também evoluem aqui.
- Continua fora da Biblioteca: as pesquisas de economia (celeiro, serraria, mina, pedreira), as do Templo (divinas) e as
  dos deuses menores.
- Conhecimento vem dos estudiosos na Biblioteca (como hoje) e, a partir da IV, da **Universidade**.
- A interface ganha a **árvore de estudos** (tela inteira, por Era e por linha), com o que está liberado, em andamento e
  bloqueado.

## 3. Recursos

| Recurso | Fonte | Desde | Uso principal |
|---|---|---|---|
| Comida | caça, frutas, fazendas, **pesca** (barcos de pesca) | I | cidadãos, unidades, Eras |
| Madeira | árvores (serraria) | I | edifícios, arqueiros, cerco, navios |
| **Pedra** | afloramentos de calcário e mármore (**pedreira**) | I | muralhas, torres, fortalezas, Templo, maravilhas, Eras |
| Ouro | veios (mina), **caravanas e navios mercantes**, mercado, recursos raros | I | militares, estudos, heróis |
| Conhecimento | estudiosos na Biblioteca, Universidade | I | estudos e Eras |
| Favor | cidadãos rezando no Templo, maravilhas | I | míticos, heróis, poderes, pesquisas divinas |
| **Petróleo** | IV: fontes de nafta e betume (as de Zacinto, que Heródoto descreve); VII: poços e refinaria | IV | fogo grego, cerco incendiário, navios a vapor, tanques, artilharia |

- **Recursos raros** (como no Rise of Nations): marcados no mapa — oliveiras (azeite), vinhedos, mármore de Paros, sal,
  cavalos selvagens, cobre, peixes raros, incenso. Um Mercador ocupa o raro, que rende ouro e um bônus (azeite: comida
  das fazendas +; cavalos: cavalaria mais barata; mármore: edifícios mais resistentes…).
- O gerador de mapas e o editor distribuem pedra, nafta e raros com a mesma justiça por início que já valem para ouro e
  madeira (`map:check` com a tabela por início).
- A barra do topo passa a mostrar 7 recursos (o petróleo só aparece a partir da IV).

## 4. Linhas de unidade (evolução na Biblioteca)

As unidades de hoje viram o primeiro degrau das linhas (os ids continuam: `hoplite`, `hypaspist`, `toxotes`…).

| Linha | I | II | III | IV | V | VI | VII | VIII |
|---|---|---|---|---|---|---|---|---|
| Cidadão | Cidadão (linho, bronze) | túnica e ferramentas de ferro | … | … | … | … | operário | operário moderno |
| Batedor | Batedor | Batedor | Pródromo | Trapezita | Estradiota | Hussardo | Batedor montado | Motociclista |
| Infantaria pesada | **Hoplita** | **Hipaspista** | Falangita | Escutato | Piqueiro | Granadeiro | Fuzileiro | Infantaria |
| Tiro | **Toxota** | **Arqueiro Cretense** | Fundibulário Ródio | Tocsota bizantino | Arcabuzeiro | Mosqueteiro | Atirador | Metralhador |
| Escaramuça | — | **Peltasta** | Tureóforo | Acrita | Rodeleiro | Caçador | Infantaria ligeira | Comando |
| Cavalaria | — | **Hipeu** | **Hetairo** | Catafracto | Couraceiro | Dragão | Lanceiro | **Tanque** |
| Elite (Fortaleza) | — | — | **Mirmidão** | Atânato | Cavaleiro de Rodes | Granadeiro da Guarda | Evzone | Batalhão Sagrado |
| Arremesso | — | — | **Petróbolo** | Trabuco / Sifão de fogo grego | Bombarda | Canhão de campanha | Obus | Artilharia autopropulsada |
| Assalto a muralhas | — | — | **Helépole** | Aríete coberto | (a pólvora aposenta) | | | |
| Navio de guerra | Pentecôntero | Trirreme | Quinquerreme | Dromon (fogo grego) | Galeão | Navio de linha | Couraçado | Encouraçado |
| Barcos | Barco de pesca, Transporte | | Navio mercante | | | | (vapor) | |

- Em negrito, as que já existem. A tabela mantém o pedra-papel-tesoura de hoje em todas as Eras: infantaria pesada >
  cavalaria > tiro > infantaria; escaramuça > tiro; cerco > edifícios.
- Sem aviões: o céu é dos míticos voadores (seção 6). Decisão revisável depois.
- Os 5 heróis continuam lendários em qualquer Era (recebem as Bênçãos do Templo, seção 6).

## 5. Edifícios por Era

- **Todo edifício muda de aparência a cada Era** (hoje só o Centro Cívico muda). Para isso caber, o rig de edifícios
  ganha um **kit de Era**: cada edifício descreve a planta uma vez (volumes, telhado, portas, pátios) e o kit da Era a
  veste (madeira e adobe → pedra e telha → mármore → tijolo e cúpula → reboco e baluarte → neoclássico → tijolo, ferro e
  chaminé → concreto e aço). Obra, dano, escombros, fumaça, fantasma e ícone continuam como hoje.
- A aparência segue a Era do **dono**: ao avançar, os edifícios dele trocam com poeira; os do inimigo mostram a Era dele.
- Os edifícios também evoluem em função: torre → torre de canhão → casamata; fortaleza → castelo → forte estrelado →
  forte; muralha: paliçada → pedra → teodosiana → baluarte → concreto.
- Edifícios novos: **Pedreira** (entrega de pedra), **Estaleiro** (navios), **Universidade** (IV, Conhecimento),
  **Poço de nafta** (IV) e **Poço de petróleo + Refinaria** (VII), **Fábrica** (VII, acelera a produção como no Rise of
  Nations), **Posto de raro** (o Mercador).
- VRAM: cada partida só carrega as Eras em jogo (como as unidades por tipo de hoje); o `art:check` mede por Era.

## 6. A mitologia em todas as Eras (a mescla com o Age of Mythology)

- **Deus maior** no início (Zeus, Poseidon, Hades), com os bônus de hoje e novos para naval e pólvora.
- **Deus menor a cada avanço da II à VII** (6 escolhas, 2 opções por Era para cada deus maior): os 9 de hoje + **9 novos**.
  Cada um traz um poder, uma criatura mítica e 2 pesquisas.

| Era | Deuses menores | Poder | Criatura |
|---|---|---|---|
| II | Atena · Hermes · Ares (hoje) | Restauração · Trégua · Pestilência | Minotauro · Centauro · Ciclope |
| III | Apolo · Dionísio · Afrodite (hoje) | Oráculo · Pele de Bronze · Maldição | Mantícora · Hidra · Leão de Nemeia |
| IV | Hera · Hefesto · Ártemis (hoje) | Tempestade de Raios · Abundância · Terremoto | Medusa · Colosso · Quimera |
| V | **Pã** · **Hécate** · **Perséfone** | Pânico (inimigos fogem) · Encruzilhada (teleporta um grupo) · Primavera (os mortos da área voltam como Sombras) | Sátiros · Empusas · Lâmpades |
| VI | **Éolo** · **Tritão** · **Deméter** | Vendaval (empurra e para navios, apaga incêndios) · Maremoto · Colheita Divina | Harpias (voadoras) · Hipocampos (navais) · Dragões de Triptólemo (voadores) |
| VII | **Hélio** · **Nice** · **Nêmesis** | Carro do Sol (faixa de fogo) · Vitória Alada (+ataque) · Retribuição (devolve o dano) | Fênix (voadora, renasce) · Grifos (voadores) · Erínias |

- **Os poderes crescem com a Era** (+15 % de dano, área ou duração por Era): o Raio de Zeus continua decidindo batalhas
  na Era Moderna.
- **Bênçãos do Templo**: uma por Era, fortalecem criaturas míticas e heróis (vida, ataque, armadura) — um Minotauro
  abençoado ainda enfrenta fuzileiros. O Colosso de Hefesto vira **Talos** na Era Industrial.
- Míticos navais: Hipocampos, **Escila** (Poseidon) e **Ceto**; o Titã Oceano luta no mar. Míticos voadores fazem o papel
  dos aviões: Pégaso, Harpias, Grifos, Fênix, Dragões de Triptólemo.
- **Titãs**: Era VIII, pelo Portal dos Titãs (Prometeu, Oceano, Cronos), como hoje.

## 7. Comércio

- **Caravanas** (treinadas no Mercado, desde a II): vão e voltam entre as suas cidades e os mercados aliados; cada viagem
  rende ouro pela distância (como no Rise of Nations). São alvo fácil — escolta e fronteiras importam.
- **Navios mercantes** (Estaleiro, III): a mesma coisa por rotas marítimas entre portos.
- Mercado continua comprando e vendendo; recursos raros rendem ouro com o Mercador (seção 3).

## 8. Naval

- Água navegável no mapa (águas rasas e profundas), com pathfinding próprio para navios; Estaleiro na margem.
- Barcos de pesca (comida em cardumes), **transporte** (embarcar e desembarcar exércitos), navios mercantes e a linha de
  navios de guerra (seção 4), que atacam outros navios e a costa.
- Tipos de mapa novos: **Costeiro**, **Ilhas** (pendente desde o 5.1) e **Mediterrâneo**; o Egeu ganha mar navegável.
- IA naval (pesca, defesa do litoral, desembarque); justiça de posição nos mapas com mar (mesmos testes de hoje).
- Poseidon ganha bônus navais; Tritão (VI) e o Farol de Alexandria reforçam o mar.

## 9. As 20 maravilhas

Cada maravilha é **única no mapa** (quem termina primeiro fica com ela, como no Rise of Nations) e tem um efeito. As 3 de
hoje continuam. A vitória por maravilha passa a ser por **pontos de maravilha** (Eras mais altas valem mais), com a regra
de hoje ("manter por 6 minutos") como opção.

| Era | Maravilha | Efeito proposto |
|---|---|---|
| I | Porta dos Leões de Micenas | muralhas e portões +50 % de vida; fronteiras +2 |
| I | Labirinto de Cnossos | inimigos no seu território andam 25 % mais devagar; Minotauros mais baratos |
| I | Santuário de Delfos | Oráculo grátis (revela o mapa por 20 s) a cada 3 min; Favor +20 % |
| II | Partenon | Conhecimento +25 %; infantaria +10 % de vida |
| II | Estátua de Zeus em Olímpia (já existe) | Favor +50 % |
| II | Templo de Ártemis em Éfeso (já existe) | criaturas míticas +25 % de vida |
| II | Teatro de Epidauro | unidades se curam no seu território (Asclépio) |
| III | Colosso de Rodes (já existe) | fronteiras +4; edifícios +20 % de vida |
| III | Mausoléu de Halicarnasso | heróis mortos renascem no Templo depois de 30 s |
| III | Farol de Alexandria | litoral revelado; navios +15 % de velocidade e visão; rotas marítimas rendem mais |
| III | Biblioteca de Alexandria | estudos 25 % mais baratos; +1 vaga de estudo simultâneo por Biblioteca |
| IV | Hagia Sophia | Favor +; o atrito inimigo no seu território dobra |
| IV | Muralhas de Teodósio | muralhas e torres +100 % de vida e +1 de alcance |
| IV | Mosteiros de Meteora | Conhecimento +30 %; edifícios no alto mais resistentes |
| V | Arsenal de Cândia (Creta) | navios 30 % mais baratos e mais rápidos de construir |
| V | Fortaleza dos Cavaleiros de Rodes | fortalezas +50 % de vida e ataque; elite da Fortaleza mais barata |
| VI | Forte de Palamidi (Náuplia) | artilharia e torres +50 % de alcance de visão e +1 de alcance |
| VII | Canal de Corinto | navios atravessam o istmo; caravanas e navios mercantes +50 % de ouro |
| VII | Estádio Panatenaico | unidades ganham patentes de veterania duas vezes mais rápido |
| VIII | Trono do Olimpo | todos os poderes divinos recarregam; +1 uso de cada poder |

## 10. O que muda no código (para planejar o trabalho)

- **Núcleo** (`src/core`): 8 Eras e requisitos; Biblioteca com fila e um estudo por vez; avanço de Era na Biblioteca;
  4 linhas × 8 níveis; tabela de linhas de unidade (tipo → linha → degrau) e a transformação das unidades existentes;
  recursos pedra e petróleo + nós + raros; caravanas e rotas; água navegável, navios, embarque; 9 deuses menores, poderes
  e criaturas novos; Bênçãos; escala dos poderes por Era; 17 maravilhas novas e pontos de maravilha; Era inicial/final na
  configuração. Determinismo como hoje; `SIM_VERSION` sobe; saves antigos ficam incompatíveis (aviso no menu).
- **IA**: ordem de estudos na Biblioteca, evoluções, pedra e petróleo, caravanas, naval, maravilhas; partidas de 60 min
  sem travar; justiça de posição (`tests/position-fairness.test.ts`).
- **Arte** (pipeline de bake de hoje): kit de Era nos edifícios (8 aparências × ~27 edifícios), aparência do cidadão por
  Era, ~50 unidades novas (rigs de arma de fogo com mira e disparo, cavalaria de couraça, canhões, **tanque**, **navios**
  com remos, velas, vapor e esteira na água), 9 criaturas novas, 17 maravilhas (procedural; o Meshy onde ganhar),
  efeitos de tiro, fumaça de pólvora, vapor e chaminés.
- **Interface**: painel da Biblioteca com fila, árvore de estudos, 7 recursos na barra, configuração de Eras na partida,
  enciclopédia e textos PT/EN de tudo (centenas de nomes).
- **Áudio** (sintetizado): pólvora, canhões, motores, vapor, navios, mar.
- **Campanha**: as 12 missões continuam nas Eras I–IV (hoje usam até a Idade Mítica, que vira a IV), mas com a
  aparência limitada à Helenística (`visualEraMax` no cenário: a Titanomaquia não ganha cúpulas bizantinas); os Titãs
  das missões já surgem por roteiro. Uma segunda campanha pela história fica para depois do Early Access.
- **Heróis**: hoje entram nas Idades 0–4; passam a entrar nas Eras I–V (Perseu deixa de depender da Era dos Titãs).

## 11. Ordem de produção

| Etapa | Conteúdo | Resultado jogável |
|---|---|---|
| E1 | Núcleo das Eras e da Biblioteca: 8 Eras, Biblioteca com fila, avanço de Era na Biblioteca, linhas × 8 níveis, Era inicial/final, IA, testes | partida de 8 Eras com arte provisória |
| E2 | Pedra e petróleo (nós, pedreira, poços, custos, mapgen, editor, barra do topo) e recursos raros | economia completa |
| E3 | Linhas de unidade: dados das 11 linhas I–VIII, evolução na Biblioteca, transformação, IA, balanceamento | exércitos de todas as Eras (arte provisória) |
| E4 | Naval: água navegável, Estaleiro, pesca, transporte, navios I–VIII, IA naval, mapas Costeiro/Ilhas/Mediterrâneo | guerra no mar |
| E5 | Comércio: caravanas, navios mercantes, Mercador nos raros | rotas de ouro |
| E6 | Mitologia nas Eras: 9 deuses menores novos, poderes, 9 criaturas (navais e voadoras), Bênçãos, escala dos poderes | panteão completo |
| E7 | Maravilhas: as 17 novas + pontos de maravilha (núcleo e arte) | 20 maravilhas |
| E8 | Arte por Era em lotes (I–IV, depois V–VIII): kit de Era nos edifícios, cidadão por Era, unidades novas, navios, tanque, efeitos | tudo com a arte final |
| E9 | Interface: árvore de estudos, painel da Biblioteca, enciclopédia, textos PT/EN | (corre junto de E1–E8) |
| E10 | Balanceamento e IA em partidas longas, justiça de posição, desempenho com mais unidades | pronto para o teste público |

Cada etapa sai com testes, `npm run balance`/`smoke`, capturas antes × depois olhadas e commit, como as anteriores.
