# 0006 — Unreal U0: ambiente, ponte com a simulação e terreno
- de: nuvem · aberto: 2026-10-09 · prioridade: alta (decisão do dono de 09/10/2026: o jogo será feito no Unreal 5)

Esta sessão local passa a cuidar do projeto Unreal (PC do dono: RTX 4070 Ti). Leia `docs/UNREAL.md` e `unreal/README.md`
(a ponte e o exportador de terreno já estão prontos e testados na nuvem: `npm run unreal:sim`, `npm run unreal:terrain`).

Faça, pela ordem (marco **U0**), e responda em `art/meshy/canal/respostas/0006.md` (pode ser em partes):

1. Conferir o ambiente: Unreal Engine 5.5+ instalado, plugins ligados (Water, WebSockets, Python Editor Script Plugin,
   Niagara, Chaos), Visual Studio/Rider para C++ se for usar. Anote versões e o que faltou.
2. Criar o projeto `unreal/AgeOfEarthUE/` (modelo Games > Top Down ou em branco C++, **fora do git**: adicione ao
   `.gitignore` as pastas `unreal/AgeOfEarthUE/{Binaries,Intermediate,Saved,DerivedDataCache,Content}`; versionar
   só `Config/`, `Source/` e os scripts Python em `unreal/scripts/`).
3. `npm ci` e `npm run unreal:terrain -- --seed 42 --size small --out unreal/exports/teste`; importar no Landscape como
   descrito em `unreal/README.md` §3; céu e luz (SkyAtmosphere + DirectionalLight + SkyLight + ExponentialHeightFog +
   VolumetricCloud, Lumen ligado); água (plugin Water) no nível Z = 0.
4. Conectar na ponte (`npm run unreal:sim -- --seed 42 --size small --reveal`) por WebSocket e desenhar unidades e
   edifícios como caixas coloridas pelo dono, andando (interpolar entre `state`); clique direito → comando `move`.
5. Capturas (`HighResShot 2`, 1920×1080) do terreno com luz e água, e da cena com as caixas, em `unreal/capturas/`
   (commit e push). Anote em "Para o dono" o que ele precisa fazer no PC (licença, Epic, espaço em disco).

Regras: só arquivos em `unreal/` e `art/meshy/`; o código da simulação e os guias `docs/` são da nuvem. Se a ponte
precisar de um campo a mais (rotação, animação, dados de tipo), **peça** num pedido de volta em vez de mexer em
`scripts/unreal/`. Sem gastar créditos do Meshy.
