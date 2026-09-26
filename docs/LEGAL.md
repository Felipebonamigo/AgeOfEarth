# Documentos legais — rascunhos para revisão (Fase 6.7)

> **Atenção:** estes textos são rascunhos gerados para acelerar o trabalho. Antes de publicar na Steam, o dono do projeto
> deve revisá-los (idealmente com um advogado). Eles não constituem aconselhamento jurídico.
> Tudo o que depende do dono aparece como **[DONO: …]** e está reunido em §7.
> Conferido contra o código em 26/09/2026: as tabelas de §1 descrevem o que o jogo faz **hoje** (commit desta revisão).
> Qualquer mudança em `server/relay.mjs`, `src/game/cloud.ts`, `desktop/main.cjs` ou no diagnóstico exportado pede revisar §1 e §2.

## 1. O que o jogo faz com dados (base para a política de privacidade)

### 1.1 No computador do jogador
| Dado | Onde fica | Finalidade | Retenção |
|---|---|---|---|
| Opções (volumes, idioma, tela cheia, escala, qualidade, controle) | `localStorage` (navegador ou perfil do Electron); na versão desktop também `saves/settings.json` e `saves/locale.json` no perfil (`docs/STEAM.md` §4.2) | Preferências | Até o jogador apagar |
| Save, último replay, progresso e dificuldade da campanha, conquistas e deuses já jogados, "Meus mapas" e rascunho do editor, última configuração de partida rápida e de sala online (nome, sala, endereço do servidor) | `localStorage`; na versão desktop também `saves/*.json` | Continuar partidas, replays, campanha, conquistas, editor | Até o jogador apagar |
| Ficha de vaga do multiplayer (código aleatório por sala e nome) | `localStorage` (não vai para arquivo nem para a nuvem) | Retomar a vaga depois de uma queda | Até o jogador apagar |
| Relatório de dessincronização (tick, hashes e estado da partida quando ela diverge) | `localStorage` (não vai para arquivo nem para a nuvem) | Suporte (entra no diagnóstico) | Substituído a cada dessincronização |
| Diagnóstico exportado: versão, navegador/sistema (`userAgent`), tamanho da tela, opções, últimos 50 erros do jogo, relatório de dessincronização e o save da partida atual | Arquivo gravado onde o jogador escolher, **só quando ele clica em "Exportar diagnóstico"** | Suporte | Controlado pelo jogador; só chega a nós se ele mandar |

### 1.2 Steam (versão desktop aberta pela Steam; tratado pela Valve)
| Dado | O que o jogo faz |
|---|---|
| Nome do perfil Steam | Lido pela ponte (`steamName`) e impresso no log local do processo ao iniciar; o jogo **não o usa nem o envia** a ninguém hoje |
| Conquistas | Enviadas à conta Steam quando destravadas (e as já destravadas são reenviadas ao iniciar) |
| Rich Presence | Texto de status visível aos amigos: "No menu principal" ou "‹Idade› · ‹minutos› min" |
| Steam Cloud | Se o jogador tiver o Steam Cloud ligado, a Steam copia os arquivos `saves/*.json` (§1.1) para a conta dele e os traz de volta em outra máquina |

Esses dados são tratados pela Valve conforme o Acordo de Assinante Steam e a Política de Privacidade da Steam; não recebemos
nada deles além dos números agregados que o painel do Steamworks mostra a todo desenvolvedor (vendas, conquistas destravadas em %).

