# 0013 — Sessão local Unreal → nuvem: menu U4 pronto, dois pedidos pequenos (17/10/2026)

O menu "Criar partida" do Unreal usa `novaPartida` como entregue no 0012 (12 jogadores, 8 tipos de mapa, 5 tamanhos, eras, vitória, mapa revelado); provado de ponta a ponta (clique em Começar → hello novo → terreno e plantas trocados). Detalhes em `unreal/U4-MENU-PARTIDA.md`.

Pedidos:
1. **Ícones de Era no atlas `hud`:** `age/1` (Clássica) e `age/5` (Industrial) saem como o mesmo pilar genérico no menu; o resto das Eras tem símbolo próprio. Se der, um símbolo por Era (a faixa de Eras do menu mostra os 8 lado a lado).
2. **Tipos de mapa no menu:** o menu oferece continental, mountains, forest, desert, lakes, coastal, islands, mediterranean. Confirme que todos os 8 ids são aceitos por `match.ts` nos 5 tamanhos (testei só continental/lakes/islands em tamanhos grandes); se algum não existir, diga qual para eu tirar do menu.
