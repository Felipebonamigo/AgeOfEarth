# Age of Earth — Roteiro completo até a Steam

Premissas: um desenvolvedor (você) com 10–15 h/semana para decisões, testes e contatos, mais o agente (eu) para
código, testes e ferramentas; arte e música contratadas ou geradas com ferramentas e revisadas por um artista.
Durações são estimativas de calendário; fases em paralelo compartilham semanas.

Legenda de responsável: **V** = você · **A** = agente (eu) · **T** = terceiros (artista, compositor, Valve).

---

## Fase 0 — Fundação (concluída)
Núcleo determinístico, IA, renderização, HUD, campanha (3 missões), Horda, multiplayer lockstep, replays,
testes, Electron, documentação.

## Fase 1 — Jogabilidade sólida · semanas 1–5
Objetivo: partida rápida e missões divertidas para um jogador humano, sem travamentos.

| # | Passo | Resp. | Semanas |
|---|---|---|---|
| 1.1 | Playtests seus (10+ partidas), registrando o que travou, ficou lento ou fácil | V | 1–5 (contínuo) |
| 1.2 | ✅ Formações de grupo (corpo a corpo à frente, arqueiros, cerco); empurrão suave; destino bloqueado por unidade. Caçada a bugs por agentes concluída: 7 lentes (economia, movimento, combate/IA, produção/tecnologia, estado/rede, cenários, interface), 48 achados corrigidos, 34 testes de regressão + playtests no navegador. Próxima rodada após os playtests humanos | A | 1–2 |
| 1.3 | ✅ Guarnição (Centro Cívico, Fortaleza, Torre; flechas extras; cura; liberar com retorno ao trabalho) e portões. Fila com Shift e auto-coleta já existiam. Pendente: waypoints visuais | A | 2–3 |
| 1.4 | ✅ Dificuldade Muito difícil; IA abriga cidadãos em ataques e libera depois; IA aliada defende centros/fortalezas/templos do time e junta-se às ondas de ataque dos aliados (mesmo alvo) | A | 3–4 |
| 1.5 | Balanceamento por dados (`npm run balance`, 18 sementes por versão). Após a caça a bugs a IA deixou de travar: Clássica ~5 min, Heroica 12–18, Mítica 19–26, Titãs 27–30; partidas terminam em 30 min em ~40% das sementes. Pendente: ajustar custos/tempos com base nos playtests humanos | A | 2–5 |
| 1.6 | ✅ Medido (scripts/perf.ts): mapa grande, 4 IAs Muito difícil, ~260 unidades → média 1–2 ms/tick, pico 28 ms (orçamento 50 ms). Web Worker desnecessário por ora; falta medir renderização em GPU real | A | 4–5 |
| 1.7 | ✅ Sistema de idiomas (PT-BR/EN) cobrindo conteúdo, interface, menus e mensagens da simulação; seletor no menu principal e no menu da partida; teste de completude | A | 4–5 |
| 1.8 | ✅ Exportar/importar save como arquivo (Electron e navegador); opções persistidas (volume, alcances, rolagem na borda, idioma, tela cheia, tamanho da interface, qualidade de renderização) no menu principal e no menu da partida; tela de atalhos gerada a partir dos dados; ajuda traduzida; conquistas (22) com ponte para a Steam | A | 5 |

Marco **M1 (semana 5)**: "vertical slice jogável por terceiros" — enviar para 3–5 amigos testarem.

## Fase 2 — Identidade visual e áudio · semanas 3–14 (paralela)
Objetivo: parar de parecer protótipo. É o caminho crítico do projeto.