### 1.3 Multiplayer — servidor de retransmissão (`server/relay.mjs`)
| Dado | Onde / quem vê | Finalidade | Retenção |
|---|---|---|---|
| Endereço IP e porta da conexão | O servidor vê (inerente ao WebSocket/TCP); **não grava, não registra no log e não usa para nada** (os limites anti-abuso são por conexão) | Transporte | Enquanto a conexão durar |
| Nome de jogador (até 18 caracteres), deus, time, "pronto", latência (ping), código da sala | Memória do servidor; repassados aos jogadores e espectadores da sala | Lobby e partida | Descartado ao fechar a sala |
| Salas públicas: código, nome do anfitrião, jogadores/espectadores, modo, mapa, versão da simulação | Qualquer pessoa conectada ao mesmo servidor que abra a lista de salas | Lista de salas | Some quando a sala fecha ou o anfitrião a torna privada (a iniciada fica listada só para assistir) |
| Configuração da partida (semente, mapa, cenário) e ficha de vaga (16 bytes aleatórios) | Memória do servidor | Reconexão de quem cair | Descartadas ao fechar a sala |
| Comandos da partida, hashes de verificação e o instantâneo de reconexão (estado da partida, do anfitrião para quem volta) | Repassados entre os jogadores da sala | Lockstep, detecção de dessincronização, reconexão | **Não armazenados** |
| Bate-papo (até 200 caracteres por mensagem, texto puro) | Repassado aos jogadores e espectadores da sala | Comunicação | **Não gravado nem registrado** |
| Log do servidor (saída padrão) | Operador do servidor | Operação | Só a porta ao iniciar e erros técnicos (código do erro e tipo da mensagem que falhou) — sem nomes, IPs, chat ou comandos. Retenção: **[DONO: rotação/retenção do log em produção]** |

O endereço do servidor é digitado pelo jogador. Padrão hoje (`defaultRelayUrl` em `src/ui/menu.ts`): no navegador, o
mesmo host da página, porta 8787; na versão desktop, `ws://localhost:8787` (um servidor na própria máquina); quando houver
servidor oficial, `OFFICIAL_RELAY_URL` passa a ser o padrão nos dois. Servidor oficial em
produção: **[DONO: endereço `wss://`, quem opera, provedor e país/região; preencher `OFFICIAL_RELAY_URL`]**. Um servidor de terceiros escolhido pelo jogador
é responsabilidade de quem o opera.

### 1.4 O que o jogo não faz
- **Nenhuma telemetria**, analytics, rastreador, publicidade, perfil de jogador ou relatório automático de falhas (o
  `crashReporter` do Electron não é ligado). Os únicos pedidos de rede são os arquivos do próprio jogo e o servidor de
  multiplayer que o jogador escolher — sem CDN, fontes externas nem atualizador automático. Na versão desktop o corretor
  ortográfico do Chromium fica desligado (`desktop/main.cjs`), porque ligado ele baixaria da Google o dicionário do idioma
  do sistema ao abrir o jogo; `scripts/playtest-desktop.mjs` grava o log de rede do Chromium e falha se aparecer qualquer
  host fora de `app://`, `file://` e `127.0.0.1`/`localhost`.
- Nenhuma conta, e-mail, senha ou dado de pagamento (a compra é feita na Steam).
- Se a telemetria opt-in (6.6) ou um servidor de lobby com contas entrar, §1 e a política (§2) precisam ser atualizadas **antes**.

## 2. Política de privacidade (rascunho)

### 2.1 PT-BR
**Age of Earth — Política de Privacidade** · Última atualização: **[DONO: data da publicação]**

**[DONO: razão social, CNPJ e endereço]** ("nós") desenvolve o jogo Age of Earth ("Jogo"). Esta política explica quais
dados são tratados quando você joga.

1. **Dados no seu computador.** Opções, jogos salvos, replays, progresso da campanha, conquistas e mapas criados no editor
   ficam no seu dispositivo. Na versão para computador eles também são gravados como arquivos na pasta do jogo no seu perfil
   de usuário. Não temos acesso a eles.
