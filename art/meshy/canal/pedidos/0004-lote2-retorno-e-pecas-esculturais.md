# 0004 — Retorno do lote 2 e busca de peças esculturais
- de: nuvem · aberto: 2026-10-05

## Retorno do lote 2 (pedido 0001)

Obrigado pelos 18. Todos passaram pela prévia de bake no tamanho real da pegada, com obra e dano
(`docs/art/etapa9-meshy-lote2-comparacao.png`). Resultado:

- **Entrou**: `wonder_zeus` (Zeus de mármore no trono), sobre um soco de mármore em degraus
  (`docs/art/etapa9-meshy-maravilha-zeus.png`). Marque no catálogo como "em uso".
- **Não entrou** (deixe no catálogo como "avaliado, perdeu para o procedural"; não apague os arquivos):
  quartel, estábulo, mercado (2), serraria (2) e oficina de cerco — no zoom do jogo viram galpões escuros e genéricos;
  o procedural ganha porque mostra a função (cavalos, bancas, máquinas, escudos, toras). Centro Cívico (basílica e
  Panteão): o CC do jogo muda a cada Idade e um modelo só perderia isso; o Panteão ainda é romano, de cúpula. Muralha, torre e fazenda ficam fora por regra do jogo (muralha/torre se emendam por bitmask; a fazenda é uma
  plantação). O celeiro de adobe é estilizado demais.
- `wonder_colossus` ("Zeus King of Gods", de pé sobre coluna): não entrou — segura um tridente e o Colosso é Hélio.

**O que aprendemos**: o Meshy ganha em **peça escultural ou arquitetura ornamentada** (estátua, templo de colunas,
pórtico), que o procedural não alcança. Perde em edifício utilitário. Por isso a busca agora é só disso.

## Busca nova (até 2 por id, pela ordem)

| id | o que serve | termos |
|---|---|---|
| `wonder_colossus` | estátua masculina **de pé**, corpo inteiro, de preferência com um braço erguido (tocha) ou coroa de raios; **sem tridente, raio ou elmo**. Pode ser de mármore: o bake tinge de bronze | helios statue, apollo statue, standing god statue, colossus, bronze statue, kouros, athlete statue |
| `wonder_artemis` | templo **jônico** grande e intacto, muitas colunas, telhado fechado; um templo romano intacto (tipo Maison Carrée) também serve | ionic temple, artemis temple, roman temple, maison carree, peripteral temple, ancient temple |
| `academy` | pórtico/stoa ou ginásio com colunata e telhado de telha | stoa, portico, colonnade, gymnasium, academy, greek school |
| `house` (mais) | 2 casas mediterrâneas pequenas: reboco claro ou pedra, telha de barro ou terraço, sem enxaimel | greek house, mediterranean house, santorini house, roman domus, stone cottage, village house |
| (extra) | estátua isolada de deus ou herói, de pé, mármore ou bronze (para enfeitar praça/templo) | greek statue, marble statue, hero statue, athena statue |

- Mesmos critérios do 0001: modelo inteiro, fachada definida (o jogo vê de cima a ~50°), pedra clara; nada medieval ou
  moderno; ruína não serve. Alvo 60–120 mil triângulos, textura 1024, ≤ 8 MB; originais em `~/meshy-originais`.
- Só CC0 ou CC BY 4.0 (recuse CC BY-NC, "Private" e licença sem clareza). **Não gaste créditos** (nada de gerar,
  remesh, rig ou retexture): só o que já está na galeria comunitária.
- Destino: `art/meshy/edificios/` (estátuas extras também ali, com prefixo `statue__`); atualize `catalogo.json`
  (`modelos`, `recusados`, `faltando`) e as notas dos que não entraram (acima).
- Responda em `art/meshy/canal/respostas/0004.md` com o que entrou por id e o que continua faltando.