| # | Passo | Resp. | Semanas |
|---|---|---|---|
| 2.1 | Direção de arte: escolher estilo (2.5D pintado ou pré-renderizado), paleta, referências; nome/logo definitivos | V + T | 3–4 |
| 2.2 | Contratar artista(s) (ou pipeline com IA + retoque humano); briefing com a lista completa de assets | V + T | 4–5 |
| 2.3 | Assets: ~36 unidades (8 direções × parado/andar/atacar/morrer), 20 edifícios (2 estados + dano), tileset com transições, 60+ ícones, retratos dos 12 deuses, efeitos dos 12 poderes, cursores | T | 5–13 |
| 2.4 | Integração: atlas de sprites e animação por spritesheet no renderizador (substitui `textures.ts`); partículas para poderes | A | 8–14 |
| 2.5 | Interface final: HUD temático (mármore/bronze), fontes, telas de menu e carregamento, tela de vitória | T + A | 9–13 |
| 2.6 | Áudio: ~80 efeitos (unidades, combate, construção, UI, poderes), som ambiente por bioma, trilha (menu + 3 intensidades + batalha), vozes dos deuses (opcional) | T + A | 8–14 |
| 2.7 | Cenas de campanha como ilustrações narradas (barato e bonito) | T | 11–14 |

Marco **M2 (semana 14)**: "arte e som finais no jogo" — trailer de anúncio pode ser gravado.

## Fase 3 — Campanha completa · semanas 6–20
Objetivo: a Titanomaquia em 3 atos, 12–15 missões.

| # | Passo | Resp. | Semanas |
|---|---|---|---|
| 3.1 | Roteiro: sinopse dos 3 atos, personagens, arco do jogador, diálogos por missão | V + A | 6–8 |
| 3.2 | Editor interno de cenários (posicionar edifícios/unidades, pintar terreno, gatilhos em JSON) — base do editor público | A | 7–10 |
| 3.3 | Mapas fixos (salvar/carregar mapas desenhados) | A | 8–9 |
| 3.4 | Produção das missões (2 por semana) com objetivos variados: escolta, defesa, caça ao herói, corrida, maravilha, cerco | A | 9–18 |
| 3.5 | Testes automatizados por missão (viabilidade sem jogador e com jogador roteirizado) | A | 9–18 |
| 3.6 | Dificuldades da campanha e conquistas por missão | A | 18–20 |

Marco **M3 (semana 20)**: campanha completa jogável.

## Fase 4 — Multiplayer robusto · semanas 8–22
| # | Passo | Resp. | Semanas |
|---|---|---|---|
| 4.1 | Lobby: ✅ chat (sala e partida, Enter), ✅ remover jogador (anfitrião), ✅ ping por jogador medido pelo relay, ✅ atraso do lockstep escolhido pela pior latência (2–12 ticks). Pendente: lista pública de salas, espectadores | A | 8–11 |
| 4.2 | ✅ Reconexão por instantâneo: quem cai entra na mesma sala com o mesmo nome, recebe estado + comandos futuros do anfitrião e volta ao lockstep (teste unitário com 3 pares e playtest de dois navegadores). Queda pausa a partida para todos até a reconexão; o anfitrião pode seguir sem o jogador (P) | A | 11–13 |
| 4.3 | Integração Steam Networking Sockets + lobbies e convites da Steam (`steamworks.js`) | A | 16–19 |
| 4.4 | Testes de carga com bots e jogadores reais (4 jogadores, 40 min) | A + V | 19–22 |
| 4.5 | Anti-trapaça básico (validação de comandos, hash) e relatório de desync | A | 20–22 |

Marco **M4 (semana 22)**: partidas online estáveis pela Steam.

## Fase 5 — Profundidade e conteúdo · semanas 14–26
| # | Passo | Resp. | Semanas |
|---|---|---|---|
| 5.1 | ✅ Modos Deathmatch, Regicídio (rei 👑 por jogador; a IA o guarnece) e Rei da Colina (colina central, 4 min); tipos de mapa Continental, Montanhoso, Florestas, Deserto e Lagos (skirmish e lobby). Pendente: ilhas (depende do naval, 5.3) | A | 14–18 |
| 5.2 | Heróis com habilidades ativas e veterania; relíquias; formações de exército | A | 16–22 |
| 5.3 | Naval (água navegável, transportes, trirremes) — opcional; se não couber, fica pós-lançamento | A | 20–26 |
| 5.4 | Segundo panteão (Egípcio ou Nórdico) — planejar como DLC pós-lançamento | A + T | pós-lançamento |

