# QA — matriz de testes e checklist de lançamento (Fase 6.8)

## Verificações automáticas (rodar antes de cada build publicado)

| Comando | O que cobre | Tempo |
|---|---|---|
| `npm run typecheck` | Tipos estritos | ~10 s |
| `npm test` | 89 testes: dados, determinismo, pathfinding, simulação, regressões, cenários, lockstep/reconexão, modos, mapas fixos | ~5 s |
| `npm run balance 30 1,2,3,4,5,6` | 6 partidas IA×IA de 30 min: idades (Clássica ~5, Heroica 12–18, Mítica 19–26), ninguém travado | ~2 min |
| `npx tsx scripts/missions.ts` | As 3 missões carregam e os gatilhos disparam | ~10 s |
| `npm run map:check src/core/data/maps/*.map.json` | Mapas embutidos válidos e 2 min de IA em cada | ~10 s |
| `npx tsx scripts/perf.ts` | Mapa grande, 4 IAs Muito difícil: média < 3 ms/tick, pior tick < 50 ms | ~1 min |
| `node scripts/renderperf.mjs` | Custo do renderizador com ~200 unidades e 150 edifícios: média < 1 ms/quadro, rolagem p95 < 10 ms (software) | ~1 min |
| `npm run preview` + `node scripts/playtest.mjs` | Partida no navegador: construir, treinar, avançar, poderes, salvar/carregar | ~1 min |
| `node scripts/playtest-campaign.mjs`, `playtest-horde-replay.mjs`, `playtest-garrison.mjs` | Campanha, Horda/replay, guarnição/portões | ~2 min |
| `node scripts/playtest-options.mjs`, `playtest-i18n.mjs`, `playtest-modes.mjs`, `playtest-fixedmap.mjs` | Opções/atalhos/diagnóstico, inglês, modos de jogo, exportar/carregar mapa fixo | ~2 min |
| `node scripts/playtest-editor.mjs` | Editor de mapas: novo mapa gerado, pintar lago/bosque com o mouse, torre e hoplita por jogador, mover início, desfazer/refazer, validação (Ir até/Corrigir), salvar, Testar (partida real) e voltar à mesma instância, exportar, P/F5 sem efeito, Esc/menu | ~1 min |
| `npm run relay` + `node scripts/playtest-mp.mjs`, `playtest-reconnect.mjs`, `playtest-mp-fixedmap.mjs`, `playtest-rooms.mjs`, `playtest-spectate.mjs` | Dois navegadores em lockstep, chat, ping, queda e reconexão, mapa fixo no lobby, lista de salas, espectadores | ~4 min |
| `npm run relay` + `node scripts/playtest-scenario.mjs [url] [relay]` | Cenário JSON embutido: editor → Gatilhos (modelos, validação ao vivo com path, JSON inválido bloqueia Salvar) → Testar com cenário (intro, objetivos, diálogo) e voltar ao editor; exportar/importar em Campanha → Cenários personalizados (id reservado recusado, sem progresso da campanha); multiplayer com "Cenário: …" no lobby, scenarioData nos dois clientes e mesmo hash | ~2 min |

## Matriz manual (por versão candidata)

| Ambiente | Mínimo | Verificar |
|---|---|---|
| Windows 10/11, GPU integrada | 60 fps no menu, ≥ 30 fps em partida grande | Tela cheia/janela, F11, escala da interface 125%, teclado ABNT (atalhos), salvar/carregar/exportar, conquistas Steam |
| Windows, GPU dedicada | 60 fps | Qualidade de renderização 100%, mapa grande com 4 IAs Muito difícil por 30 min |
| Linux (Steam Deck em modo desktop e Gaming Mode) | 40 fps a 1280×800 | Legibilidade com escala 130%, controle Steam Input mapeado como mouse/teclado, tela cheia |
| macOS | 60 fps | Tela cheia nativa, atalhos com ⌘ não conflitando (Ctrl+M/Ctrl+A) |
| Máquina fraca (4 GB, GPU antiga) | Jogável a 50% de renderização | Sem travamentos; tempo de carregamento < 10 s |

Para cada linha: 1 partida rápida completa (vitória por conquista), 1 missão da campanha, 1 partida online com outro computador
(chat, queda proposital e reconexão), 1 Horda até a onda 10.

## Checklist de lançamento (Early Access)

- [ ] Versão e notas de atualização (PT/EN) escritas; `desktop/package.json` com a versão certa.
- [ ] Build Electron para Windows (x64), Linux (x64) e macOS; testes de fumaça em cada um.
- [ ] `THIRD_PARTY.txt`, EULA e política de privacidade incluídos e linkados (ver `docs/LEGAL.md`).
- [ ] Conquistas cadastradas no Steamworks com os mesmos ids de `src/game/achievements.ts`.
- [ ] Servidor de retransmissão em produção (VPS com `wss://` e certificado), endereço padrão no jogo apontando para ele, monitoramento de uptime.
- [ ] Página da Steam: cápsulas, 6+ screenshots atuais, trailer, descrição PT/EN, tags, requisitos mínimos/recomendados.
- [ ] Depot e branches na Steam: `default` (público) e `beta` (testadores); upload via SteamPipe testado com a conta de desenvolvedor.
- [ ] Plano de hotfix: quem aprova, como publicar em < 24 h, canal de suporte (Discord/e-mail) na página.
- [ ] Backup do repositório e das chaves (Steamworks, certificado do servidor).

## Relato de problemas pelos jogadores

Pedir sempre: (1) o arquivo do **diagnóstico** (menu da partida → "Exportar diagnóstico"), (2) o que estava fazendo,
(3) se era online, o nome da sala e o horário. O diagnóstico contém o save, as configurações, os últimos erros e o relatório de
dessincronização — permite reproduzir a partida localmente com `Session.load`.
