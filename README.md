# Age of Earth

RTS que mistura **Rise of Nations** (Idades, fronteiras nacionais, atrito, linhas de pesquisa) com
**Age of Mythology** (deuses gregos, Favor, heróis, criaturas míticas, poderes divinos e Titãs).
Feito em TypeScript + PixiJS (WebGL), com simulação determinística pronta para multiplayer em lockstep,
e empacotável com Electron para a Steam.

![Age of Earth](docs/screenshot.png)

## Jogar agora

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

Versão otimizada: `npm run build` e `npm run preview`.

## Como jogar (resumo)
- Escolha um deus maior (Zeus, Poseidon ou Hades), o tamanho do mapa, quantos oponentes e a dificuldade.
- Cidadãos coletam Comida, Madeira e Ouro; rezam no Templo para gerar **Favor**; filósofos na Academia geram **Conhecimento**.
- Só é possível construir dentro das suas **fronteiras**; tropas inimigas dentro delas sofrem **atrito**.
- Avance de Idade no Centro Cívico e escolha um **deus menor** a cada Idade: cada um dá um poder divino, uma criatura mítica e tecnologias.
- Vença por **Conquista** (elimine todos) ou pela **Maravilha** (mantenha-a de pé por 6 minutos).
- `F1` mostra os controles; `F2` abre a enciclopédia completa (unidades, edifícios, tecnologias, deuses).

## Conteúdo
- 5 Idades, 3 deuses maiores, 9 deuses menores, 12 poderes divinos.
- 15 unidades humanas, 5 heróis, 13 criaturas míticas, 3 Titãs.
- 20 edifícios (incluindo 3 Maravilhas e o Portal dos Titãs), 60+ tecnologias.
- IA adversária com economia, expansão, pesquisa, ondas de ataque, defesa e poderes; 3 dificuldades.
- Mapas procedurais (3 tamanhos) com posições iniciais justas; névoa de guerra; minimapa; salvar/carregar.

## Desenvolvimento

```bash
npm test           # testes (vitest): dados, determinismo, pathfinding, simulação
npm run typecheck  # TypeScript estrito
npm run smoke 20   # simula 20 minutos de IA x IA sem interface e imprime o resumo
npm run balance    # várias partidas IA x IA com sementes diferentes (balanceamento)
```

Estrutura: `src/core` (simulação, sem DOM) · `src/render` (PixiJS) · `src/ui` (HUD/menus) · `desktop/` (Electron/Steam) · `docs/` (design, Steam).

## Roteiro
Fatia vertical concluída (skirmish contra IA). Próximos passos: arte final, multiplayer lockstep pela Steam, co-op, campanha da Titanomaquia, editor de mapas e Workshop. Detalhes em `docs/DESIGN.md` e `docs/STEAM.md`.

## Licença
MIT.
