# Áudio de Age of Earth — plano (decisão do dono, 09/10/2026)

Hoje o áudio é **todo sintetizado pelo código** (`src/audio/`: WebAudio) e soa eletrônico. Decisão: **trocar por áudio
gravado/gerado**, com IA e bibliotecas livres, **clima épico de orquestra**, e **vozes para os personagens**.
O mesmo conjunto de arquivos serve ao jogo web e ao Unreal (importa os .ogg/.wav).

## Regras de licença (valem para tudo; a Steam também pede declaração de uso de IA)

- Só entra o que for **CC0**, **CC BY 4.0** (com crédito) ou gerado por ferramenta cuja licença **permita uso comercial**.
  "Grátis" ≠ "comercial": o plano gratuito de várias IAs proíbe uso comercial. **Antes de usar, a sessão local confere a
  licença da ferramenta e da versão (pesos do modelo e termos do serviço) e registra no catálogo.** Dúvida = não entra.
- Candidatas, a confirmar uma a uma (a confirmação é um passo do pedido 0007): **ACE-Step** (música; pesos Apache-2.0, roda
  local na RTX 4070 Ti), **Stable Audio Open** (efeitos/ambientes; licença comunitária da Stability, grátis comercial abaixo
  de um teto de receita), **Kokoro** (vozes; Apache-2.0, tem vozes em português do Brasil e inglês), **Piper** (vozes; código
  MIT, cada voz tem a própria licença). **Não usar**: MusicGen (pesos CC BY-NC), XTTS/Coqui (CPML, não comercial), planos
  gratuitos do Suno/Udio/ElevenLabs (não comercial). Bibliotecas de efeitos: **Sonniss GameAudioGDC** (uso comercial livre),
  **Kenney**, **OpenGameArt** e **Freesound**, estas duas **só itens marcados CC0** (ou CC BY, com crédito).
- Catálogo: `audio/catalogo.json` — um registro por arquivo: `arquivo`, `categoria`, `origem` (biblioteca ou ferramenta +
  versão), `licenca`, `autor`, `url`, `prompt` (se gerado), `data`. Créditos na tela Créditos e em `docs/LEGAL.md` §4;
  declaração de IA na página da Steam (`docs/STEAM.md`).
- Arquivos: originais (WAV/FLAC) ficam **fora do git** (PC do dono); no repositório entram só os comprimidos (OGG Vorbis, música
  q5 estéreo, efeitos q4 mono) em `public/audio/{musica,sfx,voz,ambiente}/`. Orçamento: ≤ 80 MB no total por enquanto.

## O que produzir

### Música (orquestral épica, com toques modais gregos; faixas em loop de 2–3 min, mais um "stinger" curto)
Primeiro lote (para a fatia U1): **menu**, **paz Era I**, **paz Era II**, **batalha 1** (tensão), **vitória**, **derrota**.
Depois: paz das Eras III–VIII (cada Era com mais instrumentos e cor — bronze e cordas → coral e metais → orquestra cheia →
sintetizadores discretos nas Eras industriais), **batalha 2 e 3** (intensidades), **Titãs** (tema de chefe), **tela de carregamento**,
**campanha** (um tema por ato + um por missão-chave), **créditos**.
Receita de prompt (inglês): `epic orchestral, ancient Greek, [Dorian/Phrygian mode], aulos and lyre accents, frame drums,
brass and strings, cinematic, loopable, no vocals, 90 bpm` (variar andamento e instrumentação por faixa). Exigir loop limpo:
gerar 3 versões, escolher a melhor e fechar o loop por cross-fade (`ffmpeg`).

### Efeitos sonoros (SFX)
UI (clique, passar o mouse, erro, notificação, pesquisa concluída, **fanfarra de nova Era**) · combate (golpe de espada, lança,
escudo, flecha e impacto, pedra de catapulta, aríete, **queda de unidade**, queda de edifício, fogo) · movimento (passos por
terreno, cavalo, carroça) · construção (martelo, serra, conclusão) · economia (machado, picareta, colheita, reza no templo) ·
**poderes divinos** (os 12 de hoje: Raio, Isca, Sentinelas, Restauração, Trégua, Pestilência, Oráculo, Pele de Bronze, Maldição,
Tempestade de Raios, Abundância, Terremoto; depois os 9 novos) · **criaturas** (rugido/grito de cada mítica e Titã) ·
**ambiente** (vento, pássaros, água/mar, grilos à noite, fogueira) — em camadas por bioma e hora.

### Vozes
- **Respostas das unidades** (ao selecionar e ao receber ordem): por classe — cidadão, hoplita/infantaria, arqueiro, cavalaria,
  cerco, **cada um dos 5 heróis**, míticas (grunhidos), Titãs — 4 a 6 falas curtas por classe e tipo de resposta (hoje o
  jogo já escolhe por classe: `Audio.ack` / `ACKS`). Língua: falas curtas em **português do Brasil** e **inglês** (o jogo é
  bilíngue), mais gritos de esforço/dor/morte sem palavras (valem para os dois).
- **Deuses e narrador**: anúncio de cada poder ("Raio de Zeus!"), de nova Era e de vitória/derrota; tom grave e solene, uma voz
  por deus maior.
- Campanha: falas dubladas das missões ficam para depois (texto já existe em `src/core/scenario/`).
- Ferramenta: **Kokoro**/**Piper** localmente (a confirmar a licença de cada voz); processar com ecualização e reverb leve
  para o tom épico. Nunca imitar a voz de uma pessoa real.

## Como entra no jogo

- **Jogo web**: `src/audio/` passa a tocar arquivos (`AudioBuffer`) quando existirem, **com o sintetizador como reserva**
  (mesmo padrão do terreno fotográfico); o catálogo vira um índice `public/audio/indice.json` (id → arquivo, volume, variações
  aleatórias). Os eventos e a lógica de resposta por classe continuam os de hoje.
- **Unreal**: Sound Cues/MetaSounds importando os mesmos arquivos; a ponte já manda `events` e `effects` com tipo e posição
  (`docs/UNREAL.md`), que viram sons posicionais.

## Marcos
1. **A1** (pedido 0007): fontes e licenças confirmadas, ferramentas rodando na RTX 4070 Ti, **primeiro lote**: 6 músicas, ~60
   efeitos essenciais, vozes de cidadão/hoplita/arqueiro/cavalaria e dos 3 deuses maiores; catálogo e créditos.
2. **A2**: integração no jogo web (reserva sintetizada) e no Unreal (U1).
3. **A3**: lotes por Era, criaturas, poderes novos, heróis e campanha, junto das etapas E1–E7.
4. Mais perto do lançamento: compositor para a trilha principal, se houver orçamento (as faixas de IA servem de referência).
