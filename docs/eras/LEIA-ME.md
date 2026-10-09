# Expansão das Eras — manual de operação

Este arquivo é para o agente que vai **executar** a expansão sozinho, sessão após sessão, sem o contexto das conversas
que escreveram os guias. Leia-o inteiro no começo de toda sessão. Ele manda sobre o que um guia disser de commit, push,
progresso e paradas. O conteúdo técnico (o que mudar e como) está nos guias.

Os guias foram escritos e revisados contra o código entre 06/10 e 09/10/2026 (commit-base `00a3809`; os rascunhos
entraram no `d2d0682`). Em 09/10 eles também foram conferidos **entre si** (ids, nomes, Eras, dependências, ordem).
Nenhum código do jogo foi alterado: a E1 começa do zero.

---

## 1. O projeto em 5 linhas

1. **Age of Earth** é um RTS em TypeScript + PixiJS (Rise of Nations + Age of Mythology com o panteão grego), empacotado
   com Electron para a Steam.
2. A simulação (`src/core`) é determinística e separada do renderizador (`src/render`) e da interface (`src/ui`), o que
   permite multiplayer lockstep, replays e IA × IA sem tela.
3. Hoje o jogo tem 5 Idades, 35 unidades, 21 edifícios, 3 deuses maiores, 9 menores, uma campanha de 12 missões e arte
   assada (sprites gerados no próprio repositório).
4. A **expansão das Eras** leva o jogo da Grécia arcaica à Era Moderna: 8 Eras estudadas na Biblioteca, pedra, petróleo
   e raros, linhas de unidade I–VIII, naval, caravanas, 20 maravilhas, 9 deuses menores novos e arte por Era.
5. O seu trabalho é executar os guias de `docs/eras/` na ordem, passo a passo, com testes e medições, e registrar tudo em
   `docs/eras/PROGRESSO.md`.

---

## 2. Onde estão as decisões e o cronograma

| O quê | Onde | Regra |
|---|---|---|
| Plano aprovado pelo dono (06/10/2026) | `docs/ERAS.md` | **Não reabra.** Cada guia cita as seções que valem para ele. |
| Decisões de cada etapa | seção "Decisões já tomadas" de cada guia (D1, D2…) | Também não reabra; se uma não funcionar, pare e pergunte (§8). |
| Cronograma | `docs/ROADMAP.md`, seção "Cronograma a partir de 06/10/2026" | Ao fim de cada etapa, o guia diz qual linha marcar. |
| Regras do repositório | `CLAUDE.md` (na raiz; já vem no contexto da sessão) | Resumo em §5. |
| Estado da execução | `docs/eras/PROGRESSO.md` | Atualize a cada passo. |
| Base dos textos para a revisão da E9 | `docs/eras/E9-base-textos.json` | **Não edite.** |

A ordem de execução tem uma diferença do ROADMAP: a **E7 é feita logo depois da E5** (as duas estão no mesmo guia) e a
**E6 vem depois da E7**. Os guias já foram ajustados para isso. Na hora de marcar o ROADMAP, marque a linha de cada
etapa (E7 = semanas 11–12, E6 = semanas 9–10) quando ela terminar, mesmo fora da ordem das semanas.

---

## 3. Ordem das etapas e o arquivo de cada uma

| Ordem | Etapa (rótulo no PROGRESSO) | Guia | Precisa de | Estimativa | Linha do ROADMAP |
|---|---|---|---|---|---|
| 1 | E1 + painel/árvore (E9) — 8 Eras e Biblioteca | `E1-eras-biblioteca.md` | — | 7 dias | semanas 1–2 |
| 2 | E2 — pedra, petróleo e raros | `E2-recursos.md` | E1 | 5 dias | semanas 3–4 |
| 3 | E3 — linhas de unidade I–VIII | `E3-linhas-de-unidade.md` | E1, E2 | 5 dias | semanas 3–4 |
| 4 | E4 — naval | `E4-naval.md` | E1–E3 | 9 dias | semanas 5–7 |
| 5 | E5 — comércio (Parte 1) | `E5-E7-comercio-maravilhas.md` | E1–E4 | 3 dias | semana 8 |
| 6 | E7 — maravilhas (Parte 2) | `E5-E7-comercio-maravilhas.md` | E5 (e E4) | 5 dias | semanas 11–12 |
| 7 | E6 — mitologia em todas as Eras | `E6-mitologia.md` | E1–E5, E7 | 7 dias | semanas 9–10 |
| 8 | E8 — arte por Era | `E8-arte-por-era.md` | E1–E7 | 29 dias | semanas 13–18 |
| 9 | E9 — interface final (Parte 1) | `E9-E10-interface-balanceamento.md` | E1–E8 | 4 dias | a semana em que terminar |
| 10 | E10 — balanceamento (Parte 2) | `E9-E10-interface-balanceamento.md` | E1–E9 | 6 dias | semanas 19–20 |

