# Prompt para a sessão local (cole na sessão do Claude que roda no PC do dono)

Estado em 13/10/2026: o **U0** (ambiente, ponte e terreno) está pronto e foi respondido em `art/meshy/canal/respostas/0006.md`.
O próximo é o **U1, a fatia bonita** (`art/meshy/canal/pedidos/0008-unreal-u1-fatia-bonita.md`). O dono exige um visual
de jogo moderno, no nível do print de referência dele (Unreal 5, Lumen, materiais PBR), **nada pixelado**; pode usar
Unreal ou Unity se for preciso, e o plano é Unreal. A simulação da nuvem já tem 8 Eras, 21 poderes, 25 criaturas
(navais, voadoras e anfíbias), mar, comércio e 20 maravilhas.

```
Você é a sessão LOCAL do projeto Age of Earth (RTS grego em TypeScript). Você cuida do projeto Unreal Engine 5 neste PC
(RTX 4070 Ti, Windows). Faça nesta ordem, sem pedir confirmação a cada passo, e pare só se algo exigir o dono (login,
licença, dinheiro):

1. `git pull --rebase origin claude/ecstatic-albattani-atz7h5` na pasta do repositório.
2. Leia `docs/UNREAL.md`, `unreal/README.md`, `art/meshy/canal/respostas/0006.md` (o que o U0 deixou pronto) e o pedido
   `art/meshy/canal/pedidos/0008-unreal-u1-fatia-bonita.md`, que é a tarefa de agora.
3. Se o `Fab` e o `Quixel Bridge` ainda não estiverem instalados no Launcher, peça ao dono (a conta é dele); não digite
   senhas nem aceite licenças por ele.
4. Execute o pedido 0008 inteiro (terreno com texturas reais, água com ondas, vegetação, cidade grega Arcaica/Clássica,
   hoplitas e cidadãos animados, luz como no print de referência, medição no build empacotado, capturas e vídeo em
   `unreal/capturas/u1-*.png`). Use a habilidade do Unreal e scripts Python do editor sempre que possível. A régua é: se
   parecer o jogo web de hoje, não está pronto.
5. Faça commit (mensagens em português) e push na branch `claude/ecstatic-albattani-atz7h5` e escreva
   `art/meshy/canal/respostas/0008.md` (formato em `docs/MESHY_LOCAL.md` §8): o que ficou pronto, o que travou, versões,
   números de desempenho e, em "Para o dono", o que só ele pode resolver.
6. Depois, deixe um `/loop 10m` verificando a branch: pedidos novos em `art/meshy/canal/pedidos/` (0004 e 0005 do Meshy
   também estão abertos; sem gastar créditos) e respostas para a nuvem.

Regras: só mexa em `unreal/` e `art/meshy/`; a simulação (`src/`, `scripts/unreal/`) e os guias (`docs/`) são da nuvem —
se precisar de algo lá, peça num arquivo de resposta. Nunca desative verificação de TLS nem coloque senhas no repositório.
Só licenças CC0 ou CC BY 4.0 (ou as do Fab/Megascans que permitem uso comercial), registradas em `art/meshy/catalogo.json`.
```

## Adendo (16/10/2026): referências de visual
Leia `docs/REFERENCIAS-VISUAIS.md`. Além do que o pedido 0008 já exige, mostre na fatia: cidade Arcaica × Moderna com troca animada, cena parada viva por 10 s, zoom contínuo do mapa ao hoplita com fps, linha de marcha com brasão, névoa dissolvendo, uma habilidade de herói em Niagara e feedback de coleta/obra. Não use arte, nomes ou assets de outros jogos.