## Fase 6 — Steam, produção e legal · semanas 10–28
| # | Passo | Resp. | Semanas |
|---|---|---|---|
| 6.1 | Empresa/CNPJ (MEI ou LTDA), conta bancária, formulário fiscal dos EUA (W-8BEN) para receber da Valve | V | 10–12 |
| 6.2 | Conta Steamworks + taxa Steam Direct (US$ 100) + App ID | V | 12 |
| 6.3 | Página "Em breve": cápsulas, screenshots, descrição PT/EN, tags, trailer curto — começar a acumular wishlists | V + T + A | 14–16 |
| 6.4 | Build Electron completo: instalador via SteamPipe, Steam Cloud, conquistas (20–30), Rich Presence, tela cheia/resoluções, controle Steam Input | A | 16–20 |
| 6.5 | Verificação Steam Deck (legibilidade, desempenho, controle) e build Linux | A + V | 20–22 |
| 6.6 | Telemetria opt-in e relatório de erros (para achar bugs dos jogadores) | A | 18–20 |
| 6.7 | Legal: EULA, política de privacidade (servidor de lobby → LGPD), licenças de fontes/áudio, créditos | V + A | 20–22 |
| 6.8 | QA: matriz de testes (Windows 10/11, Linux, Mac; máquinas fracas), checklist de lançamento | A + V | 22–26 |
| 6.9 | Steam Playtest público (gratuito) + demo no Steam Next Fest | V | 24–28 |

## Fase 7 — Lançamento · semanas 28–32
| # | Passo | Resp. | Semanas |
|---|---|---|---|
| 7.1 | Decidir Early Access (recomendado: com M1–M4 e 6–8 missões) ou 1.0 direto | V | 26 |
| 7.2 | Marketing: trailer final, kit de imprensa, Discord, devlogs, contato com streamers de RTS e mídia brasileira | V + T | 24–32 |
| 7.3 | Preço, regiões, descontos de lançamento | V | 28 |
| 7.4 | Lançamento e janela de hotfix (2 semanas com correções diárias) | A + V | 30–32 |

Marco **M5 (semana ~30)**: Early Access na Steam. Marco **M6 (semana ~48)**: versão 1.0 com campanha completa e naval.

## Pós-lançamento (contínuo)
Patches de balanceamento por dados e feedback, editor público + Workshop, ranking/temporadas, DLC de panteões,
torneios da comunidade, localização para ES/DE/FR/ZH.

---

## Custos previstos
| Item | Estimativa |
|---|---|
| Steam Direct | US$ 100 (devolvidos após US$ 1.000 em vendas) |
| Arte (sprites, UI, ilustrações) | R$ 15–60 mil conforme escopo e artista; menos com pipeline assistido por IA |
| Música e SFX | R$ 5–20 mil (ou bancos licenciados a partir de R$ 500) |
| Servidor de lobby (VPS) | R$ 30–100/mês (multiplayer via Steam dispensa servidor de jogo) |
| Domínio, e-mail, Discord | R$ 200/ano |
| Contabilidade/empresa | R$ 100–300/mês |

## Riscos e mitigação
- **Arte é o caminho crítico**: fechar direção de arte na semana 4 e contratar cedo; usar placeholders atuais para nunca bloquear o código.
- **Escopo**: naval e segundo panteão só entram se M1–M4 estiverem prontos; caso contrário, pós-lançamento.
- **Multiplayer**: determinismo já testado; o risco fica na rede real (NAT/latência) — resolvido pelo relay da Steam.
- **Motivação/ritmo**: marcos a cada 5–6 semanas com algo jogável e demonstrável.

## Rotina sugerida
- Semanal: você joga 2–3 partidas e me passa uma lista curta de problemas; eu entrego correções e uma feature; rodamos os testes e o balanceamento automático.
- Quinzenal: revisão do cronograma neste arquivo (marcar concluído, mover o que atrasou).
