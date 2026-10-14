---
name: achar-gargalo
description: 'Acha o que está pesando no quadro do Age of Earth: qual linha de execução manda, qual função ou passo de GPU, quanto passa da meta (60 fps, 16,7 ms) e onde anotar. Use quando o fps cair, antes de aprovar sistema novo de dano, tráfego, efeito ou multidão, ou quando o Felipe disser "está travando", "caiu o fps", "mede isso" ou "por que pesa".'
---
# Achar o gargalo

A meta: no cliente web, 60 fps de alvo e 40 de mínimo no preset Médio, com simulação até 3 ms, `renderer.render` até 3 ms
(p95 até 6), até 40 draw calls e 160 MB de textura (`docs/ART.md` §6); o `scripts/perf.ts` cobra a simulação (média até
5 ms por minuto, p95 até 12 ms, pior tick até 50 ms). No Unreal, 60 fps ou mais na RTX 4070 Ti com 200 unidades (cumprido
na resposta 0008: Alto 97 fps, Épico 77), 60 fps no Alto com 300 unidades (U2e) e 60 fps em 1440p (U4).

Medir o fps diz *se* pesa; esta rotina diz *o quê*. Sem saber o quê, otimização é chute.

## Passos

1. Reproduza com números: a mesma cena, a mesma câmera, o mesmo preset.
   Web: `node scripts/renderperf.mjs http://localhost:4173/ 20` (grava `docs/perf/<data>.json`),
   `node scripts/rendercpu.mjs http://localhost:4173/` e `?perf=1` na URL. Simulação: `npx tsx scripts/perf.ts 60`.
   Unreal (sessão local): `unreal/scripts/u1-medir.sh` tira as linhas `AOE_PERF` (fps, quadro, pior, GPU, RAM, unidades)
   do log da build.
2. Ache a linha de execução ou a etapa que manda (seções abaixo).
3. Ache a função ou o passo culpado e meça de novo sem ele (desligue o sistema, troque o efeito por nada) para provar.
4. Corrija o culpado e meça de novo nas mesmas condições. Sem antes e depois, não está provado.
5. Anote data, cena, preset, máquina, antes e depois, e o que mudou em `docs/perf/` (o JSON do script) e a tabela do `docs/QA.md`; no Unreal, a resposta do pedido em
   `art/meshy/canal/respostas/` e o `docs/UNREAL.md`.

## No Unreal (PC)

1. **Qual linha de execução manda.** Com o jogo rodando, `stat unit`: `Frame` é o total; o maior entre `Game` (lógica),
   `Draw` (preparo da renderização) e `GPU` é o gargalo. `stat unitgraph` mostra no tempo, bom para picos.
2. **Gravar para ler depois.** O perfil em CSV é texto e o Claude lê direto:
   `-csvCaptureFrames=600` na linha de comando, ou `csvprofile start` e `csvprofile stop` no console.
   O arquivo sai em `Saved/Profiling/CSV/`. Cada coluna é um contador (FrameTime, GameThreadTime, RenderThreadTime, GPUTime
   e os stats ligados); some a média, o p95 e o pior quadro.
3. **Achar a função.** Unreal Insights: rode com `-trace=cpu,gpu,frame,bookmark -statnamedevents`; o `.utrace` sai em
   `Saved/Profiling/` (ou no servidor de traces do Insights). Abra no `UnrealInsights.exe`, Timing Insights, e ordene os
   timers por tempo exclusivo na linha de execução que o passo 1 apontou. Para o Claude ler, exporte os timers para CSV
   pelo próprio Insights; antes de pôr o comando de exportação num script, confira o nome exato na documentação do
   Insights da versão 5.8.
4. **GPU.** `ProfileGPU` (Ctrl+Shift+,) escreve no log o custo de cada passo de renderização; `stat gpu` mostra ao vivo.
   Compare com e sem o efeito novo, mesma câmera.
5. Meça sempre com o build de desenvolvimento ou de teste, nunca no editor com a janela pequena; anote a resolução, o
   preset gráfico e o upscaler.

## No navegador (PixiJS)

1. **Quanto custa.** `renderperf.mjs` (custo do renderizador em vários zooms numa partida grande) e `rendercpu.mjs` (CPU por
   quadro, nosso código × Pixi; `--battle 100 --powers` dá o pior caso de partículas). Os dois gravam JSON em `docs/perf/`.
2. **Onde está o tempo.** Para o renderizador, o `rendercpu.mjs` já separa o nosso código do Pixi. Para a simulação:
   `npx tsx --cpu-prof --cpu-prof-dir scratch/prof scripts/perf.ts 30` e
   `node scripts/profsum.mjs $(ls -S scratch/prof/*.cpuprofile | head -1)` (o tsx grava dois perfis; o maior é o do script).
3. A renderização por software do container (swiftshader) deixa o tempo de GPU pessimista: na nuvem, confie no tempo
   de JavaScript e nas contagens (draw calls, triângulos, texturas); fps de verdade só no PC do Felipe.

## Armadilhas

- Média esconde engasgo: olhe também o p95 e o pior quadro.
- Primeira execução compila shader e carrega asset: descarte os primeiros segundos.
- Antes de medir no PC, `tasklist | grep UnrealEditor` tem que vir vazio: outro editor aberto (o do Detonauto) já
  derrubou uma medição para 52 fps.
- Os `unreal/capturas/perf-*.txt` de hoje não são os da resposta 0008 (foram sobrescritos no commit c8d2fa1): cite a
  fonte e o commit de cada número.
- O `u1-medir.sh` usa `$EXE` antes de defini-lo (linha 5) e o `-AoEPerfLog=` não grava arquivo na build: leia as linhas
  `AOE_PERF` do log.
