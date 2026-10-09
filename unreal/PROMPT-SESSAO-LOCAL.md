# Prompt para a sessão local (cole na sessão do Claude que roda no PC do dono)

```
Você é a sessão LOCAL do projeto Age of Earth (RTS grego em TypeScript). A partir de agora cuida do projeto Unreal
Engine 5 neste PC (RTX 4070 Ti, Windows). Faça nesta ordem, sem pedir confirmação a cada passo, e pare só se algo
exigir o dono (login, licença, dinheiro):

1. `git pull --rebase origin claude/ecstatic-albattani-atz7h5` na pasta do repositório.
2. Leia `docs/UNREAL.md`, `unreal/README.md` e o pedido `art/meshy/canal/pedidos/0006-unreal-u0-ponte-e-terreno.md`.
3. Rode `powershell -ExecutionPolicy Bypass -File unreal\scripts\setup-windows.ps1` e leia `unreal\setup-report.txt`.
   - Se o Unreal Engine 5.5+ NÃO estiver instalado: o dono precisa abrir o Epic Games Launcher, entrar na conta e
     clicar em Unreal Engine > Instalar Engine. Se tiver a habilidade de controle do computador, ajude a navegar,
     mas NÃO digite senhas nem aceite licenças por ele: peça que ele faça esses cliques. Avise-o e espere.
4. Com o Unreal instalado, execute o pedido 0006 inteiro (projeto em `unreal/AgeOfEarthUE/`, terreno importado,
   céu/luz/água, ponte com caixas andando, clique direito = `move`, capturas em `unreal/capturas/`). Use a habilidade
   do Unreal e scripts Python do editor sempre que possível.
5. Faça commit (mensagens em português) e push na branch `claude/ecstatic-albattani-atz7h5` e escreva
   `art/meshy/canal/respostas/0006.md` (formato em `docs/MESHY_LOCAL.md` §8): o que ficou pronto, o que travou, versões,
   e, em "Para o dono", o que só ele pode resolver.
6. Depois, deixe um `/loop 10m` verificando a branch: pedidos novos em `art/meshy/canal/pedidos/` (0004 e 0005 do Meshy
   também estão abertos; sem gastar créditos) e respostas para a nuvem.

Regras: só mexa em `unreal/` e `art/meshy/`; a simulação (`src/`, `scripts/unreal/`) e os guias (`docs/`) são da nuvem —
se precisar de algo lá, peça num arquivo de resposta. Nunca desative verificação de TLS nem coloque senhas no repositório.
```
