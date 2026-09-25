# Documentos legais — rascunhos para revisão (Fase 6.7)

> **Atenção:** estes textos são rascunhos gerados para acelerar o trabalho. Antes de publicar na Steam, o dono do projeto
> deve revisá-los (idealmente com um advogado) e preencher os campos entre colchetes. Eles não constituem aconselhamento jurídico.

## 1. O que o jogo coleta e por quê (base para a política de privacidade)

| Dado | Onde fica | Finalidade | Retenção |
|---|---|---|---|
| Configurações (volume, idioma, tela cheia…) | `localStorage` do jogador / perfil do Electron | Preferências | Até o jogador apagar |
| Saves, replays, grupos de controle | `localStorage` e arquivos exportados pelo jogador | Continuar partidas | Até o jogador apagar |
| Conquistas | Steam (Steamworks) quando disponível | Conquistas na Steam | Conforme a Steam |
| Nome de jogador, deus escolhido, sala, latência (ping) | Servidor de retransmissão (`server/relay.mjs`), **só em memória** durante a partida | Lobby e multiplayer em lockstep | Descartado ao fechar a sala |
| Código da sala, nome do anfitrião, vagas e modo (salas marcadas como públicas) | Servidor de retransmissão, só em memória; visível a qualquer jogador conectado ao mesmo servidor que abra a lista de salas | Lista pública de salas | Some quando a sala fecha, inicia ou o anfitrião a torna privada |
| Comandos da partida (ordens de unidades) e hashes do estado | Retransmitidos entre os jogadores pelo relay; não são gravados no servidor | Sincronizar a partida | Não são armazenados |
| Mensagens de bate-papo | Retransmitidas pelo relay; não são gravadas | Comunicação na sala/partida | Não são armazenadas |
| Relatório de dessincronização e diagnóstico | Só no computador do jogador; enviado **apenas** se o jogador exportar e mandar manualmente | Suporte | Controlado pelo jogador |

O jogo **não** coleta e-mail, senha, endereço IP para fins de perfil, dados de pagamento, nem usa rastreadores de publicidade.
O servidor de retransmissão vê o endereço IP das conexões (inerente ao protocolo), mas não o registra em disco na versão atual.
Se telemetria opt-in for adicionada (6.6), esta tabela e a política devem ser atualizadas antes.

## 2. Política de privacidade (rascunho, PT-BR)

**Age of Earth — Política de Privacidade** · Última atualização: [data]

[Nome/empresa do desenvolvedor] ("nós") desenvolve o jogo Age of Earth ("Jogo"). Esta política explica quais dados são
tratados quando você joga.

1. **Dados no seu computador.** Configurações, jogos salvos, replays e conquistas ficam no seu dispositivo (e, quando
   você joga pela Steam, as conquistas são sincronizadas com a sua conta Steam pela Valve, conforme a política de privacidade da Steam).
2. **Multiplayer.** Ao entrar em uma sala online, o seu nome de jogador, o deus escolhido, a latência e as mensagens de
   bate-papo são enviados ao servidor de retransmissão e repassados aos outros jogadores da sala. Esses dados existem apenas
   durante a partida e não são gravados pelo servidor. O servidor pode ser operado por nós ou por um terceiro que você escolher
   (o endereço é configurável no jogo).
3. **Relatórios de problema.** Se você exportar um diagnóstico, o arquivo contém configurações, mensagens de erro e o estado
   da partida. Ele só é enviado se você o encaminhar a nós voluntariamente, e é usado apenas para corrigir o problema.
4. **Base legal (LGPD).** O tratamento descrito no item 2 é necessário para a execução do serviço que você solicita (art. 7º, V,
   da Lei 13.709/2018). Não vendemos nem compartilhamos dados com terceiros para publicidade.
5. **Crianças.** O Jogo não coleta dados pessoais conscientemente de menores de 13 anos além do necessário ao multiplayer descrito acima.
6. **Seus direitos.** Você pode solicitar informações, correção ou eliminação dos dados que eventualmente tenhamos recebido
   (por exemplo, um diagnóstico enviado) pelo e-mail [contato]. Como o servidor não guarda dados das partidas, não há histórico a eliminar.
7. **Alterações.** Atualizaremos esta política quando o Jogo passar a tratar novos dados (por exemplo, telemetria opcional), com aviso na página da Steam.

Contato: [e-mail] · Responsável: [nome/empresa, CNPJ]

## 3. EULA (rascunho, PT-BR)

**Contrato de Licença de Usuário Final — Age of Earth**

1. **Licença.** [Empresa] concede a você uma licença pessoal, não exclusiva e intransferível para instalar e jogar o Jogo, para fins
   não comerciais, sujeita a este contrato e ao Acordo de Assinante Steam.
2. **Restrições.** Você não pode redistribuir, vender, alugar, descompilar (salvo quando permitido por lei) ou remover avisos de
   propriedade do Jogo. Trapaças e modificações que prejudiquem outros jogadores no multiplayer são proibidas.
3. **Conteúdo criado pelo usuário.** Mapas e cenários criados no editor pertencem a você. Ao compartilhá-los (por exemplo, no Steam
   Workshop), você nos concede licença gratuita para exibi-los e distribuí-los dentro do Jogo, e garante que não violam direitos de terceiros.
4. **Propriedade.** O Jogo (código, arte, música, textos) é protegido por direitos autorais e pertence a [Empresa] ou a seus licenciadores.
5. **Garantia e responsabilidade.** O Jogo é fornecido "no estado em que se encontra". Na extensão permitida pela lei, não nos
   responsabilizamos por danos indiretos decorrentes do uso do Jogo. Nada neste contrato reduz os direitos do consumidor previstos no CDC.
6. **Rescisão.** A licença termina automaticamente se você descumprir este contrato.
7. **Lei aplicável.** Lei brasileira; foro de [cidade/UF], salvo regras protetivas do consumidor.

## 4. Licenças de terceiros (a manter atualizada)

| Componente | Licença | Uso |
|---|---|---|
| PixiJS | MIT | Renderização |
| Electron | MIT | Empacotamento desktop |
| steamworks.js | MIT | Integração Steam |
| ws | MIT | Servidor de retransmissão |
| Vite, TypeScript, Vitest, Playwright | MIT / Apache-2.0 | Ferramentas de desenvolvimento (não distribuídas) |
| Fontes, música e efeitos sonoros | [preencher ao adquirir os assets — Fase 2] | Arte e áudio |

Mantenha os textos de licença MIT dos pacotes distribuídos em `desktop/THIRD_PARTY.txt` (gerar com `npx license-checker --production`
antes de cada build).

## 5. Créditos (modelo)

Age of Earth · [Empresa] · Direção e programação: [nome] · Programação assistida por IA (Claude) · Arte: [artista] · Música: [compositor] ·
Agradecimentos: testadores [nomes]. Rise of Nations e Age of Mythology são marcas de seus respectivos donos; Age of Earth não é afiliado a eles.

## 6. Checklist antes de publicar

- [ ] Preencher todos os campos entre colchetes e revisar com um advogado.
- [ ] Publicar a política de privacidade em uma URL pública (a Steam pede o link) e no menu do jogo (Opções → Sobre).
- [ ] Definir quem opera o servidor de retransmissão em produção e onde ele roda (região, provedor) — atualizar o item 2 da política.
- [ ] Gerar `THIRD_PARTY.txt` e incluir no build.
- [ ] Classificação indicativa: o Jogo tem combate estilizado sem sangue realista; preencher o questionário IARC na Steam.
