---
name: traduzir
description: 'Escreve e confere o texto do Age of Earth nos idiomas do jogo (PT e EN), com um glossário único dos termos, e acha texto que ficou fora da tradução. Use ao criar ou mudar qualquer texto que o jogador lê (menu, HUD, tutorial, loja), quando o Felipe pedir "traduz", "põe em inglês/espanhol" ou "tem texto sem tradução".'
---
# Traduzir

Idiomas: português e inglês; ES, DE, FR e ZH depois do lançamento (`docs/ROADMAP.md`).

## Como o texto funciona neste jogo

- `src/i18n/strings.ts`: `const pt` e `const en: Record<keyof typeof pt, string>` (o typecheck já exige o inglês
  de toda chave); `t(key, vars)`.
- Conteúdo dos dados em inglês: `src/i18n/en-data.ts` (`EN_UNITS`, `EN_BUILDINGS`, `EN_TECHS`, `EN_POWERS`...).
- Missões m4 a m12 em JSON com `{pt,en}` (`tx()` em `src/core/scenario/text.ts`); conquistas em `src/game/achievements.ts`.
- O primeiro idioma vem do sistema (`detectLocale`).

## Passos

1. Escreva o texto já em todos os idiomas do jogo, no mesmo commit. Texto só em PT não entra.
2. Use os termos do glossário: o do `tests/i18n-eras.test.ts` (o teste reprova termo fora dele). Termo novo de jogo (golpe, modo, peça, recurso) entra no glossário
   antes de aparecer na tela.
3. Confira: `npx vitest run tests/i18n.test.ts tests/i18n-eras.test.ts` (inglês completo, mesmas `{variáveis}` e números,
   sem acento português no inglês, glossário, plurais, termos proibidos, missões JSON). Com o preview no ar,
   `node scripts/playtest-i18n.mjs` lê HUD, comandos e enciclopédia em inglês (só imprime). `npx tsx scripts/i18n-review.ts`
   gera `docs/eras/textos-pt-en.md` para ler lado a lado.
4. Texto longo (tutorial, loja): releia no idioma de destino como alguém daquele país leria. Tradução literal de
   gíria gaúcha ou de futebol não funciona; ache o equivalente.
5. Veja na tela: o inglês e o espanhol costumam ser 20 a 30 % mais longos que o português. Capture em PT e EN (skill `capturar-e-olhar`); o `scripts/playtest-noemoji.mjs` roda nas duas línguas.

## Armadilhas

- Na Steam, "Espanhol - Espanha" e "Espanhol - América Latina" são idiomas separados; o mesmo vale para "Português -
  Brasil" e "Português - Portugal". Declare só os que o jogo tem de verdade.
- Número, data e moeda mudam com o idioma (1.000,5 em PT, 1,000.5 em EN).
- Nome próprio de lugar real, marca e nome de pessoa não se traduzem; e o jogo não tem marca real (CLAUDE.md).
- O prólogo m1 a m3 (`campaign.ts`) ainda não tem inglês, e o cliente Unreal tem texto fixo em português
  (`AoEHud.cpp`); os nomes que a ponte manda vêm no idioma do servidor.
