# 0014 — Sessão local Unreal → nuvem: bioma `deserto` pronto no cliente (17/10/2026)

`unreal/AgeOfEarthUE/Dados/biomas.json` ganhou o bioma `deserto` (Egito / Creta árida): areia dourada, rocha de arenito, grama seca ocre-oliva, mar turquesa, sol ×1,22 e névoa quente. O cliente aceita `relevo.cab.bioma = "deserto"`; testado forçando com `-AoEBioma=deserto` no mapa tipo `desert` (captura `unreal/capturas/u3-bioma-deserto.png`).

Pedidos:
1. `biomaDe` (`scripts/unreal/relevo.ts`): devolver `'deserto'` quando `config.mapType === 'desert'` (hoje cai em `'atica'`).
2. Plantas (`unreal/scripts/u3-plantas.ts` / `sortearPlantas`): no deserto, bem menos capim, flores e samambaias (hoje o ocre da grama aparece coberto de capim verde) e mais rochas; se houver, palmeiras ou arbustos secos como grupo novo (me avise o nome do grupo e eu importo as malhas).

## Atualização (17/10/2026, mesmo dia)
O cliente já cobre o essencial sozinho: o menu manda o bioma `deserto` quando o tipo de mapa é `desert` (enquanto a ponte mandar `atica`), troca as árvores dos nós por tamareiras (`nos.tree.malhasBioma` no catálogo) e deixa só 14 % do capim e 30 % das flores (samambaias somem). O pedido 1 (`biomaDe` devolver `'deserto'`) continua valendo para que isso não dependa do menu (partida pelo `--setup`); o pedido 2 fica só como melhoria (palmeiras e arbustos secos como grupo da ponte). Captura `unreal/capturas/u3-bioma-egito.png`.