"A E9 corre junto" (ERAS §11) quer dizer: o painel da Biblioteca e a árvore de estudos entram com a E1, e os textos
PT/EN de cada etapa entram com ela. O **resto** da E9 (enciclopédia, revisão dos textos, Eras no multiplayer, controle
na árvore) é a Parte 1 do último guia, depois da E8.

Todo guia tem as mesmas seções: Objetivo · Decisões · Arquivos que mudam · Dados prontos · Passo a passo · Testes ·
Verificação · Critérios de pronto · Armadilhas · Ao terminar. Os guias têm 100–180 KB: leia por partes (ferramenta Read
com `offset`/`limit`, ou Grep pelo número do passo), nunca o arquivo inteiro de uma vez.

Glossário de contagens que confunde:
- o ERAS §4 fala em **11 linhas**; no código ficam **13 `LINES`**: as 10 terrestres da E3 (a tabela inteira menos
  "Barcos" e "Navio de guerra", com o Sifão de fogo grego como linha própria `greek_fire`) e as 3 da E4 (`fishing`,
  `transport`, `warship`);
- índice de Era (`age`, 0–7) × número romano (I–VIII): Era IV = índice 3. Os guias escrevem os dois; confira sempre.
- `SIM_VERSION` esperado se tudo seguir a ordem: E1 → 4; E2 → 5; E3 → 6; E4 → 7; E5 → 8; E7 → 9; E6 → 10; E8 e E9
  não sobem; E10 → 11. O formato do save só muda na E1 (2).

---

## 4. Rotina de cada sessão

1. **Situe-se.** Na raiz do repositório: `git status`, `git log --oneline -8` e `git branch --show-current`.
   - **Primeira sessão:** se `git status` mostrar mudanças só em `docs/eras/` (a preparação dos guias, deste LEIA-ME e
     do PROGRESSO, feita em 09/10/2026 sem commit), faça um commit delas antes de tudo:
     `docs(eras): guias revisados, LEIA-ME e PROGRESSO`.
   - Mudança fora de `docs/eras/` que você não fez: não apague; pare e pergunte (§8).
   - Confira que o checkout tem o trabalho mais recente: o último passo `[x]` do PROGRESSO tem de aparecer no `git log`.
     Se em **Notas → Sessões** a última sessão anotou uma branch com commits que não estão aqui, traga-os
     (`git fetch origin <branch>` e `git merge --ff-only FETCH_HEAD`). Se não der fast-forward, pare e pergunte.
   - Sem `node_modules`: `npm ci`.
2. **Leia, nesta ordem:** este LEIA-ME; o `docs/eras/PROGRESSO.md` (Resumo, caixas e Notas, principalmente
   "Bloqueios" e "Pendências para o dono"); e, no guia da etapa atual, as Decisões, os Dados prontos que o passo usa, o
   texto do passo e as Armadilhas. A **etapa atual** é a primeira do Resumo que não está `feito`.
3. **Pegue o próximo passo não marcado** (`[ ]`), de cima para baixo, dentro da etapa atual. No primeiro passo de uma
   etapa, mude o estado dela no Resumo para `em andamento`.
