---
name: ler-crash
description: 'Lê o que o Age of Earth deixa quando trava ou fecha sozinho (o diagnóstico exportado e os logs do Unreal), acha a linha de código e transforma em Issue "[Playtest]" com o passo a passo. Use quando o jogo travar, fechar sozinho, um testador mandar log ou pasta de crash, ou o Felipe disser "crashou", "fechou do nada" ou "deu erro".'
---
# Ler um crash

## Onde fica

- Jogo web e Electron: os últimos 50 erros ficam na memória da partida (`src/main.ts`), e o menu da partida tem
  "Exportar diagnóstico" (`age-of-earth-diagnostico-<data>.json`: versão, navegador, opções, erros, dessincronia e o save
  da sessão). O roteiro para pedir isso ao jogador está no `docs/QA.md`. Falha no boot mostra a pilha na tela.
- Electron: não há `crashReporter` nem log próprio (`docs/LEGAL.md`); os saves ficam em `%APPDATA%\age-of-earth-desktop\saves\`.
- Unreal (sessão local): o log da build em `<pasta do exe>/AgeOfEarthUE/Saved/Logs/AgeOfEarthUE.log`, os dos scripts
  (`ue-jogo.log`, `/tmp/game.log`, `/tmp/ue.log`, `/tmp/uat.log`) e, num crash, `Saved/Crashes/<pasta>/` com
  `CrashContext.runtime-xml` e o minidump.

## Passos

1. Junte os arquivos. Do PC do Felipe, leia direto. De um testador, peça a pasta zipada anexada à Issue "[Playtest]"
   (o modelo da Issue tem o campo de anexo). Anote a versão do jogo e a data.
2. Ache a primeira linha que é do jogo. No diagnóstico, `errors[].stack`; erro de dessincronia se compara com o replay da mesma semente (determinismo,
   skill `verificar`). No Unreal, `Fatal error` ou `Unhandled Exception` no log e a `<CallStack>` do
   `CrashContext.runtime-xml`; a primeira linha com `AgeOfEarthUE` traz arquivo e linha.
3. Leia as 50 linhas de log antes do erro: o que o jogo estava fazendo (cena, modo, último comando).
4. Ligue ao código: abra o arquivo e a linha, e o `git log` daquele trecho perto da data da versão.
5. Reproduza com a skill `capturar-e-olhar` (cliente web) ou um pedido à sessão local (skill `pedido-sessao-local`) para o Unreal. Se reproduziu, o defeito vira teste visto falhar antes da correção.
6. Registre: Issue "[Playtest]" com gravidade "trava" ou "quebra a partida", o trecho da pilha, o arquivo e a linha, e
   como reproduzir. A correção segue a skill `triar-playtest`.

## Armadilhas

- Sem o `.pdb` da mesma compilação, a pilha vem só com endereços. O `.pdb` fica fora do git e fora do depot da Steam;
  guarde o de cada versão que foi para teste.
- `ensure` que falha não fecha o jogo, mas aparece no log como erro: leia também esses.
- Crashes já vistos no Unreal (resposta 0008): `DXGI_ERROR_DEVICE_HUNG` em `Nanite::DrawGeometry` dentro das sombras
  virtuais (corrigido por `u1_nanite.py`) e cook com "Zero key hash" de animação sem `USkeleton` (`u1_consertar_anims.py`).
- O diagnóstico leva o save da sessão: não anexe à Issue pública sem ver o que tem.
- Log de testador pode ter nome de usuário e caminho do computador dele: não copie isso para a Issue pública.
