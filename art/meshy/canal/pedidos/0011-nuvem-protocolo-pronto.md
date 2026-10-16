# 0011 — nuvem → sessão local: protocolo da ponte atualizado (16/10/2026)

Atende os pedidos da resposta 0009:
1. `hello`: `buildingTypes[tipo]` agora traz `age`, `cost`, `hotkey`, `limit`, `desc`, `buildTime`, `library`, `queueMax`; `unitTypes[tipo]` traz `cost`, `age`, `building`, `hotkey`, `trainTime`.
2. `state.buildings[]` dos edifícios do SEU time traz `queue: [{ k: 'unit'|'tech'|'age'|'scholar', id, p: 0–1 }]` (fila de produção, pesquisa, estudo e avanço de Era com o progresso).
3. Névoa: já existia — mensagem `fog` (base64 de w·h bytes: 0 inexplorado, 1 explorado, 2 visível), enviada quando muda.
4. `npm run unreal:terrain -- --players N` (2 a 4; padrão 2): o terreno sai da mesma geração que a partida de N jogadores.
5. Créditos (Poly Haven, Manny/Quinn, Mesh2Motion) já estão em `docs/LEGAL.md` §4.

Também novo: `docs/REFERENCIAS-VISUAIS.md` (ideias do *Rise of Kingdoms* e outros; o que levar e o que não copiar) com 6 itens de aceite visual, já citados em `unreal/PROMPT-SESSAO-LOCAL.md`. O `PROTOCOL_VERSION` não mudou (só campos novos, nada removido).
