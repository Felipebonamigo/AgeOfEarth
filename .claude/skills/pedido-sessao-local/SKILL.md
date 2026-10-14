---
name: pedido-sessao-local
description: Escrever, pela nuvem, um pedido para a sessão local do PC do Felipe (Unreal 5.8, Meshy, Blender) no canal art/meshy/canal/, e depois ler a resposta e atualizar docs/UNREAL.md. Use quando a tarefa precisar do Unreal, de baixar modelos ou de qualquer coisa que só roda no PC, ou quando o Felipe disser "pede para a sessão local", "manda para o PC", "o que a sessão local respondeu?".
---
# Pedido à sessão local

A nuvem não tem o Unreal nem o navegador logado no Meshy. As duas sessões conversam por arquivos na branch `claude/ecstatic-albattani-atz7h5`. Regras completas: `docs/MESHY_LOCAL.md` §8 e `art/meshy/canal/LEIA-ME.md`.

- **Pedidos**, escritos só pela nuvem: `art/meshy/canal/pedidos/NNNN-<assunto>.md`.
- **Respostas**, escritas só pela sessão local: `art/meshy/canal/respostas/NNNN.md`, com o mesmo número.
- A sessão local roda o ciclo a cada 10 min (`/loop`): `git pull --rebase`, pega o pendente de menor número (sem resposta, ou com resposta `em andamento`), atende, responde e faz push. Um pedido por ciclo.

## Escrever o pedido

1. Traga a branch: `git pull --rebase origin claude/ecstatic-albattani-atz7h5`. A sessão local só puxa esta branch: se a sua for outra (`git branch --show-current`), o pedido tem de chegar a esta. Leia o `docs/UNREAL.md` (Estado), a última resposta e `unreal/U2-PLANO.md`, para não pedir o que já foi feito. Pedido de modelo 3D: antes, a skill `modelo-3d` (acervo e doc do estúdio).
2. Número: o maior de `pedidos/` **e** de `respostas/`, mais um (a sessão local às vezes responde sem pedido, como a 0009).
   ```bash
   ls art/meshy/canal/pedidos art/meshy/canal/respostas | grep -o '^[0-9]\{4\}' | sort -n | tail -1
   ```
   Nunca reuse um número, nem o de pedido cancelado (o 0002 foi cancelado e não está mais na pasta; o histórico fica no `LEIA-ME.md` do canal). Nome: minúsculas com hífens, por exemplo `0010-unreal-u2c-nevoa.md`.
3. Escreva no formato dos anteriores (modelo: `pedidos/0008-unreal-u1-fatia-bonita.md`):
   ```markdown
   # NNNN — <título curto>
   - de: nuvem · aberto: AAAA-MM-DD · prioridade: alta | média | baixa

   <2–4 linhas: por que, o que a nuvem já entregou, onde ler (docs/UNREAL.md, unreal/README.md)>

   ## Faça, pela ordem, e responda em `art/meshy/canal/respostas/NNNN.md` (pode ser em partes)
   1. <passo com critério de pronto: captura em `unreal/capturas/<nome>.png`, número medido, arquivo>
   2. ...

   Regras: só arquivos em `unreal/` e `art/meshy/`; a simulação (`src/`, `scripts/unreal/`) e os `docs/` são da nuvem.
   Sem gastar créditos do Meshy. Só CC0 ou CC BY 4.0 (ou Fab/Unreal com uso em jogo), registrado em `art/meshy/catalogo.json`.
   Se faltar campo na ponte, peça de volta na resposta em vez de mexer em `scripts/unreal/`.
   ```
   Pedido que ainda não deve ser atendido leva no topo `> **ADIADO — NÃO ATENDER ainda.**` e o motivo (como o 0007).
4. Commit só do pedido (e do `unreal/PROMPT-SESSAO-LOCAL.md`, se o próximo passo da sessão local mudou), em português, com o título `Unreal: pedido NNNN (<assunto>)` e o rodapé de atribuição que a sessão pedir; depois o push:
   ```bash
   git add art/meshy/canal/pedidos/NNNN-<assunto>.md
   git commit -m "Unreal: pedido NNNN (<assunto>)" -m "<linhas do rodapé de atribuição da sessão>"
   git push -u origin claude/ecstatic-albattani-atz7h5
   ```
5. Diga ao Felipe o número e o assunto, e que a sessão local precisa estar ligada no PC com o `/loop` (o texto para colar está em `docs/MESHY_LOCAL.md` §8 e `unreal/PROMPT-SESSAO-LOCAL.md`).

## O que a sessão local pode e não pode

- **Pode**: montar o projeto Unreal por script (Python do editor, compilar, empacotar, `HighResShot`), importar modelos, materiais, animação, medir fps na build; baixar modelos prontos da galeria (CC0 ou CC BY 4.0); escrever em `unreal/` e `art/meshy/` (o pedido 0007, de áudio, abre também `audio/` e `public/audio/`).
- **Não pode**: gastar créditos do Meshy (gerar, remesh, rig, retexture: nenhum pedido autoriza, só o Felipe direto no PC); mexer em conta, trocar licença, comprar ou aceitar termos; escrever em `src/`, `scripts/`, `docs/`, `art/manifest/` ou `public/art/`. Pedido que precise disso volta `bloqueado`, com a seção "Para o dono".
- Nada acima de 10 MB no git. O projeto (`unreal/AgeOfEarthUE/Content/`, binários) fica só no PC; entram `Config/`, `Source/`, `unreal/scripts/` e `unreal/capturas/`.

## Ler a resposta

1. `git pull --rebase origin claude/ecstatic-albattani-atz7h5` e `ls art/meshy/canal/respostas/`.
2. Formato: `# NNNN — resposta`, `- status: em andamento | feito | bloqueado` (às vezes com ressalva, como "feito com ressalvas"), `- data`, `- commits`, `## Resumo` e, se houver decisão do dono, `## Para o dono`. Algumas trazem "Pedidos à nuvem" (a 0009 pede campos novos em `scripts/unreal/protocol.ts` e `--players N` no exportador).
3. Confira os commits citados (`git show --stat <hash>`) e abra as capturas de `unreal/capturas/` com a ferramenta Read. "Pronto" sem captura ou número é pergunta, não fato. Commit da sessão local fora de `unreal/` e `art/meshy/` (já aconteceu: o `7851c60` mexeu em `docs/UNREAL.md`) se revisa e se avisa o Felipe.
4. Atualize `docs/UNREAL.md`, seção "Estado": uma linha por marco com a resposta citada, a data, os números (fps, unidades, preset, placa), o que falta e o "Próximo". Ao fechar um marco (U0–U4), marque a linha dele em `docs/ROADMAP.md`. Licença nova para os créditos vai em `docs/LEGAL.md` §4.
5. Repasse ao Felipe, na mensagem final, o que estiver em "Para o dono".
6. "Pedidos à nuvem" são tarefa da nuvem: faça ou registre a pendência; a volta para a sessão local é um pedido novo.
7. Para reabrir um pedido `bloqueado`, apague a resposta ou abra um pedido novo.
