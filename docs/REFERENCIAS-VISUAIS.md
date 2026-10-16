# Referências visuais e de interface — Rise of Kingdoms (e outras)

Pedido do dono (16/10/2026): *Rise of Kingdoms* (mobile) é visualmente bonito e tem coisas boas para aproveitar. Este
documento separa **o que copiar como princípio** (leitura, cor, vida, feedback) do que **não** copiar (monetização,
temporizadores, pay-to-win, arte e marca deles). Nada daqui usa arte, nome ou assets do jogo de referência: só ideias.
O alvo de qualidade continua sendo o print do Detonauto no Unreal 5 (Lumen, PBR, imagem limpa). Execução: sessão local
do Unreal (`unreal/PROMPT-SESSAO-LOCAL.md`, pedido `art/meshy/canal/pedidos/0008-unreal-u1-fatia-bonita.md`).

## 1. O que o Rise of Kingdoms faz bem (e vale levar para o PC)

| # | Ideia | Por que funciona | Como entra no Age of Earth |
|---|---|---|---|
| 1 | **Cidade que muda de aparência a cada Era** | O jogador *vê* o progresso sem ler número | Já planejado: arquitetura por Era (U3). Peça ao Unreal 8 "skins" de cidade (Arcaica → Moderna), com a troca animada (andaimes, poeira) quando o avanço de Era termina |
| 2 | **Estilo "realista estilizado"**: cores saturadas e quentes, contraste alto, silhuetas claras | Lê bem de longe e continua bonito de perto | Paleta mediterrânea quente (pedra clara, terracota, azul do Egeu), luz baixa de fim de tarde por padrão; time sempre legível por bandeira/estandarte e faixa de cor |
| 3 | **Mundo vivo parado**: fumaça, bandeiras ao vento, barcos, aves, ondas, ovelhas, gente andando | Mesmo sem ação, a tela "respira" | Ambiente do U1: água Water, vento na vegetação, fumaça de chaminé/forja, aves, barcos de pesca, cidadãos em ciclo de trabalho |
| 4 | **Névoa de guerra pintada**: nuvens/pergaminho que se dissolvem ao explorar | Exploração vira recompensa visual | Névoa volumétrica leve + borda de mapa em estilo "carta náutica grega"; ao revelar, nuvens se abrem |
| 5 | **Marcha com linha e ícone**: caminho desenhado, seta, ícone do comandante, tempo restante | Ordens legíveis sem abrir menu | Linha de rota 3D no chão com o brasão da unidade; já temos a lógica de rota (`route`, caravanas) |
| 6 | **Comandantes/heróis com retrato pintado, brilho e habilidade espetacular** | Herói vira o rosto do jogo | Heróis (Aquiles, Héracles…) com retrato pintado + habilidade Q com VFX grande e legível (já há a Q; refazer em Niagara) |
| 7 | **Feedback de recompensa**: ícones voando para a barra, brilho ao completar obra, números flutuando | Dopamina limpa, sem texto | Coleta com ícone subindo, obra concluída com clarão dourado, avanço de Era com cena curta |
| 8 | **Interface ornamentada mas legível**: molduras douradas/bronze, ícones grandes, poucos números | Parece "jogo caro" | Já temos molduras de bronze com grega; manter, e no Unreal usar UMG com a mesma linguagem (bronze, mármore, azul) |
| 9 | **Missões guiadas / cadeia de objetivos** com destaque na tela | Onboarding sem tutorial chato | Reaproveitar o sistema de falas e objetivos da campanha para uma "cadeia de primeiros passos" opcional na partida rápida |
| 10 | **Câmera**: zoom longo, do mapa-mundo estratégico até o detalhe do soldado, transição suave | Mesma partida serve ao macro e ao micro | Zoom contínuo no Unreal: abaixo de certo nível troca de ícones/marcadores para modelos (LOD + "strategic view") |
| 11 | **Sazonalidade e clima** (neve, chuva, noite) | Variedade visual grátis | Ciclo dia/noite e chuva/tempestade (a Tempestade de Zeus já é poder) com Lumen |
| 12 | **Skins e personalização da capital** (só cosmético) | Dá vontade de caprichar a cidade | Cosmético *sem* venda por ora: estilos de muralha/bandeira desbloqueados por conquistas (já são 40) |

## 2. O que NÃO copiar
- Temporizadores longos, "acelerar com gemas", loja agressiva, loot boxes, competição por gasto: o Age of Earth é PC, compra única (decisão do dono, 11/10/2026).
- Arte, nomes, interface, sons ou marcas do jogo de referência (risco legal e perda de identidade; `docs/LEGAL.md`).
- Controles de toque/mobile como alvo (fora do escopo do primeiro lançamento).
- Câmera travada em ângulo fixo isométrico: o PC permite rotação e inclinação; manter as duas (RTS clássico).

## 3. Como pedir isto ao Unreal (adendo ao pedido 0008)
Na fatia do U1 (e como critério de aceite do U3), a sessão local deve mostrar, com captura ou vídeo curto:
1. **Cidade Arcaica e Moderna lado a lado** (ideia 1), com a troca animada entre elas.
2. **Cena parada viva** por 10 s (ideia 3): fumaça, vento, aves, barco, cidadãos trabalhando.
3. **Zoom contínuo** do mapa inteiro até um hoplita (ideia 10), com fps medido.
4. **Linha de marcha** com brasão e **névoa dissolvendo** (ideias 4 e 5).
5. **Habilidade de herói** em Niagara (ideia 6) e **feedback de coleta/obra** (ideia 7).
6. Fim de tarde como luz padrão e uma variação de noite com tochas (ideia 11).

Cada item vira uma linha na tabela de decisão do U1 (nota de 1 a 5 do dono, comparada com o print do Detonauto).

## 4. Outras referências boas (para o dono confirmar)
*Age of Empires IV* e *Rise of Nations* (leitura do território e das Eras), *Total War: Pharaoh* (cidade e mar), *Civilization VI*
(mapa estilizado legível), *Northgard* (cores e clareza). Diga quais gostar mais e acrescento ao pedido.