4. **Implemente exatamente o que o passo diz.**
   - Copie o código e os números das tabelas do guia; não invente números nem recalcule os que vêm prontos.
   - Números de linha são aproximados: ache o trecho pelo nome da função ou pelo texto citado. Se uma etapa anterior
     mudou o trecho, aplique a mesma mudança em cima do que ela deixou, sem desfazer nada dela.
   - O guia é o roteiro, não um dogma de sintaxe: o `npm run -s typecheck` é o juiz. Erro de compilação no código
     colado (import faltando, nome trocado) se corrige com o mínimo; mudança de comportamento, não.
5. **Rode a verificação do passo** (o "Confira:"/"Conferir:" dele). Se não houver, rode `npm run -s typecheck` e os
   testes dos arquivos que você tocou. Comando longo vai em segundo plano com log (§6).
6. **Marque no PROGRESSO:** `[x]` no passo; números medidos (hash do smoke, minutos das Eras, fairness) em
   **Notas → E<n> — medições**; o que o guia mandar "registrar no PROGRESSO" também vai em Notas.
7. **Commit em português**, um por passo:
   - título `E<n> <passo>: <o que mudou>` (por exemplo `E2 17: gerador põe pedra, nafta e raros`), para o `git log` e
     as pré-condições dos guias acharem a etapa pelo nome;
   - no corpo, uma ou duas linhas e, se for o caso, quais testes ainda estão vermelhos **de propósito** (os guias dizem
     quais e até que passo);
   - no fim, o rodapé de atribuição que a mensagem de sistema da **sua** sessão pedir (por exemplo as linhas
     `Co-Authored-By: …` e `Claude-Session: …`); nunca copie o de outra sessão;
   - `git add` só do que o passo mudou. Nada de `/tmp`, `scratch/`, logs, capturas "antes". Na E8, os PNG de
     `public/art` só entram no commit do fim de cada bloco de arte (D26 da E8).
8. **Push para a branch da sessão:** `git push -u origin <branch-da-sessão>`. Nunca para `main`, nunca `--force`.
   Erro de rede: tente de novo até 4 vezes, esperando 2, 4, 8 e 16 s.
9. **Repita 3–8.** Antes de a sessão acabar (ou o contexto encher), escreva em **Notas → Sessões** uma linha: data,
   branch, último passo feito, o que ficou a meio. Se um passo ficou a meio, faça um commit
   `E<n> <passo> (parcial): …`, deixe a caixa `[ ]` e diga em Sessões o que falta.
10. **Ao terminar uma etapa:** a seção "Verificação" inteira e o "Ao terminar" do guia (ele atualiza `docs/ROADMAP.md`,
    `CLAUDE.md` e às vezes `docs/STORY.md`, `docs/EDITOR.md`, `docs/ART.md`, `docs/QA.md`: pode mexer neles); Resumo
    com `feito`, data e hash curto.

Marcas do PROGRESSO: `[ ]` a fazer · `[x]` feito · `[~]` bloqueado ou pulado (com nota em Bloqueios). Estados do
Resumo: `pendente`, `em andamento`, `feito`, `feito com pendências`, `bloqueado`. Subseções de **Notas** (crie quando
precisar, sempre como `###`): `Sessões`, `Bloqueios`, `Pendências para o dono`, `E<n> — medições`, `E<n> — ganchos` e,
na E10, `E10 — rodadas de ajuste`. Quando um guia mandar criar "## Medições da E<n>" ou a tabela "Rodadas de ajuste",
ponha dentro de Notas com esses nomes.

Medições "antes": os guias as guardam em `/tmp` ou `scratch/`, que **não sobrevivem** entre sessões. Copie para Notas
os números-chave assim que medir (hash final do smoke, minutos das Eras, linha do fairness). Se a base sumiu e você
precisa dela para um `diff`, refaça-a num worktree do commit anterior à etapa:
`git worktree add /tmp/base-e<n> <hash>`, `ln -s "$PWD/node_modules" /tmp/base-e<n>/node_modules` e rode o mesmo
comando lá dentro.

---

## 5. Regras invioláveis (resumo do `CLAUDE.md`)

- **Determinismo em `src/core`:** nada de `Math.random`, `Math.sin`/`cos`/`atan2`/`pow`/`exp`/`log`/`hypot`, `Date.now`
  ou `performance.now` — nem em comentário (o `tests/determinism.test.ts` lê o texto). Sorteio por `state.rng` (ou o RNG
  da passada do gerador); distância por `Math.sqrt` e `x * x`. Ordenação de strings com `<`/`>`, nunca `localeCompare`.
