# Briefing de arte — como entregar assets para Age of Earth

> Documento para artistas (3D, 2D ou técnico) que vão **substituir ou melhorar** a arte que o jogo já gera sozinho. Toda a
> arte atual sai de código determinístico (`scripts/bake/`: rigs paramétricos em three.js assados em sprites), então nada
> aqui é obrigatório para o jogo funcionar — é o contrato para uma peça comissionada entrar no lugar de uma peça gerada
> **sem mudar uma linha do jogo**. Direção de arte, decisões e números em `docs/ART.md` (§1 direção, §3 pipeline, §4 lista,
> Apêndices D–H por etapa). Reescrito na Etapa 8 (set/2026) a partir do que o pipeline realmente faz.

## 1. Direção de arte em uma página

- **Realismo** pedido pelo dono: Grécia clássica crível — bronze, linho, couro, mármore, terracota, oliveiras e ciprestes —,
  sem aspecto de brinquedo nem contornos pretos de desenho animado. Criaturas com anatomia plausível (pelagem, couro,
  escamas, bronze), titãs 3–4× a altura humana com material próprio.
- **Legibilidade vem antes do detalhe**: a zoom 1 um homem tem ~30 px de altura. Silhueta distinta por classe, cor de time
  **visível em todas as 8 direções** (capa, penacho, escudo, faixa, xairel, coleira), sem sangue (a pergunta 5 do dono
  segue aberta; hoje o combate levanta poeira, faíscas e lascas).
- Paleta de referência e materiais PBR em `scripts/bake/page/materials.js` (`PALETTE`); luz em §2.

## 2. O contrato de câmera e luz (vale para 3D e 2D)

Único lugar com os números: `scripts/bake/page/camera.js`.

| Item | Valor |
|---|---|
| Projeção | ortográfica, **50° de inclinação** (pitch), olhando do sul para o norte; o chão projeta 1:1 (verticais saem a ×0,84) |
| Escala | **32 px por tile a 1×** e 64 px a 2× (o jogo usa 2× no preset Alto); **1 tile = 2 m** (um homem de 1,8 m ≈ 0,9 tile) |
| Sol | direção para o sol `[-0,55; 1,0; -0,35]` (noroeste, alto) — **sombras para sudeste**; cor `#fff0d8`, intensidade 2,6 |
| Céu/chão | hemisfério `#bfd4ff` / `#8a7a5a`, 0,9 (unidades e props) · 2,1 nos edifícios (as fachadas sul nunca pegam sol) |
| Tonemapping | ACES filmic, saída sRGB; super-amostragem 2×2 no bake |
| Direções | **8**, na ordem E, SE, S, SO, O, NO, N, NE (índice 0 = leste, horário na tela) |
| Animação | **10 fps**; quadros por animação no manifesto (§4) |
| Âncora | o **pé** (ponto de contato com o chão) no pixel da âncora do manifesto; a caixa não pode encostar na borda |

Três passes por quadro, no mesmo enquadramento:
1. **cor** — o asset iluminado, fundo transparente; as partes de time saem num cinza neutro (`#8f9098`);
2. **máscara de time** — só as partes de time, em branco iluminado (o jogo multiplica pela cor do jogador, mantendo o
   sombreado); o resto do modelo só escreve profundidade (a máscara não "vaza" por trás do corpo);
3. **sombra** — só a sombra projetada no chão (alfa), guardada a ½ resolução.

## 3. Três caminhos para entregar

### 3.1 Ajustar a arte paramétrica (técnico/artista que programa)
Cada asset é um manifesto `art/manifest/<id>.json` (o id é o do jogo, `src/core/data/*.ts`). O kit do rig é escolhido
no manifesto (`source.params`: elmo, couraça, escudo, arma, capa, pelagem, cabeças…), as poses ficam em JSON editável
(`art/poses/<rig>.json`: graus por pivô e por quadro-chave). Como fazer, por categoria: edifícios no Apêndice D, unidades
no Apêndice E, criaturas e titãs no Apêndice G, efeitos no Apêndice F, ícones e retratos do HUD no Apêndice H de
`docs/ART.md`. Ferramentas: `node scripts/bake/pose-preview.mjs` (poses ampliadas sem assar), `npm run art:bake -- --only
<id> --scale 1,2 --contact docs/art` (assa e grava a folha de contato), `node scripts/bake/lineup.mjs` (fila a zoom 1 ao
lado do hoplita), `npm run art:check`.

### 3.2 Modelo 3D (.glb) — o caminho recomendado para arte comissionada
Só o `source` do manifesto muda; o resto do pipeline (câmera, luz, três passes, atlas, jogo) é o mesmo:

```json
"source": { "type": "glb", "path": "art/src/hoplite.glb", "scale": 0.5, "forward": "-z",
            "anims": { "idle": "Idle", "walk": "Walk", "attack": "Attack01", "die": "Death" },
            "teamMaterials": ["Cape", "ShieldCenter"] }
```

