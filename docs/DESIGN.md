# Age of Earth — Documento de design

## Visão
RTS clássico que mistura **Rise of Nations** (progressão por Idades, fronteiras nacionais, atrito, biblioteca de
pesquisas, expansão por cidades) com **Age of Mythology** (deuses maiores e menores, Favor, heróis, criaturas
míticas, poderes divinos, Titãs) no panteão grego.

## Pilares
1. **Território importa**: só se constrói dentro das fronteiras; tropas inimigas dentro delas sofrem atrito.
   Expandir fronteiras (Civismo, Centros Cívicos, Fortalezas, Torres, Templos) é tão estratégico quanto lutar.
2. **Escolhas divinas permanentes**: 3 deuses maiores × 2 deuses menores por Idade = árvores de 24 combinações,
   cada uma com poder único, criatura mítica e tecnologias exclusivas.
3. **Pedra-papel-tesoura legível**: infantaria > cavalaria > arqueiros > infantaria; cerco > edifícios;
   heróis > míticos > humanos.
4. **Determinismo**: a simulação é reproduzível (mesma semente, mesmos comandos → mesmo resultado),
   o que habilita replays, saves compactos e multiplayer em lockstep.

## Recursos
| Recurso | Fonte | Uso |
|---|---|---|
| Comida | frutas, caça, fazendas | unidades, idades |
| Madeira | árvores | edifícios, arqueiros, cerco |
| Ouro | veios | militares, tecnologias, heróis |
| Conhecimento | filósofos na Academia | linhas da Academia, idades |
| Favor | cidadãos rezando no Templo | míticos, heróis, tecnologias divinas |

## Idades
Arcaica → Clássica (Templo) → Heroica (Academia + 2 pesquisas) → Mítica (4 pesquisas) → Titãs (Fortaleza + 6 pesquisas).
Cada avanço (exceto Titãs) exige escolher um deus menor.

## Vitória
Conquista (eliminar todos) ou Maravilha (manter uma por 6 minutos).

## Arquitetura
```
src/core        simulação determinística (sem DOM): dados, mapa, sim, rede (lockstep), serialização
src/render      PixiJS: texturas procedurais, chunks, entidades, névoa, efeitos
src/ui          DOM: HUD, comandos, menus, enciclopédia; entrada
src/game        sessão (estado + agendador + seleção)
desktop/        wrapper Electron para Steam
tests/          vitest: dados, determinismo, pathfinding, simulação
scripts/        headless (IA x IA), balanceamento, screenshots automatizados
```
O renderizador nunca altera o estado; toda mutação vem de `Command`s aplicados no tick. A camada de
apresentação pode ser trocada (por exemplo, por Unity) sem reescrever as regras.

## Roteiro
1. ✅ Fatia vertical: skirmish contra IA com todos os sistemas centrais.
2. Arte final (sprites 2.5D), animações, música e dublagem dos poderes.
3. Multiplayer lockstep (2–8 jogadores) sobre Steam Networking Sockets; lobbies; replays.
4. Co-op: times contra IA, modo horda (ondas míticas).
5. Campanha: gatilhos de missão, diálogos, cutscenes; história da Titanomaquia em 3 atos.
6. Editor de mapas + Steam Workshop; localização (EN/ES); conquistas.