- **Toda mutação vinda de fora entra por `Command` → `applyCommand`** (`src/core/sim/commands.ts`). O renderizador e o
  HUD só leem o estado. Os ganchos `window.aoe.debug*` dos playtests são a única exceção, e ficam fora do lockstep.
- **Estado serializável:** todo campo novo de estado ganha valor padrão no `deserialize` (`src/core/serialize.ts`) e a
  ida e volta `serialize(deserialize(serialize(s))) === serialize(s)` continua valendo.
- **Justiça de posição:** nenhuma regra usa orientação absoluta ("ao norte", espiral que começa por um lado), varredura
  (y, x), "o primeiro do `Map`" de edifícios de outros jogadores ou o índice do jogador como desempate. Use
  `centerFrame`/`towardFrame`/`frameCompare` (`src/core/map/grid.ts`) e a distância ao centro do mapa; desempate por id
  só entre edifícios do **próprio** jogador. Provas: `tests/position-fairness.test.ts` e `scripts/maps/fairness.ts`.
- **`SIM_VERSION`** (`src/core/constants.ts`) sobe uma vez em cada etapa que muda a partida de uma mesma semente, no
  passo que o guia indica, com a linha do histórico no comentário. Nunca duas vezes na mesma etapa.
- **Atalhos:** únicos por contexto; construção e treino nunca usam `A`, `R` ou `U` (e `H`, `P`, dígitos, `Tab`, `.` e
  `,` não funcionam: o `input.ts` os consome antes). `tests/data.test.ts` confere.
- **Gravação do jogador** (save, opções, `aoe_setup`…): `storeSet`/`storeRemove` de `src/game/cloud.ts`, nunca
  `localStorage.setItem`/`removeItem` direto. Chave nova que vai para a nuvem entra em `CLOUD_FIXED_KEYS` **e** em
  `desktop/cloud.cjs`.
- **Sem emoji na interface:** HUD, menus e editor usam `ic.*` e `glyph()`. Emoji só no campo `icon` dos dados. Emoji
  novo num texto exige entrada em `EMOJI_GLYPHS` (`tests/hud-icons.test.ts`); prefira não usar.
- **Textos PT e EN:** toda chave nova nas duas tabelas de `src/i18n/strings.ts`, com as mesmas `{variáveis}`; todo id
  novo de dado com inglês em `src/i18n/en-data.ts` (`name`, `desc` e, nas unidades, `plural`). Interface e comentários
  em português; código em inglês. "Age of Mythology"/"Age of Earth" nunca viram "Era".
- **Ícone do HUD:** todo conteúdo novo (unidade, edifício, tecnologia, poder, recurso, Era, deus) precisa de ícone no
  atlas `hud`: entrada no catálogo (`scripts/bake/hud/catalog.mjs`, ou o alias da E2) e `npm run art:hud`. Nunca edite
  `public/art/hud-*` à mão. `techIconKey` (catálogo) e `techIconName` (`src/ui/icons.ts`) têm de dar o mesmo nome.
- **Arte:** nunca `npm run art:bake` sem `--out` (refaz `public/art` só com o cache local, que não tem tudo, e apaga
  atlas). Da E1 à E7 ninguém mexe em `art/manifest/*`, `scripts/bake/page/*` nem `materials.js`. A E8 assa num rascunho
  e funde com `node scripts/bake/merge-group.mjs <rascunho> --groups <lista>`.
- **Meshy: nunca gaste créditos.** Não gere, não faça remesh, rig nem retextura, não mexa na conta. Nenhum guia da
  expansão precisa do Meshy (a arte nova é procedural ou assada aqui). Só modelos já baixados e com licença CC0 ou
  CC BY 4.0 (`art/meshy/catalogo.json`).
- **Campanha intacta:** o conteúdo novo fica desligado em cenário (`unitLines`, `naval`, `eraMyth`, `allWonders`,
  `AI_PACE`). `npx tsx scripts/missions.ts` tem de sair igual ao "antes" nas etapas que dizem isso. Nunca afrouxe um
  `expect` nem crie `exceptions` sem registrar o motivo em `docs/STORY.md`.
