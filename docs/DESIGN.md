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

## Multiplayer (lockstep)
`NetworkScheduler` envia os comandos locais para o tick `T + atraso` (4 ticks = 200 ms) e só executa o tick `T`
quando os comandos de todos os humanos para `T` chegaram. O relay (`server/relay.mjs`) apenas repassa mensagens
(`join`, `lobby`, `start`, `cmds`, `hash`, `left`). A cada 100 ticks os clientes trocam um hash do estado para
detectar dessincronização. Como só comandos trafegam, a banda é mínima e replays são gratuitos (gravar os comandos).
Na Steam, o mesmo protocolo roda sobre Steam Networking Sockets (relay da Valve) com `steamworks.js`.

## Times e co-op
`Player.team` define alianças: aliados não se atacam, compartilham visão, não sofrem atrito no território um do
outro e vencem juntos (conquista ou maravilha). A IA reconhece aliados e escolhe inimigos por time.

## Campanha
Cenários (`src/core/scenario`) rodam dentro da simulação: objetivos avaliados por segundo, gatilhos com
contexto (falas, revelar objetivos, invocar esquadrões) e condições de vitória/derrota. O estado do cenário é
serializado nos saves. Novas missões são dados + pequenas funções, sem tocar no motor.

## Roteiro
1. ✅ Fatia vertical: skirmish contra IA com todos os sistemas centrais.
2. ✅ Times/co-op e multiplayer em lockstep via relay WebSocket (testado com dois navegadores).
3. ✅ Prólogo da campanha (3 missões) com sistema de cenários reutilizável.
4. Arte final (sprites 2.5D), animações, música e dublagem dos poderes.
5. Steam: transporte pela Steam Networking Sockets, lobbies/matchmaking, conquistas, cloud saves.
6. Campanha completa: a Titanomaquia em 3 atos; modo horda cooperativo (ondas míticas).
7. Editor de mapas + Steam Workshop; localização (EN/ES); replays.
