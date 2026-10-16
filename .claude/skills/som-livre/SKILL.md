---
name: som-livre
description: 'Procura, confere a licença, trata e registra efeito sonoro e música do Age of Earth, na mesma linha da skill modelo-3d. Use antes de baixar, gravar ou gerar qualquer som, quando o Felipe pedir "põe um som de...", "troca a música" ou "falta áudio", e sempre que um som novo entrar no jogo.'
---
# Som livre: procurar, conferir, registrar

Regra do Age of Earth: decisão de 09/10/2026 (`docs/AUDIO.md`): trocar o som sintetizado por áudio orquestral épico, com vozes, vindo
de IA e de bibliotecas livres. Só CC0, CC BY 4.0 ou ferramenta com uso comercial; confira a licença dos pesos e os
termos do serviço; dúvida, não entra; nunca imitar voz de pessoa real. Candidatas: ACE-Step, Stable Audio Open, Kokoro,
Piper. Proibidas: MusicGen, XTTS/Coqui e os planos gratuitos do Suno, do Udio e do ElevenLabs.

## Onde procurar, nesta ordem

1. O que o jogo já tem: o som sintetizado de `src/audio/` (WebAudio, sem arquivo). O pedido 0007 (música, efeitos e vozes pela sessão
   local) está ADIADO: não atenda sem o Felipe liberar.
2. **Sonniss GDC Game Audio Bundle**: milhares de efeitos gravados por estúdios, livres para jogo comercial, sem crédito
   obrigatório. A licença proíbe redistribuir o som solto: os originais ficam fora do git (regra do `docs/AUDIO.md`); no repositório só entra o OGG convertido, e só se a
   licença permitir num repositório público. Na dúvida, pergunte ao Felipe.
3. **Kenney** (pacotes de áudio CC0) e **Freesound** filtrado por licença **CC0** (ou CC BY, com crédito). O download
   do Freesound em qualidade original exige login: quem baixa é o Felipe.
4. **OpenGameArt**: só itens CC0 ou CC BY; confira a licença item por item, não a do pacote.
5. Gerar ou encomendar: pelas ferramentas candidatas do `docs/AUDIO.md`, na sessão local, com o prompt guardado no catálogo.

Recusa: NC, ND, "uso pessoal", som de outro jogo ou filme, música com letra ou melodia conhecida, a BBC Sound Effects
(licença não comercial), e som de marca (vinheta, buzina registrada).

## Tratar antes de entrar

- Corte o silêncio do começo e do fim e confira se não estala no corte.
- Volume: normalize por categoria com o ffmpeg. Sem alvo escrito no jogo, use -23 LUFS integrado e pico de -1 dBTP:
  ```bash
  ffmpeg -i entrada.wav -af loudnorm=I=-23:TP=-1:LRA=11 -ar 48000 saida.wav
  ```
- Formato: OGG em `public/audio/{musica,sfx,voz,ambiente}/`, até 80 MB no total; no Unreal, WAV 48 kHz importado pela
  sessão local.

## Registrar (no mesmo commit)

Uma entrada no `audio/catalogo.json` (campos `arquivo`, `categoria`, `origem`, `licenca`, `autor`, `url`,
`prompt`, `data`; crie o arquivo com o primeiro som), a linha em `docs/LEGAL.md` §4 e o texto da tela Créditos.
Som gerado por IA entra marcado e vai para a declaração (skill `declaracao-ia`).