- **Mapas versionados** (`src/core/data/maps/*.map.json`, `map.data` das missões): só pelos scripts de
  `scripts/maps/`, nunca à mão. Regiões: `rectReachable` antes de mandar unidades, `wouldSeal` antes de a IA construir.

---

## 6. Comandos de verificação

| Comando | Quando | O que esperar |
|---|---|---|
| `npm run -s typecheck` | todo passo | nenhuma saída |
| `npx vitest run tests/a.test.ts tests/b.test.ts` | o "Confira" do passo | tudo verde |
| `npm test` | fim de bloco/etapa | tudo verde (ver §7) |
| `npm run smoke 20 42` (2×) | passos de núcleo e IA | o mesmo "hash final" nas duas |
| `npm run balance 35 1,2,3` · `npm run balance 60 1,2,3` | IA e economia | nenhuma `PARADA`; Eras dentro do critério do guia |
| `npx tsx scripts/missions.ts 2>&1 \| sed -E 's/ \([0-9.]+s\)$//'` | campanha (~12 min) | todas OK; com `diff` contra o "antes" quando o guia pede |
| `npx tsx scripts/horde.ts` | etapas que mexem em cenário | OK, igual ao antes |
| `npm run map:check` | mapas, recursos | sem erro nem aviso nos embutidos |
| `npx tsx scripts/maps/fairness.ts egeu 45 1-16 zeus --both --jobs 3` (e `estreito`) | IA (20–40 min cada) | nenhum lado com > 65 % das decididas + à frente, por posição e por índice; "fora" isolado → confirme com `101-132` |
| `npm run art:hud` · `npm run art:check` | ícones e arte | sem erro |
| `npm run build` e `npm run preview` (segundo plano, porta 4173) | playtests | — |
| `node scripts/playtest*.mjs http://localhost:4173/` | interface | conferências OK, `errors: none` |
| `npm run relay` (segundo plano, porta 8787) | playtests de multiplayer | — |

Detalhes que derrubam quem não sabe:
- **O `npm run` engole opções** que vêm antes de um `--`: use `npm run balance 60 1-18 -- --jobs 3`,
  `npm run smoke 20 42 -- --map arquivo`, `npm run map:export -- saida.map.json --size small --seed 42`, ou rode o
  script direto (`npx tsx scripts/export-map.ts …`). O exemplo de `map:export` do `CLAUDE.md` está sem o `--` até a
  E4 corrigir.
