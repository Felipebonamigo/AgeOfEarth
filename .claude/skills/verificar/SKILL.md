---
name: verificar
description: O que rodar no Age of Earth antes de dizer que uma mudança está pronta (typecheck, testes, determinismo pelo smoke, campanha, balanceamento, mapas, SIM_VERSION), conforme o que mudou. Use ao terminar qualquer mudança de código, antes do commit, ou quando o Felipe ou a sessão perguntar "está pronto?", "os testes passam?", "conferiu o determinismo?", "rodou o balance?".
---
# Verificar antes de dizer "pronto"

Nada está pronto sem rodar o comando nesta sessão e ler a saída. Tudo na raiz do repositório; logs em `scratch/` (está no `.gitignore`: `mkdir -p scratch`). Comandos longos vão em segundo plano, **um de cada vez** (todos usam a CPU inteira).

## 1. Sempre

```bash
npm run -s typecheck                          # nenhuma saída = ok
npx vitest run tests/<a>.test.ts tests/<b>.test.ts   # os testes do que você tocou
npm test > scratch/test.log 2>&1; tail -8 scratch/test.log   # fim de bloco ou mudança no núcleo
```

Deu certo: resumo `Test Files … passed` e `Tests … passed`, nenhum `failed`.

**Armadilha do vitest** (`docs/eras/LEIA-ME.md` §7, `docs/QA.md`): às vezes o `npm test` sai com código 1 e `Timeout calling "onTaskUpdate"` **com todos os testes passando**. O worker perde a RPC quando um arquivo síncrono e longo segura o laço de eventos numa máquina carregada. Confira o resumo e rode de novo só os arquivos citados. Se um `it` seu passa de ~20 s, divida-o (um `it` por dificuldade, como em `tests/m10_otris.test.ts`) ou ceda o laço depois de cada caso (`afterEach(() => new Promise<void>((r) => { setTimeout(r, 0); }))`, como em `tests/missions.test.ts`). O limite por teste é 90 s (`vite.config.ts`). Um `expect` vermelho **não** é isso: corrija.

## 2. Conforme o que mudou

| Mudou | Rode também |
|---|---|
| `src/core` (simulação, IA, dados) | §3, smoke duas vezes |
| campanha, cenário, Horda (`src/core/scenario/`, `AI_PACE_CLASSIC`, custo das Eras até IV→V) | §4 |
| balanceamento (`AI_PACE`, custos, tempos, dados de unidade) | §5 |
| mapa, gerador, recursos, `scripts/maps/*.ts` | §6 |
| a mesma semente passa a dar outra partida | §7 |
| algo que se vê (HUD, menu, render, arte) | skill `capturar-e-olhar` |

## 3. Determinismo: o smoke duas vezes

```bash
npm run smoke 20 42 2>&1 | grep 'hash final'
npm run smoke 20 42 2>&1 | grep 'hash final'
```

Deu certo: as duas linhas `hash final: <hex> (tick 24000)` iguais (~25 s cada aqui). Hash diferente entre as duas = não-determinismo em `src/core`: procure `Math.random`, `Date.now` e `performance.now`. As outras proibições (`Math.sin/cos/atan2/pow/exp/log/hypot`, `localeCompare`) só divergem entre máquinas, então o smoke não as pega: quem pega é o `tests/determinism.test.ts`, que lê o texto de `src/core` (até comentário). Hash diferente do de **antes** da mudança só é aceitável se a partida mudou de propósito (§7).

## 4. Campanha e cenário (~12 min)

```bash
npx tsx scripts/missions.ts 2>&1 | sed -E 's/ \([0-9.]+s\)$//' > scratch/missoes-depois.txt; tail -3 scratch/missoes-depois.txt
npx tsx scripts/horde.ts
```

Deu certo: última linha `Missões: OK` (código 0). Uma missão só: `npx tsx scripts/missions.ts 14 m4_caucaso` (minutos da passiva, ids, dificuldades). Se a campanha não devia mudar, grave `scratch/missoes-antes.txt` do mesmo jeito antes de mexer e compare com `diff`. Nunca afrouxe um `expect` nem crie `exceptions` sem o motivo em `docs/STORY.md`.

## 5. Balanceamento (dezenas de minutos)

```bash
npm run balance 60 1-18 -- --jobs 3 --targets > scratch/balance.log 2>&1; tail -14 scratch/balance.log
```

O `--` é obrigatório: o `npm run` engole as opções antes dele. Referência (`CLAUDE.md`, medido em 13/10/2026), mediana de chegada em minutos: II ~5,8 · III ~11 · IV ~16 · V ~21,6 · VI ~26,7 · VII ~31,6 · VIII ~38; metas II 4, III 9, IV 14, V 20, VI 26, VII 33, VIII 40. Hoje II–IV saem `LENTA` e a última linha é `ritmo: FORA` (código 1): é a pendência D18 do dono, não erro seu. Critério: nenhuma Era pior que a referência e nenhuma `PARADA`/`TRAVADA` nova. Para testar um ajuste sem editar o código: `AOE_PACE='{"villagerTarget":[…]}' npm run balance …`.

## 6. Mapas

```bash
npm run map:check                          # os embutidos
npm run map:check arquivo.map.json         # um arquivo
```

Deu certo: código 0, sem erro. Mapa versionado (`src/core/data/maps/*.map.json`, `map.data` das missões) só se regera pelo script de `scripts/maps/` (`npx tsx scripts/maps/egeu.ts`, `estreito.ts`, `m4_caucaso.ts`…), nunca à mão: o `tests/data.test.ts` exige o Egeu e o Estreito idênticos ao gerado. Mexeu em IA ou posição: `npx tsx scripts/maps/fairness.ts egeu 45 1-16 zeus --both --jobs 3` (e `estreito`; 20–40 min cada). Critério: nenhum lado com > 65 % das decididas + à frente; um "fora" isolado se confirma com as sementes `101-132`; o Egeu já tem um resíduo de índice, então a regra é não piorar.

## 7. Quando subir `SIM_VERSION`

Suba quando a mesma semente passar a dar outra partida (o hash do smoke mudou de propósito). Uma vez por etapa ou entrega, nunca duas na mesma, em `src/core/constants.ts`, com a linha nova no histórico do comentário acima dele (`12 = <o que mudou>`). Efeitos: o relay recusa clientes de outra versão, replays de outra versão não abrem (`err.replayVersion`) e a ponte do Unreal manda o número no `hello`. Depois rode o `npm test` (inclui `tests/relay-version.test.ts`) e o smoke duas vezes, e anote o hash novo. Campanha que não devia mudar: §4 com `diff`.

## O que registrar

- Na resposta final: cada comando rodado e o resultado (hash, `Missões: OK`, medianas, código de saída). Falha conhecida que ficou: diga qual.
- Numa etapa de `docs/eras/`: números em `docs/eras/PROGRESSO.md`, Notas → `E<n> — medições`.
- Balance que mudou a referência: atualize as medianas e a data em `CLAUDE.md` (Convenções); JSON com `--json docs/perf/<data>-<nome>.json`.
