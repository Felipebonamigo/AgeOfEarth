# 0007 — Áudio A1: música épica, efeitos e vozes (IA + bibliotecas livres)
- de: nuvem · aberto: 2026-10-09 · prioridade: média-alta (depois do 0006/0005; o dono acha o áudio atual muito ruim)

Decisão do dono: IA e bibliotecas livres, clima épico de orquestra, vozes para os personagens. Plano e regras de licença em
`docs/AUDIO.md` (leia inteiro). **Sem gastar dinheiro nem aceitar termos pagos**: tudo gratuito e de uso comercial permitido.

Faça, nesta ordem, e responda em `art/meshy/canal/respostas/0007.md` (pode ser em partes):

1. **Licenças primeiro.** Para cada ferramenta/biblioteca candidata de `docs/AUDIO.md` (ACE-Step, Stable Audio Open, Kokoro,
   Piper e a voz escolhida, Sonniss GameAudioGDC, Kenney, OpenGameArt, Freesound-CC0), leia a licença/termos **atuais** (pesos e
   serviço), copie a frase que permite uso comercial e o link para `audio/catalogo.json` (`ferramentas`), e marque
   "aprovada" ou "recusada". Dúvida = recusada. Crie a pasta `audio/` com o catálogo e um `LEIA-ME.md` curto.
2. **Ferramentas locais** (RTX 4070 Ti, 12 GB): instalar o que foi aprovado em venv próprio (`audio/ferramentas/`, **fora do
   git**) e gerar um teste de 30 s de música, 1 efeito e 1 fala para provar que roda; anotar tempos e consumo de memória.
3. **Primeiro lote** (se o passo 1 aprovou as fontes): 6 músicas (menu, paz Era I, paz Era II, batalha 1, vitória, derrota; 3
   versões de cada, escolha a melhor, loop limpo com `ffmpeg`), ~60 efeitos essenciais (lista em `docs/AUDIO.md`), vozes de
   cidadão/hoplita/arqueiro/cavalaria (PT-BR e EN, 4–6 falas por classe e tipo: selecionar/mover/atacar) e dos 3 deuses
   maiores (anúncio de poder e de Era). Normalizar volume (−16 LUFS música, −14 efeitos/voz), OGG Vorbis em
   `public/audio/{musica,sfx,voz,ambiente}/` (≤ 80 MB), originais fora do git.
4. **Catálogo e créditos**: cada arquivo em `audio/catalogo.json` com origem, versão, licença, autor, prompt, data.
5. Um **vídeo/áudio de amostra** não é possível pelo repositório: grave 1 minuto de cada tipo num `.ogg` curto em
   `audio/amostras/` (commit) para eu e o dono ouvirmos.

Regras: só arquivos em `audio/` e `public/audio/`. A integração no jogo (`src/audio/`) é da nuvem (passo A2). Se uma
ferramenta pedir login/cartão/aceite de termos, **pare e avise o dono** em "Para o dono". Nunca imitar voz de pessoa real.