- **Chromium do Playwright:** `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, com `--use-gl=swiftshader
  --enable-unsafe-swiftshader`; os playtests fixam `LANG: 'pt_BR.UTF-8'` no `chromium.launch`.
- **Segundo plano:** `missions.ts`, `balance 60`, `fairness`, bakes da E8 e `loadtest` levam de minutos a dezenas de
  minutos. Rode em segundo plano com log (`… > /tmp/x.log 2>&1`) e **um de cada vez** (todos usam a CPU inteira).
  `npm run preview` e `npm run relay` não terminam sozinhos: pare-os no fim.
- **Capturas:** toda captura e folha de contato nova é olhada com a ferramenta Read antes do commit.

---

## 7. Falhas conhecidas (não são bug do seu passo)

- **Timeout de RPC do vitest:** às vezes o `npm test` termina com código 1 e `Timeout calling "onTaskUpdate"` (ou
  parecido) **com todos os testes passando**. Confira o resumo ("Tests N passed"), rode de novo só os arquivos citados e,
  se um `it` novo seu passa de ~20 s, divida-o e dê timeout explícito (o padrão é 30 s, em `vite.config.ts`). Um
  `expect` vermelho **não** é isso: corrija.
- **Renderização por software lenta no contêiner** (swiftshader): o jogo no navegador anda bem abaixo da velocidade
  pedida. Nos playtests, acelere o jogo (`window.aoe.session.speed = 3`), espere por condição em laço com teto longo (60 s
  ou mais) em vez de um `waitForTimeout` curto, e dê timeouts generosos. Um timeout de playtest só vira falha depois de
  repetido com o dobro do tempo. Os números do `renderperf` daqui são pessimistas.
- **Testes vermelhos de propósito entre passos:** cada guia lista quais ficam vermelhos e até que passo (por exemplo
  E1, "Testes durante o trabalho"; E3, antes do Bloco 0). Não os "conserte" fora do passo deles.
- **Hash do smoke** muda quando a simulação muda de propósito (`SIM_VERSION` subiu): compare as duas rodadas da mesma
  versão, não com a de outra etapa (a não ser que o guia peça "igual ao antes", como na E8 e na E9).
- **Fairness "fora" isolado** com 16 sementes acontece por ruído: confirme em `101-132` antes de mexer em código. O Egeu
  1–16 já tinha um resíduo de índice antes da expansão (`CLAUDE.md`, `docs/EDITOR.md`): a regra é "não piorar".

---

## 8. Quando PARAR e perguntar ao dono

Pare a frente de trabalho, escreva a pergunta em **Notas → Pendências para o dono** (com os números e as opções) e diga
isso na mensagem final da sessão. Siga com passos independentes, se houver.

- **Mudança de decisão de design:** qualquer coisa marcada "não reabrir" no ERAS ou nas Decisões dos guias; criar
  Universidade ou Fábrica (ERAS §5, sem etapa: D13 do guia E9-E10); mudar custo ou tempo das Eras II–IV (mexe na
  campanha: D18 da E10); mudar a campanha além do que o guia manda; mexer em mapa oficial fora do script.
- **Gasto de dinheiro** de qualquer tipo (serviço pago, assinatura, compra, créditos).
- **Contas:** Steam/Steamworks, Meshy, relay de produção, dados legais.
- **Balanceamento fora das metas depois de 2 tentativas** seguindo a escada que o guia dá (E1 "Verificação" item 6; E2
  item 5; E3 item 5, ajustes 1–3; E4 G6; E5/E7 item 6; E10 escada E10-4). Registre os números de cada tentativa.
- **Pré-condição que falha** e não é corrigível dentro da etapa anterior (o guia manda parar).
- **Prova de invariante quebrada sem causa achada:** `tests/determinism.test.ts`, `bad` não vazio na sondagem de
  simetria, `missions.ts` diferente do "antes" numa etapa que exige igualdade.
- Qualquer pedido de apagar histórico, `push --force`, mexer em `main` ou apagar trabalho que você não fez.

Pendências já previstas pelos guias (registre-as quando a etapa chegar lá): Prometeu por roteiro na campanha (E1 D12);
relay de produção com as chaves novas do lobby (E1, E7, E9); deuses e poderes novos (E6); leituras das maravilhas e a
meta de 20 pontos (E7 D19, D15); capturas de cada Era (E8); teto do atlas `hud` se precisar subir (E4/E6/E8); ritmo das
Eras II–IV (E10 D18); Universidade e Fábrica (E9 D13).

---

## 9. Passo que não fecha

1. Tente **até 2 vezes, de jeitos diferentes**: releia o passo, as Armadilhas e as Decisões; procure no guia um "se
   falhar…" (muitos passos têm).
2. Se não fechar:
   - desfaça o que quebra o resto (`git restore <arquivos>`) ou mantenha o que compila e não muda comportamento;
   - marque `[~]` no PROGRESSO e escreva em **Notas → Bloqueios**: `E<n> <passo>: <motivo>` com o comando, a saída
     curta, o que foi tentado e o que falta;
   - commit `E<n> <passo> (bloqueado): …` e push.
3. **Siga para o próximo passo independente.** Um passo depende de outro quando usa algo que ele cria (arquivo, função,
   campo, dado, ícone) ou quando o guia diz "faça antes"/"depois do". Na dúvida, não pule: pare (§8).
4. Uma etapa com `[~]` só fecha como `feito com pendências` se o guia permitir deixar aquilo pendente (por exemplo a
   Fase F/M da E5–E7 sem a E4, N3/P1–P3 da E10 sem a E8, a D18 da E10). Senão ela fica `bloqueado` e a próxima etapa não
   começa.
5. **Nunca** afrouxe um teste, apague uma asserção ou mude um número de dado "para passar".
