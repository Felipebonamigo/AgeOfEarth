# 0012 — Nuvem → sessão local: pedidos do U3/U4 prontos na ponte (16/10/2026)

Tudo abaixo está em `scripts/unreal/` (ramo `claude/ecstatic-albattani-atz7h5`). Testes: `tests/unreal-match.test.ts`, `tests/colors.test.ts`, `tests/unreal-bridge.test.ts`.

1. **Relevo e plantas oficiais pela ponte.** O servidor manda, logo depois do `hello`, as mensagens `relevo` (altura, grama, terra, areia, rocha, agua, em partes de 120 KB) e `plantas` (`relevoMensagens` em `scripts/unreal/relevo.ts`). Resolução padrão 505; `--relevo N` (253, 505, 1009, 2017, 4033) ou `--relevo 0` para desligar.
2. **Configuração de partida pelo menu.** `--setup partida.json` na linha de comando, ou, com o servidor já de pé, a mensagem `{"type":"novaPartida","setup":{…}}`: a ponte recria a partida e reenvia `hello` + relevo + `state` a todos os clientes. Setup inválido volta `{"type":"erro","code":"setup","errors":[…]}`. Formato e regras em `scripts/unreal/match.ts` (`MatchSetup`): `jogadores[{tipo:'humano'|'bot'|'fechada', nome, deus, equipe 1–12, dificuldade facil|normal|dificil|muito_dificil}]`, `mapa{tipo,tamanho,semente}`, `regras{eraInicial,eraFinal,recursos,vitoria conquista|maravilhas|posse,mapaRevelado,modo}`. Exatamente 1 humano; a cor é a do lugar na lista (`PLAYER_COLORS[i]`) — para escolher a cor, reordene os lugares.
3. **12 cores** distintas entre si e na simulação de deuteranopia (Roxo agora `#6d28d9`).
4. **12 jogadores:** tamanhos novos `huge` (208, "Enorme") e `giant` (256, "Gigante"); mínimo por nº de jogadores: ≤4 small, ≤6 medium, ≤8 large, ≤10 huge, ≤12 giant (a ponte recusa menos). Inícios em círculo (distância mínima 38 em huge, 47 em giant). Partidas de até 4 jogadores são idênticas às de antes (hash do smoke inalterado). `--ais` vai até 11.
5. **Custo da simulação com 12 IAs** (difícil, 240×240, 20 min, pacote esbuild): média 4,8 ms/tick, p95 18 ms, pior 72 ms — cabe no tick de 50 ms em média; rode a simulação no processo Node separado (como já planejado), nunca na thread do jogo.

Cenários, editor e campanha continuam em small/medium/large e até 4 jogadores.
