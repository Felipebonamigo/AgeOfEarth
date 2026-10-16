---
name: declaracao-ia
description: 'Junta tudo o que o Age of Earth tem de conteúdo gerado por IA (modelos do Meshy, texto, som, imagem) a partir dos registros do jogo e escreve a declaração de IA da Steam em PT e EN, separando o que foi feito antes do que é gerado durante o jogo. Use antes de publicar a página ou um build, quando entrar asset de IA novo, ou quando o Felipe perguntar "o que declaro de IA?".'
---
# Declaração de conteúdo de IA na Steam

A Steam pede, no questionário de conteúdo do Steamworks, o que o jogo usa de IA, em dois grupos:

- **Gerado antes** (pré-gerado): arte, modelo, som, texto ou código feitos com IA durante o desenvolvimento. A Valve
  pede a garantia de que não infringe direito de terceiros.
- **Gerado durante o jogo** (ao vivo): conteúdo criado por IA enquanto a pessoa joga. Exige dizer as proteções contra
  conteúdo ilegal. O Age of Earth não gera nada ao vivo.

O texto aparece na página da loja. Código escrito com o Claude não entra, só o que o jogador vê ou ouve
(regra do estúdio, CLAUDE.md).

## Onde está o que é de IA neste jogo

- `art/meshy/catalogo.json`: 81 modelos (`origem` "galeria" é a comunidade do Meshy, CC0, gerados por IA por
  outras pessoas; "conta" é gerado na conta do Felipe, hoje 1, o javali) e 19 `externos`. Não há campo de IA: todo modelo
  do Meshy conta como IA.
- `docs/LEGAL.md` §6 tem o rascunho da resposta da Steam ("pré-gerado com assistência de IA... nada gerado durante o
  jogo"), mas fala em "modelos procedurais". O jogo usa modelos do Meshy (4 no cliente web e quase todos no Unreal):
  corrija o texto.
- Áudio: o `docs/AUDIO.md` permite IA com licença comercial e prevê um `audio/catalogo.json` com `origem` e `prompt`
  (ainda não existe).
- Créditos do jogo: "Desenvolvido com assistência de IA (Claude Code)".

## Passos

1. Liste tudo o que está marcado como IA nos registros acima. Confira também os créditos ("generated with Meshy") e
   qualquer texto de interface, loja ou lugar que veio de IA sem reescrita humana.
2. Procure o que deveria estar marcado e não está: modelo com origem Meshy sem a marca, texto com "gerado" no
   histórico do commit. Corrija o registro antes da declaração.
3. Escreva a declaração em `docs/STEAM.md`, em PT e EN, assim:
   - o que é (modelos 3D de props e personagens, texto de descrição, efeitos sonoros...), em linguagem de jogador;
   - de onde veio (ex.: "gerados com o Meshy e revisados à mão"; a licença de cada um está nos créditos do jogo);
   - o que **não** é IA, quando ajuda (música, vozes, código de jogo não entram na declaração).
4. Mostre o texto ao Felipe. É ele quem preenche o questionário no Steamworks.
5. Quando entrar asset de IA novo, atualize o arquivo no mesmo commit do asset.

## Armadilhas

- O Meshy grava metadado que identifica conteúdo de IA no GLB; os termos dele proíbem remover. Não limpe esse metadado ao reduzir o modelo.
- Uma declaração que esconde IA pode tirar o jogo da loja. Na dúvida, declare.
- A declaração vai numa seção nova "Declaração de IA" do `docs/STEAM.md` (o `docs/AUDIO.md` já aponta para ela), e o
  `docs/LEGAL.md` §6 e o `docs/steam/PRESSKIT.md` têm que dizer o mesmo.
- A cápsula e as imagens da loja são sem IA generativa (`docs/STEAM.md`, `docs/steam/PRESSKIT.md`).