2. **Steam.** Quando você joga pela Steam, a Valve trata o seu perfil, as conquistas, o status visível aos amigos ("No menu
   principal", "Idade Heroica · 12 min") e, se você ligar o Steam Cloud, a cópia dos arquivos salvos, conforme a política de
   privacidade da Steam. O Jogo lê o nome do seu perfil Steam, mas não o usa nem o envia a ninguém.
3. **Multiplayer.** Ao entrar em uma sala online, o seu nome de jogador, o deus escolhido, o time, a latência e as mensagens
   de bate-papo são enviados ao servidor de retransmissão e repassados aos outros jogadores (e espectadores) da sala. Se a sala
   for pública, o nome do anfitrião aparece na lista de salas. O servidor vê o endereço IP da conexão, como qualquer servidor
   na internet, mas não o grava. Nada disso é armazenado depois que a sala fecha; o bate-papo nunca é gravado. O servidor
   oficial é operado por **[DONO: nós / empresa contratada, provedor e país]**; se você digitar o endereço de outro servidor,
   quem o opera é responsável por ele.
4. **Relatórios de problema.** Se você exportar um diagnóstico, o arquivo contém a versão do jogo, informações do navegador/
   sistema, tamanho da tela, opções, mensagens de erro e o estado da partida. Ele só é enviado se você o encaminhar a nós
   voluntariamente, e é usado apenas para corrigir o problema e apagado em **[DONO: prazo, ex.: 90 dias]** depois de resolvido.
5. **O que não fazemos.** O Jogo não tem telemetria, publicidade nem rastreadores, não cria perfis e não pede e-mail, senha
   ou dados de pagamento.
6. **Base legal (LGPD).** O tratamento do item 3 é necessário para executar o serviço que você pede (art. 7º, V, da Lei
   13.709/2018); o do item 4, o seu consentimento ao nos enviar o arquivo (art. 7º, I). Não vendemos nem compartilhamos dados.
7. **Crianças e adolescentes.** O Jogo não pede dados pessoais além do nome de jogador (que pode ser um apelido) no multiplayer.
   **[DONO: idade mínima e texto conforme a classificação indicativa/IARC e o art. 14 da LGPD]**
8. **Seus direitos.** Você pode pedir informação, correção ou eliminação dos dados que eventualmente tenhamos recebido (por
   exemplo, um diagnóstico enviado) pelo e-mail **[DONO: contato de privacidade]**. Como o servidor não guarda dados das
   partidas, não há histórico a eliminar. Você também pode reclamar à ANPD.
9. **Alterações.** Atualizaremos esta política antes de o Jogo passar a tratar novos dados (por exemplo, telemetria opcional),
   com aviso na página da Steam.

Contato: **[DONO: e-mail]** · Controlador: **[DONO: razão social, CNPJ]** · Encarregado/canal de comunicação (LGPD art. 41):
**[DONO: nome ou canal; agentes de pequeno porte podem só indicar o canal, Resolução CD/ANPD nº 2/2022]**

### 2.2 EN (for the Steam store page)
**Age of Earth — Privacy Policy** · Last updated: **[OWNER: date]**

**[OWNER: company name, registration number and address]** ("we") develops Age of Earth (the "Game").
1. **On your computer.** Settings, saved games, replays, campaign progress, achievements and editor maps stay on your device
   (the desktop version also writes them as files in the game's folder in your user profile). We have no access to them.
2. **Steam.** When you play through Steam, Valve processes your profile, achievements, the status shown to friends and, if you
   enable Steam Cloud, the copy of your save files, under Steam's privacy policy. The Game reads your Steam profile name but
   neither uses nor sends it anywhere.
3. **Multiplayer.** In an online room, your player name, chosen god, team, latency and chat messages are sent to the relay
   server and forwarded to the other players and spectators in the room; a public room lists the host's name. The server sees
   your connection's IP address, as any internet server does, but does not store it. Nothing is kept after the room closes;
   chat is never recorded. The official server is operated by **[OWNER: operator, provider, country]**.
4. **Problem reports.** An exported diagnostic file (game version, browser/system info, screen size, settings, error messages,
   match state) only reaches us if you send it; we use it only to fix the problem and delete it **[OWNER: period]** after.
5. **We do not** run telemetry, ads or trackers, build profiles, or ask for e-mail, passwords or payment data.
6. **Your rights** (including under Brazil's LGPD): contact **[OWNER: e-mail]**.

## 3. EULA (rascunho, PT-BR)

**Contrato de Licença de Usuário Final — Age of Earth**

1. **Licença.** **[DONO: razão social]** concede a você uma licença pessoal, não exclusiva e intransferível para instalar e
   jogar o Jogo, para fins não comerciais, sujeita a este contrato e ao Acordo de Assinante Steam.
2. **Restrições.** Você não pode redistribuir, vender, alugar, descompilar (salvo quando permitido por lei) ou remover avisos
   de propriedade do Jogo. Trapaças e modificações que prejudiquem outros jogadores no multiplayer são proibidas (o servidor
   descarta comandos inválidos e desconecta quem excede os limites de mensagens).
3. **Conduta online.** Nomes de jogador e mensagens de bate-papo não podem ser ofensivos, ilegais ou violar direitos de
   terceiros. O anfitrião de uma sala pode expulsar jogadores. **[DONO: canal para denúncias]**
4. **Serviços online.** O multiplayer depende de um servidor de retransmissão que pode ficar indisponível, mudar ou ser
   descontinuado; o modo de um jogador, a campanha e o editor funcionam sem ele. **[DONO: publicar o código do servidor de
   retransmissão (`server/relay.mjs`, que hoje não vai no pacote do jogo)? Onde (repositório, licença)? Se sim, acrescentar:
   "o código do servidor está disponível em ‹endereço› e qualquer pessoa pode operar o seu".]**
5. **Conteúdo criado pelo usuário.** Mapas e cenários criados no editor pertencem a você. Ao compartilhá-los (por exemplo,
   no Steam Workshop), você nos concede licença gratuita para exibi-los e distribuí-los dentro do Jogo e garante que não
   violam direitos de terceiros.
6. **Propriedade.** O Jogo (código, arte, música, textos) é protegido por direitos autorais e pertence a **[DONO: razão
   social]** ou a seus licenciadores. Componentes de terceiros seguem as próprias licenças (tela Créditos e `THIRD_PARTY.md`).
7. **Garantia e responsabilidade.** O Jogo é fornecido "no estado em que se encontra". Na extensão permitida pela lei, não
   nos responsabilizamos por danos indiretos decorrentes do uso do Jogo. Nada neste contrato reduz os direitos do consumidor
   previstos no CDC (Lei 8.078/1990).
8. **Rescisão.** A licença termina automaticamente se você descumprir este contrato.
9. **Lei aplicável.** Lei brasileira; foro de **[DONO: cidade/UF]**, ressalvado o foro do domicílio do consumidor.

## 4. Licenças de terceiros (gerada por script)

- `npx tsx scripts/licenses.ts` lê os `package-lock.json` (raiz e `desktop/`) e o `node_modules` e gera
  **`docs/THIRD_PARTY.md`** (tabela por destino + texto completo de cada licença; vai no pacote desktop em
  `resources/THIRD_PARTY.md`) e **`src/ui/third-party.json`** (lista enxuta embutida no build e mostrada na tela
  **Créditos** do menu principal, com os textos-padrão MIT/ISC/BSD-3-Clause). O Electron ainda põe `LICENSE.electron.txt`
  e `LICENSES.chromium.html` ao lado do executável.
- Rode de novo quando mudar uma dependência (`--check` só confere). `tests/steam.test.ts` falha se uma dependência
  distribuída não tiver licença conhecida ou tiver copyleft forte (GPL, AGPL, SSPL…) e se a lista embutida não bater com os
  lockfiles.
- Hoje (26/09/2026): **jogo** — pixi.js 8.21 e 11 dependências (MIT, ISC, BSD-3-Clause); **desktop** — electron 33.4
  (MIT; Chromium BSD-3-Clause e outras, Node.js MIT, FFmpeg LGPL-2.1+ como biblioteca dinâmica substituível, na versão
  sem codecs proprietários — sem H.264/AAC — que `desktop/after-pack.cjs` põe no lugar da padrão do Electron ao empacotar;
  `scripts/playtest-desktop.mjs` confere o binário),
  steamworks.js 0.4 (MIT) com a biblioteca `steam_api` da Valve (Steamworks SDK Access Agreement, redistribuível pelo
  parceiro Steamworks); **relay** — ws 8.21 (MIT). Nenhuma GPL/AGPL.
- Ferramentas de desenvolvimento (Vite, TypeScript, Vitest, Playwright, three.js, pngjs, pixelmatch, electron-builder) não vão
  no pacote. Música e efeitos são sintetizados pelo próprio código (`src/audio/`); fontes são as do sistema (nenhuma embutida);
  a arte é do projeto (texturas procedurais e sprites assados de modelos paramétricos próprios).
- **[DONO: ao adquirir fontes, música, SFX ou arte de terceiros (Fase 2), registrar licença, autor e escopo aqui e na tela Créditos]**

## 5. Créditos (no jogo)

Menu principal → **🎖 Créditos** (PT/EN; `src/ui/credits.ts`, captura em `docs/art/creditos-{pt,en}.png`): equipe
("Felipe Bonamigo — criação e direção", "Desenvolvido com assistência de IA (Claude Code)"), arte e áudio, tecnologias,
licenças de terceiros com os textos e o aviso de marcas ("Rise of Nations e Age of Mythology são marcas de seus
respectivos donos; Age of Earth não é afiliado a eles").
**[DONO: nome da empresa, cargos definitivos, artistas/compositores contratados, testadores e agradecimentos]**

## 6. Checklist antes de publicar

- [ ] Preencher todos os **[DONO: …]** e revisar com um advogado (§7).
- [ ] Publicar a política de privacidade (PT e EN) em uma URL pública (a Steam pede o link) e linká-la no jogo (tela Créditos ou Opções).
- [ ] Definir quem opera o servidor de retransmissão em produção, onde roda e a retenção do log; atualizar §1.3 e §2.
- [x] Lista de licenças de terceiros gerada e embutida (tela Créditos, `resources/THIRD_PARTY.md`), com teste contra GPL/AGPL.
- [ ] Rodar `npx tsx scripts/licenses.ts --check` antes de cada build publicada (está no checklist de `docs/QA.md`).
- [ ] Classificação indicativa: combate estilizado sem sangue realista, bate-papo entre jogadores (interação online); preencher o questionário IARC na Steam.
- [ ] Exibir o EULA na Steam (Steamworks → EULA) ou aceitar o EULA padrão da Steam.

## 7. Pendências do dono (resumo)

| Campo | Onde entra |
|---|---|
| Razão social, CNPJ, endereço (6.1) | §2 (controlador), §3 (licenciante), EULA na Steam |
| E-mail de contato/privacidade e canal de denúncias | §2.1 itens 8 e rodapé, §2.2, §3 item 3, página da Steam |
| Publicar ou não o código do servidor de retransmissão (onde, licença) | §3 item 4 |
| Encarregado (LGPD art. 41) ou canal de comunicação | §2.1 rodapé |
| Foro (cidade/UF) | §3 item 9 |
| Servidor oficial de multiplayer: endereço `wss://`, operador, provedor, país, retenção do log | §1.3, §2.1 item 3, §2.2 item 3, `docs/QA.md` |
| Prazo para apagar diagnósticos recebidos | §2.1 item 4, §2.2 item 4 |
| Idade mínima / texto para crianças conforme a classificação | §2.1 item 7 |
| Data de publicação da política e URL pública | §2 |
| Revisão por advogado | tudo |
| Créditos definitivos (empresa, cargos, artistas, testadores) | §5 e `src/i18n/strings.ts` (`credits.*`) |