Requisitos do arquivo:
- **glTF binário (.glb)**, unidades em metros (`scale` converte para tiles: 0,5 = 1 tile por 2 m), pé na origem,
  frente no eixo indicado em `forward` (`-z`, `+z`, `+x`, `-x`).
- **Clipes de animação** nomeados; o bake amostra cada clipe nos quadros do manifesto (laço nas animações que repetem,
  do primeiro ao último quadro nas que não repetem: `die`, `rise`). Nomes livres — o mapa `anims` liga ao nome do jogo.
- **Partes de time** em materiais listados em `teamMaterials` ou com nome começando por `team_`.
- Materiais PBR (metal/rugosidade), texturas até 1024², sem emissivo (exceto fogo/brilho de propósito). Esqueleto e
  quantidade de polígonos livres (o bake é offline; um homem de 5–15 mil triângulos já sobra a 64 px).
- O `.glb` fica em `art/src/` (fora da distribuição); só o atlas assado entra no jogo.
- Prova do caminho: `node scripts/bake/bake.mjs --selftest-glb` exporta um cidadão de teste com clipe e o assa.

### 3.3 Sprites 2D pintados
Pintar os quadros no contrato do §2 (mesmo ângulo, luz de noroeste, sombra separada, âncora no pé, 8 direções, a máscara
de time como imagem à parte, 1× e 2×). **Ainda não há importador**: hoje os quadros entram pelo cache do bake
(`art/cache/<id>/<escala>x-<hash>/frames.json` + um PNG recortado por quadro e passe) e são empacotados com `npm run
art:bake -- --pack-only`. Um importador de pasta (`<id>/<passe>/<animação>_<direção>_<quadro>.png`) é a pendência para
esse caminho — combinar antes de começar.

## 4. O que existe e o que mais ganharia com arte profissional

Tudo abaixo já sai assado (Etapas 1–7 de `docs/ART.md`); a coluna "candidato" diz onde um profissional faria mais
diferença.

| Categoria | Peças | Quadros / formato | Candidato |
|---|---|---|---|
| Terreno | shader com 5 materiais (grama, terra, areia, rocha/neve, água animada) | texturas geradas (`src/render/terrain/materials.ts`) | pintura de materiais (albedo/normal) |
| Props | árvores (3 espécies), tocos, frutas, ouro, rochas | por estágio | médio |
| Edifícios (21) | obra 0–2, pronto, dano 1–2, escombros; muralha ×16 por conexão; portão aberto/fechado; Centro Cívico por Idade | 1 quadro por estado/variante | baixo (as estátuas das maravilhas: alto) |
| Unidades humanas (19) | cidadão, 8 infantaria/distância, 3 montadas, 2 cerco, rei, 5 heróis | idle 4, walk 8, attack 6, die 6 (+ aim, run, carry, gather, build, ability) × 8 dir | **alto: rostos e mãos** (o rig tem cabeça simples) |
| Míticas (13) e titãs (3) | 4 rigs (quadrúpede, bípede grande, serpente, asas), hidra 1–5 cabeças, ascensão dos titãs | idem, titãs só a 1× | médio–alto |
| Efeitos | 6 projéteis × 8 dir, fogo em 8 quadros, partículas, decalques | atlas `fx` gerado em Node | baixo |
| Ícones do HUD (144) | 35 unidades, 21 edifícios, 49 tecnologias, 12 poderes, 5 Idades, 5 habilidades, 5 recursos | **64² a 1× (128² a 2×)**, fundo transparente, máscara de time nas unidades e edifícios | médio |
| Retratos (12 deuses) | bustos no corpo esculpido com os atributos | **128² a 1× (256² a 2×)**, recortados em medalhão redondo pelo HUD | **alto** |
| Interface | glifos SVG, cursores SVG, aro de bronze em CSS | vetorial | molduras pintadas (nine-slice), fontes, telas de menu/carregamento/vitória, capa da Steam |

Tamanhos de caixa por classe (a 1×): unidade até 128 px, mítica até 192, titã até 288 (`sizeClass` no manifesto; o
`art:check` recusa acima). Orçamento de memória de vídeo: ≤ 100 MB residentes no cenário de perf, ≤ 250 MB a 1× se tudo
carregado (`docs/ART.md` §6).

## 5. Como uma entrega é aceita

1. Manifesto válido e `npm run art:check` sem erros (quadros, âncoras, nomes, tamanhos, orçamento).
2. Folha de contato (`--contact`) com as 8 direções e todas as animações, olhada pelo dono; fila a zoom 1 ao lado do
   hoplita e dos vizinhos de classe (`lineup.mjs`).
3. No jogo: o desfile da categoria (`scripts/artparade.mjs`, `artcity.mjs`, `artmyth.mjs`, `artfx.mjs`,
   `playtest-noemoji.mjs` para o HUD) passa, e a comparação de referência (`npm run art:diff`) só muda onde devia.
4. **Licença**: obra própria cedida ao projeto por escrito (ou licença comercial que permita redistribuir o sprite assado
   num jogo pago). Sem IA generativa, a menos que o dono autorize por escrito — nesse caso a Steam exige divulgação
   (`docs/LEGAL.md`).
