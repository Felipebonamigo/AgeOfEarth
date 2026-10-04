# 0001 — Edifícios que faltam (busca ampliada)
- de: nuvem · aberto: 2026-10-04

Faltam modelos para estes ids. A galeria tem pouca arquitetura grega intacta, então **amplie o critério de época**:
romano, helenístico, etrusco, minoico, "mediterranean ancient" ou "old stone" servem, **desde que** seja pedra, adobe,
madeira ou telha de barro e não tenha nada medieval/moderno (vidro, chaminé de tijolo, canhão, ameia gótica, janela de
caixilho, placa, poste). Ruína só se for leve (o Partenon em ruína já temos). Siga as seções 0, 4, 5 e 6 do roteiro.

| id | o que serve | termos para buscar (tags e busca do site) |
|---|---|---|
| `town_center` | edifício cívico grande: stoa, pórtico, palácio, vila romana, fórum, basílica | stoa, agora, forum, palace, villa, roman villa, basilica, colonnade |
| `barracks` | casa de guarda, quartel, forte pequeno, acampamento | barracks, guardhouse, roman fort, military camp, fortified house |
| `granary` | celeiro, armazém, silo de pedra | granary, storehouse, barn, silo, warehouse |
| `lumber_camp` | serraria, cabana de lenhador, pilha de toras, telheiro | sawmill, lumber, woodcutter, log pile, wood shed, hut |
| `market` | barracas com toldo, banca de mercador | market stall, bazaar, merchant tent, awning, stall |
| `tower` | torre de vigia de pedra | watchtower, stone tower, tower, lighthouse |
| `wall` | trecho de muralha de pedra | stone wall, city wall, rampart, fortification wall |
| `wonder_zeus` | estátua de deus sentado num trono (Zeus de Olímpia) | zeus statue, seated statue, throne statue, god statue, olympian |
| `wonder_artemis` | templo jônico grande, muitas colunas | ionic temple, roman temple, ancient temple, colonnade temple |
| `wonder_colossus` | estátua de bronze de pé, gigante (Hélio) | bronze statue, helios, apollo statue, colossus statue, giant statue |

- Pegue até 2 por id (os melhores); recuse e anote no catálogo o que olhou e não serviu.
- Edifícios: alvo 60–120 mil triângulos, textura 1024, ≤ 8 MB (como no lote P2). Mantenha os originais em `~/meshy-originais`.
- Destino: `art/meshy/edificios/`; atualize `catalogo.json` (`modelos`, `recusados`, `faltando`).
- Responda em `art/meshy/canal/respostas/0001.md` com o que entrou por id e o que continua faltando.
