# Titanomaquia — roteiro da campanha

> **Documento final da Fase 3.1 (roteiro).** Serve de base para a produção das missões (3.4), os testes automáticos por missão (3.5) e as dificuldades (3.6).
> O que já foi decidido: o **enredo** da Proposta 1 (Ângulo A, tragédia grega com um Titã por ato) somado à **regra de design** da Proposta 2 (Ângulo B: cada missão ensina uma mecânica e cobra uma já vista), com as fusões e correções recomendadas pelo crítico.
> Todos os trechos JSON seguem a gramática real de `src/core/scenario/schema.ts` (versão 1). Cada bloco `json` deste arquivo passou pelo `validateScenario` real, montado num arquivo mínimo. O que a gramática ainda não expressa aparece marcado como **[Gn]** e está na §6.
> **As missões m1–m3 (o prólogo "A Sombra dos Titãs") ficam como estão.** Este roteiro não muda o texto, os objetivos nem os gatilhos delas.

---

## 0. Resumo para o dono (1 minuto)

- **12 missões em 3 atos.** O **Ato I** junta o prólogo que já existe (m1–m3) com uma missão nova, a m4, que fecha o ato. O **Ato II** tem m5–m8 e o **Ato III** tem m9–m12.
- **O arco:** Argos pede a proteção de Zeus e paga por ela. No Ato I, liberta **Prometeu**. No Ato II, é leal a Zeus, isso custa a amizade de Poseidon, e a cidade vence **Oceano**. No Ato III, descobre o verdadeiro inimigo, erra de forma trágica, **perde a própria cidade** e ajuda os três irmãos a derrotar **Cronos**.
- **Vilão humano:** **Lícaon, o Rei-Lobo**, hierofante do Culto de Cronos, escondido entre os sacerdotes de Hades desde o prólogo.
- **Early Access = m1–m8** (Atos I e II, cerca de 3 h 30). O EA termina no confronto com Oceano e num gancho para o Ato III.
- **Toda missão traz uma mecânica nova:** expedição e fronteiras, escolta, maravilha, caça ao herói, chefe-Titã, criaturas míticas (jogando de Hades), cerco com Rei da Colina, êxodo com poderes divinos e a batalha final.
- **Seis missões (m4–m9) não dependem de nenhuma mudança no motor** e vão para a produção primeiro. m10–m12 funcionam hoje com paliativos, mas ficam melhores com 3 ou 4 lacunas pequenas (§6).
- **Ritmo:** 2 missões por semana. O EA fica pronto em cerca de 3 semanas e a campanha inteira em cerca de 5 (§7).

---

## 1. Sinopse e tom

### 1.1 Sinopse

Argos é uma aldeia esquecida da Argólida quando um jovem **arconte** (o jogador) pede a proteção de Zeus. Zeus aceita, mas responde como um deus: ***"Argos será minha."*** Essa fala já está na m1. Desde então, a cidade deixa de ser dona do próprio destino.

**Ato I — A Sombra dos Titãs.** Hades cerca Argos para humilhar Zeus. Entre os sacerdotes de Hades, porém, esconde-se um culto que serve outro senhor: **Cronos**, o pai que devorava os filhos. O culto ergue um Portal para trazê-lo de volta, e o arconte o derruba (prólogo, m1–m3). A Pítia avisa que *"não se mata o Tempo, só se adia"*, e que contra um Titã só outro Titã basta. Zeus, então, manda Argos ao Cáucaso **libertar Prometeu**, o Titã que ele mesmo acorrentou por amar os mortais (m4). Livre, Prometeu deixa à cidade uma profecia: ***"A cidade que acender o fogo dos Titãs arderá nele."*** No alto do rochedo aparece pela primeira vez o homem por trás do culto: **Lícaon**, rei da Arcádia, que Zeus transformou em lobo por servir carne humana aos deuses.

**Ato II — A Maré de Poseidon.** Um náufrago de Ítaca, **Odisseu**, odiado por Poseidon, chega às praias de Argos. O arconte segue a lei sagrada da hospitalidade, que é lei de Zeus, e o protege (m5). Poseidon arma a Liga do Istmo. Zeus exige uma estátua de bronze que Poseidon possa ver do mar (m6). Poseidon manda **Aquiles**, filho de uma nereida, queimar as aldeias de Argos (m7). Por fim, Lícaon sussurra a **Oceano**, o rio que cerca o mundo, que a volta de Cronos devolveria o mundo aos Titãs, e Oceano sobe contra a cidade (m8). Argos vence o Titã, mas perde **Jasão**: ele sobrevive à onda, mas não à vergonha.

**Ato III — A Queda de Cronos.** O culto rouba o raio de Zeus e prende no Tártaro os Ciclopes que o forjam. **Hades**, o inimigo do prólogo, pede ajuda. Os sacerdotes dele eram de Lícaon, e o Senhor dos Mortos foi usado (m9, a *anagnórise*, ou seja, o momento do reconhecimento). Argos, Hades e os Ciclopes sitiam o **Monte Ótris** e derrubam os Pilares do Tempo. Só que os pilares não protegiam Cronos: **prendiam-no** (m10, a *peripécia*, a reviravolta). Cronos marcha sobre Argos e a profecia se cumpre. O arconte evacua o povo pelo porto de Náuplia enquanto a cidade arde e Prometeu cobre a retirada (m11, a *catarse*). Na planície da Tessália, os três irmãos (Zeus, Hades e Poseidon, reconciliado) e os exilados de Argos derrotam Cronos e o devolvem ao Tártaro (m12).

**Epílogo.** Zeus oferece ao arconte um lugar entre as estrelas. O arconte recusa, volta às cinzas de Argos e acende a nova lareira comum com a brasa de Héstia salva no êxodo. *"Os deuses venceram. Os homens sobreviveram. É tudo o que uma tragédia concede."*

### 1.2 Tom e regras de escrita

- **Tragédia grega em forma de RTS.** A **Pítia** (Oráculo de Delfos) faz o papel do *coro*: comenta, avisa e nunca age. A *húbris* (o excesso de orgulho) do arconte é aceitar um deus como dono da cidade. A peripécia vem na m10, o reconhecimento na m9 e a catarse na m11.
- **O jogador é o arconte e não fala.** Todos o chamam de "arconte" / *archon*. Assim não há gênero a escolher, a dublagem fica mais simples e a tradução PT/EN é direta.
- **Falas curtas:** no máximo 2 frases, até cerca de 200 caracteres, sempre `{ "pt", "en" }`.
- **Dicas de interface:** vêm da Pítia, com a tecla ("tecla Q"), só quando a mecânica é nova. As **dicas táticas** vêm dos heróis. **Os deuses** só falam em momentos-chave: início, virada e fim.
- **Coerência com os dados:** Argos é cidade de Zeus. A variedade vem dos deuses menores concedidos por missão (`set minorGods`, que ignora o panteão do jogador), dos heróis disponíveis e de **uma missão em que se joga como Hades** (m9).
- **Visual realista (pedido do dono):** as intros descrevem lugares reais da Grécia, como Argólida, Náuplia, Lerna, Tênaro, Ótris e Tessália, e o Cáucaso fora dela. Isso orienta a arte da Fase 2.7 (ilustrações narradas) e os mapas fixos.

---

## 2. Personagens

Nomes em PT, com o EN entre parênteses quando for diferente. As fichas de missão usam o nome em PT como `speaker`, sempre com `{ "pt", "en" }`.

### 2.1 O jogador

| Personagem | No jogo | Motivação | Como fala |
|---|---|---|---|
| **O Arconte de Argos** (*the Archon of Argos*) | É o jogador. Aparece como unidade só na m11 (`basileus` com `tag` `arconte`; o jogo exibe o nome "Rei" até existir [G8]) | Proteger Argos a qualquer preço. Esse "qualquer preço" é o erro trágico dele | Não fala. Os outros se dirigem a ele como "arconte" |

### 2.2 Mortais e heróis

| Personagem | Unidade | Missões | Motivação | Como fala (exemplo PT / EN) |
|---|---|---|---|---|
| **A Pítia**, voz do Oráculo de Delfos (*the Pythia, Oracle of Delphi*) | nenhuma (speaker "Oráculo de Delfos") | todas | Dizer a verdade que ninguém quer ouvir | Primeiro uma frase enigmática, depois uma instrução seca. *"Vejo fogo sobre Argos. Não hoje. Mas vejo."* / *"I see fire over Argos. Not today. But I see it."* |
| **Jasão** (*Jason*) | `jason` | m2, m6, m8 | Recuperar a glória perdida dos Argonautas | Camarada de marinheiro, frases de comando. *"Eles virão em ondas, arconte."* |
| **Héracles** (*Heracles*) | `heracles` | m3, m4, m9, m12 | Pagar os próprios trabalhos e provar que é mais que filho de Zeus | Bravata bem-humorada. *"Já matei essa águia uma vez. Os deuses gostam de repetir histórias."* / *"I killed this eagle once already. The gods love a rerun."* |
| **Odisseu** (*Odysseus*) | `odysseus` | m5, m7, m12 | Voltar para Ítaca; fica em dívida com Argos | Irônico, pergunta mais do que afirma. *"Pode me chamar de Ninguém."* / *"You may call me Nobody."* |
| **Aquiles** (*Achilles*) | `achilles` (inimigo na m7) | m7 | Escolheu a vida curta e cantada | Orgulhoso, fala do destino. *"Adivinhe qual vida escolhi, arconte."* |
| **Perseu** (*Perseus*) | `perseus` (dano ×2,5 contra Titãs) | m9, m12 | Pagar a dívida com Argos, a cidade onde nasceu | Jovem, direto, solene. *"Voltei para pagar com juros."* / *"I came back to repay it, with interest."* |
| **Leônidas** (*Leonidas*) | nenhuma | m2 (já existe) | Aliança de sangue com Argos | Lacônico. Não ganha falas novas: é anacrônico (séc. V a.C.) e fica como licença poética do prólogo |
| **Rei Atreu de Micenas** (*King Atreus of Mycenae*) | nenhuma (Micenas é IA aliada) | m6, m8 | Retribuir o socorro de Argos | Honra entre cidades. *"Micenas lembra quem a salvou de Hades."* |
| **Emissário do Istmo** (*Envoy of the Isthmus*) | nenhuma | m5 | Servir Poseidon e Corinto | Diplomático e frio. *"Poseidon pede pouco: um homem."* |
| **Caronte** (*Charon*) | nenhuma | m9 | O barqueiro não toma partido | Seco, cobra tudo. *"Uma moeda por cabeça. Os vivos pagam em dobro."* |

### 2.3 O vilão humano

| Personagem | No jogo | Motivação | Como fala |
|---|---|---|---|
| **Lícaon, o Rei-Lobo** (*Lycaon, the Wolf-King*), hierofante do Culto de Cronos | Speaker. O Culto é um jogador IA. Na m10 aparece como `nemean_lion` com `tag` `licaon` (nome próprio exibido depende de [G8]) | Zeus o transformou em lobo por servir carne humana aos deuses. Ele quer a **Idade de Ouro** de Cronos, em que não havia velhice, fome nem deuses que humilham reis | Cortês e cruel. Fala de mesa, fome e banquete. *"Sentem-se à minha mesa. Zeus sentou-se uma vez... e nunca mais teve fome."* / *"Sit at my table. Zeus sat there once... and never hungered again."* |

Lícaon **não aparece no prólogo**, que fica inalterado. O prólogo diz "sacerdotes de Hades" e "Culto de Cronos", e a m4 revela que os dois são a mesma coisa: o culto vivia escondido no clero de Hades.

### 2.4 Deuses que falam

| Deus | Papel no arco | Como fala |
|---|---|---|
| **Zeus** ⚡ | Patrono. Protege Argos como quem protege uma propriedade | Imperativo, nunca agradece. *"Argos será minha."* (m1) |
| **Atena** (*Athena*) 🦉 | Conselho e lei. Concede Restauração | Didática. *"A hospitalidade é lei de Zeus. Nem toda lei agrada a todos os deuses."* |
| **Apolo** (*Apollo*) ☀️ | Profecia e caça (m7). Concede Oráculo | Enigmático. *"Todo imortal tem um lado que não vê."* |
| **Hera** 👑 | Guardiã do Heraion (m5). Concede Tempestade de Raios (m11) | Majestosa, ciumenta. |
| **Hefesto** (*Hephaestus*) ⚒️ | Forjou as correntes de Prometeu e se arrepende (segredo da m4) | Rabugento e exato. *"Seis elos por corrente. Eu contei."* |
| **Poseidon** 🔱 | Algoz no Ato II, aliado relutante na m12 | Tempestuoso, metáforas de mar. *"Que Argos se lembre disso quando o mar subir."* |
| **Hades** 💀 | Inimigo no prólogo, vítima e depois aliado no Ato III | Seco, irônico, cansado. *"O dia está cheio de surpresas."* |

### 2.5 Titãs

| Titã | Unidade | Papel | Como fala |
|---|---|---|---|
| **Prometeu** (*Prometheus*) 🔥 | `prometheus` (o Titã de Zeus) | Libertado na m4. Pode ser invocado pelo Portal em m8 e m12, e cobre a retirada na m11 | Compassivo, antigo, lento. *"Trinta gerações olhando o sol nascer sobre a mesma pedra."* |
| **Oceano** (*Oceanus*) 🌊 | `oceanus` | Chefe da m8 | Vasto, impessoal. *"Eu já cobri montanhas maiores."* |
| **Cronos** (*Cronus*) ⏳ | `cronus` | Ameaça do prólogo (m3), antagonista de m11–m12 | Frio, fala de tempo e de fome. *"Eu SOU a espera."* / *"I AM the waiting."* |

### 2.6 Facções (nome do jogador em `config.players`)

*Argos* (jogador) · *Culto de Cronos* (m4, m9–m12) · *Guardiões do Cáucaso* (m4, marionete) · *Liga do Istmo* (Corinto, m5–m8) · *Cavaleiros de Poseidon* (m5, marionete) · *Frota de Poseidon* (m6, marionete) · *Micenas* (aliada, m6 e m8) · *Mirmidões de Aquiles* (m7, marionete) · *Oceano* (m8, marionete) · *Legiões de Hades* (jogador na m9) · *Carcereiros de Cronos* (m9, marionete) · *Hades* (aliado, m10 e m12) · *Poseidon* (aliado, m12) · *Exilados de Argos* (jogador na m12).

"Marionete" é um jogador com `isAI: false` e sem cidade, que só age por gatilhos, como os *Saqueadores* da m1. Limite: 4 jogadores por missão (`MAX_PLAYERS`).

---

## 3. Estrutura em 3 atos

| Ato | Título PT / EN | Missões | Idades | Titã | Tema dramático | Clímax |
|---|---|---|---|---|---|---|
| **I** | A Sombra dos Titãs / *The Shadow of the Titans* | m1–m3 (prólogo, sem alterações) + m4 | Arcaica → Heroica | **Prometeu**, libertado e aliado | Ascensão e húbris: Argos cresce pedindo favores aos deuses | m4: Prometeu livre e a profecia do fogo |
| **II** | A Maré de Poseidon / *Poseidon's Tide* | m5–m8 | Heroica → Mítica | **Oceano**, chefe inimigo | Lealdade e preço: honrar Zeus custa a amizade do mar | m8: Oceano sobe do golfo; a saída amarga de Jasão |
| **III** | A Queda de Cronos / *The Fall of Cronus* | m9–m12 | Heroica/Mítica → Titãs | **Cronos**, chefe final | Reconhecimento, erro trágico e sacrifício: Argos arde para o mundo seguir | m10 (os pilares prendiam Cronos) → m11 (êxodo) → m12 (Cronos derrotado) |

**Ato I, ascensão.** O arconte é jovem e o mundo parece simples: Hades ataca e Zeus protege. O prólogo ensina o jogo. A m4 muda de escala: expedição, fronteiras e o primeiro Titã do lado do jogador. *Virada:* a profecia de Prometeu e o rosto de Lícaon.

**Ato II, complicação.** Cada missão aumenta o custo da lealdade a Zeus: uma escolta, uma estátua erguida com o suor do povo, a morte de Aquiles (que não era vilão) e a onda de Oceano. *Virada:* a Pítia anuncia que "na terceira vez, o preço será a própria Argos". Aqui termina o **EA**.

**Ato III, reconhecimento e catástrofe.** O inimigo muda: Hades vira aliado e Lícaon aparece como o verdadeiro autor. Argos derruba os pilares (erro) e paga com a cidade. A vitória final é real, mas tem gosto amargo.

**Curva de ensino (regra da Proposta 2):** cada missão tem **uma mecânica em destaque** e **cobra uma anterior** como objetivo secundário. A Idade inicial sobe dentro de cada ato. As dicas com tecla aparecem só na primeira vez que uma mecânica surge.

**Como o prólogo se liga à m4 sem mudar uma linha:**
- O *outro* da m3 ("O Portal caiu e o mundo respira. Por enquanto... (Fim do prólogo)") continua verdadeiro. O prólogo termina, mas o Ato I continua.
- Na aba Campanha, m1–m3 levam o selo "Prólogo" sob o cabeçalho "Ato I".
- A conquista `campaign_prologue` não muda.
- A m3 tem dois finais possíveis: o Portal cai, ou Cronos surge e é derrotado (às vezes com Prometeu invocado pelo Portal de Argos). A intro da m4 cobre os dois: *"Se Prometeu atendeu ao chamado do Portal de Argos, foi por uma batalha só. As correntes do Cáucaso o puxaram de volta. Um Titã chamado por um Portal é um Titã emprestado."* A Pítia completa: *"Não se mata o Tempo, arconte. Só se adia."*

---

## 4. Tabela de missões

Legenda:
- **EA** = entra no Early Access.
- **Mapa:** `gen` = gerado por semente (`map.gen`); `fixo` = desenhado no editor (`map.data`, com `entities` e `tag`).
- **Lacunas** = itens da §6 que a versão ideal usa. "—" = a missão funciona inteira com a gramática atual.

| # | id | Título PT / EN | Mecânica em destaque (e a cobrada) | Objetivo-tipo | Idade inicial | Mapa | Tempo | EA | Lacunas |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `m1_despertar` *(existe)* | O Despertar de Argos / *The Awakening of Argos* | Economia, Templo e Favor, Idades | fundamentos | Arcaica | gen P, 1101 | 15–20 | ✅ | — (inalterada) |
| 2 | `m2_cerco` *(existe)* | O Cerco de Argos / *The Siege of Argos* | Defesa, Restauração, herói contra mítica | **defesa** | Clássica | gen M, 2202 | 20–25 | ✅ | — (inalterada) |
| 3 | `m3_portal` *(existe)* | O Portal dos Titãs / *The Titans' Gate* | Corrida contra o ritual; Titãs como opção | **corrida** | Heroica | gen M, 3303 | 25–30 | ✅ | — (inalterada) |
| 4 | `m4_caucaso` | O Fogo do Cáucaso / *The Fire of the Caucasus* | **Expedição sem cidade, fronteiras e atrito, 2ª cidade** (cobra: herói contra mítica) | expedição + libertação | Heroica | fixo 96×144 "Garganta do Cáucaso" | 25–30 | ✅ | — |
| 5 | `m5_itaca` | O Hóspede de Ítaca / *The Guest from Ithaca* | **Escolta** (cobra: Mercado como opção) | **escolta** | Heroica | fixo 128×112 "Planície da Argólida" | 20–25 | ✅ | — |
| 6 | `m6_estatua` | A Estátua de Zeus / *The Statue of Zeus* | **Maravilha com guarda cronometrada** (cobra: Idade Mítica pela Academia) | **maravilha** | Heroica | gen M continental, 6606 | 25–30 | ✅ | — (G4 melhora) |
| 7 | `m7_aquiles` | A Cólera de Aquiles / *The Wrath of Achilles* | **Caça ao herói** com o poder Oráculo (cobra: defesa de aldeias) | **caça ao herói** | Heroica | gen M forest, 7707 | 20–30 | ✅ | — |
| 8 | `m8_oceano` | A Maré de Oceano / *The Tide of Oceanus* | **Chefe-Titã com contagem regressiva**, Raio, invocar Prometeu (cobra: muralhas e torres) | **defesa** + chefe | Mítica | fixo 128×128 "Golfo da Argólida" | 30–35 | ✅ | — |
| 9 | `m9_tenaro` | A Descida ao Tênaro / *The Descent at Taenarum* | **Criaturas míticas, jogando como Hades** (cobra: heróis contra míticas) | resgate + cerco leve | Heroica | gen M lakes, 9909 | 25–30 | — | — (G10 para relíquias) |
| 10 | `m10_otris` | O Cerco de Ótris / *The Siege of Othrys* | **Cerco** (helépoles, muralhas concêntricas) + **Rei da Colina** no altar | **cerco** + **rei da colina** | Mítica | fixo 144×144 "Monte Ótris" | 30–35 | — | G2, G4 (paliativo hoje) |
| 11 | `m11_chamas` | Argos em Chamas / *Argos in Flames* | **Êxodo + poderes divinos um a um** (cobra: proteger o líder) | **regicídio** (proteger o arconte) + escolta em massa | Mítica | fixo 128×128 "Argólida em Chamas" | 18 (fixo) | — | G8, G9, G6 (paliativo hoje) |
| 12 | `m12_titanomaquia` | O Fim da Idade de Ouro / *The End of the Golden Age* | **Batalha final 3 × 1**: altares, depois Cronos, com Titãs (cobra: tudo) | **cerco** + chefe em fases | Mítica | fixo 144×144 "Planície da Tessália" | 35–40 | — | G6, G9 (paliativo hoje) |

**Totais:**
- Cerca de **5 h 30** de campanha, das quais cerca de **3 h 30 no EA**.
- **6 mapas fixos novos**: m4, m5, m8, m10, m11 e m12. Três deles estão no EA.
- **3 missões novas em mapa gerado**: m6, m7 e m9.

**Cobertura dos objetivos pedidos no roteiro (3.4):**

| Objetivo | Missões |
|---|---|
| escolta | m5, m11 |
| defesa | m2, m8 |
| caça ao herói | m7 |
| corrida | m3, e a guarda contra o relógio da m6 |
| maravilha | m6 |
| cerco | m10, m12 |
| regicídio | m11 |
| rei da colina | m10 |
| relíquias | m9, secundário, depende de [G10] |

**Plano B do EA (7 missões):** m1–m6 + m8. A m7 é autocontida (Odisseu e Aquiles não dependem dela nas outras missões) e entra no primeiro patch.

---

## 5. Fichas das missões novas

### 5.0 Convenções usadas em todas as fichas

- **Jogador 0 = Argos (humano).** Os outros índices seguem `config.players`. Todo jogador tem `team` explícito. Sem isso, o time vira o índice (`game.ts: team: pc.team ?? i`) e um aliado vira inimigo.
- **Objetivo secreto** *(antes de [G1]; hoje basta `hidden: true` com `done`/`failed`, e ele se revela ao mudar de estado)*: fica `hidden: true`, **sem** `done`/`failed`. Um **gatilho espelho** o cumpre com `{ "do": "objective", "id": …, "status": "done" }`. Motivo: o runner **não avalia objetivos ocultos** (`runner.ts` pula `sc.hidden[id]`). Quando [G1] existir, basta mover a condição para `done`.
- **Objetivo oculto que é revelado:** é avaliado a partir do `reveal`, então pode ter `done` normal.
- **Tag criada mais tarde (por `spawn`/`place` num gatilho):** toda condição `{ "entity": { "tag": X }, "exists": false }` ou `{ "units": { "tag": X } … "eq": 0 }` sobre ela precisa vir dentro de `all` com `{ "fired": "<gatilho que cria X>" }`. Sem isso, ela vale **verdadeiro no segundo 1**, porque a tag ainda não existe. O teste de lint da §7.2 verifica isso.
- **Tag de grupo** *(resolvido por [G5]: entidades do mapa com a mesma tag viram grupo)*: só `spawn` com `tag` grava o grupo inteiro (`#tag[k]`). Entidades do mapa fixo com a **mesma** tag ficam só com a última (`game.ts` usa `tags.set`) [G5]. Por isso, nos mapas fixos, **uma tag por entidade** (`corrente1`, `corrente2`…), e grupos nascem por `spawn` no `setup`.
- **`raid`:** nasce a cerca de 22 tiles do alvo, no ângulo indicado. `dirs[0]` = leste, `2` = sul, `4` = oeste, `6` = norte (o y cresce para baixo). O alvo vira um **ponto fixo** no momento do disparo. **Se o alvo não existir** (por exemplo, `{ "tc": 0 }` depois que o CC caiu), o raid **não acontece**. Só `raid` escala com a dificuldade (Fácil ≈ 2/3, Difícil ≈ 1,5×). `spawn` não escala [G3].
- **Contador por segundo** (maravilha, altar): um gatilho `repeat` soma quando a condição vale, outro zera quando não vale. A vitória fica `{ "var": X, "gte": N }`.
- **Derrota por CC** *(com [G2] a eliminação já encerra a missão; a `DERROTA_CC` continua útil para perder assim que o CC cai)*: `{ "all": [ { "time": { "gte": 5 } }, { "buildings": { "player": 0, "type": "town_center" }, "eq": 0 } ] }` (chamada abaixo de `DERROTA_CC`). É obrigatória: dentro de cenário, `alive` nunca muda e a derrota implícita não dispara [G2].
- **Dificuldade hoje:** a IA inimiga sobe um degrau no Difícil, e os `raid` escalam. As variações "com [G3]" usam a condição proposta `{ "difficulty": "easy" | "normal" | "hard" }`, escrita em texto e não em JSON validado.
- Os blocos JSON mostram `config`, `setup`, objetivos, os gatilhos principais, vitória, derrota e HUD. As falas secundárias ficam na lista de diálogos. O arquivo final (`src/core/scenario/missions/<id>.scenario.json`) acrescenta `format`, `version`, `id`, `title`, `subtitle`, `icon`, `intro`, `outro`, `hints` e `map`.

---

### 5.1 M4 · O Fogo do Cáucaso / *The Fire of the Caucasus* 🔥

- **Subtítulo:** Ato I · Missão 4 · Expedição / *Act I · Mission 4 · Expedition*
- **Mecânica em destaque:**
  - começar **sem cidade** e fundar uma colônia no meio da missão;
  - **fronteiras e atrito**: o Culto é de Hades, com +0,3/s de atrito no território dele;
  - **Civismo I** para uma segunda cidade.
- **Mecânica cobrada:** herói contra mítica (Héracles contra a Águia).
- **Objetivo-tipo:** expedição e libertação (alvos em sequência num desfiladeiro).
- **Tempo:** 25–30 min. **Lacunas:** nenhuma.

**Jogadores:**

| # | Nome | Deus | Controle | Time | Kit |
|---|---|---|---|---|---|
| 0 | Argos | Zeus (+ Atena e Apolo via `set minorGods`) | humano | 0 | **sem cidade** |
| 1 | Culto de Cronos | Hades | IA normal | 1 | CC + kit (cidade a nordeste) |
| 2 | Guardiões do Cáucaso | Hades | marionete | 1 | nenhum (torres-corrente e guardas do mapa) |

**Idade e recursos:** Heroica. 600 comida / 600 madeira / 500 ouro / 60 favor / 150 conhecimento.

**Mapa `fixo` "Garganta do Cáucaso", 96×144 (norte no alto):**
- **Sul, a praia de desembarque** (`start` 0 = [48,136]). Costa de água funda. Entidades do jogador 0: Héracles (`tag` `heracles`), 6 hipaspistas, 4 arqueiros cretenses, 5 cidadãos e 1 petróbolo.
- **Centro, o Vale da Cólquida** (em torno de [48,84]): território neutro, fértil, com ouro, madeira e caça. O CC da colônia vai aqui. Um vale lateral a oeste ([20,96]) serve para a 2ª cidade.
- **Norte, o desfiladeiro em serpentina com 3 platôs.** Cada platô tem uma **Corrente de Bronze**: por enquanto uma Torre do jogador 2 (`tag` `corrente1` [28,62], `corrente2` [60,46], `corrente3` [40,28]), com 3 a 5 guardas do jogador 2. Os platôs 2 e 3 ficam **dentro do território do Culto**, onde há atrito.
- **Topo, o Rochedo de Prometeu** ([48,12]), cercado de montanha, onde patrulha a **Águia** (`spawn`).
- **Nordeste, a cidade do Culto** (`start` 1 = [82,24]) e a **Fortaleza do Passo** (Fortaleza do jogador 1, `tag` `fortaleza_culto`, [74,30]).
- **Leste, uma ravina oculta** com o **Altar de Hefesto** ([88,104]), alcançável por uma trilha de 2 tiles. O aviso `chokepoint` do editor é intencional.
- `relics: false`.

**Briefing (intro):**
1. PT: *"O Portal caiu, mas a Pítia não comemora: 'Não se mata o Tempo, arconte. Só se adia.' Se Prometeu atendeu ao Portal de Argos, foi por uma batalha só. As correntes do Cáucaso o puxaram de volta."*
   EN: *"The Gate has fallen, but the Pythia does not celebrate: 'You cannot kill Time, archon. Only delay it.' If Prometheus answered Argos' Gate, it was for a single battle. The chains of the Caucasus dragged him back."*
2. PT: *"Zeus ordena o impensável: libertar o Titã que ele mesmo acorrentou. Desembarque com Héracles, funde uma colônia no vale e rompa as três correntes. Os sacerdotes que guardam o rochedo usam os mantos de Hades... mas rezam para outro senhor."*
   EN: *"Zeus orders the unthinkable: free the Titan he himself chained. Land with Heracles, found a colony in the valley and break the three chains. The priests guarding the rock wear Hades' robes... but pray to another master."*

**Objetivos:**

| id | Tipo | Texto PT / EN | Condição |
|---|---|---|---|
| `colonia` | principal | Funde a colônia de Argos no Vale da Cólquida (Centro Cívico) / *Found the Argive colony in the Valley of Colchis (Town Center)* | 1 CC completo |
| `correntes` | principal | Rompa as três correntes de Prometeu / *Break the three chains of Prometheus* | as 3 tags destruídas |
| `culto` | principal, oculto até a libertação | Destrua a Fortaleza do Passo / *Destroy the Fortress of the Pass* | tag destruída |
| `cidades` | secundário | Pesquise Civismo I na Academia e funde uma 2ª cidade / *Research Civics I at the Academy and found a 2nd city* | 2 CCs completos |
| `aguia` | secundário | Abata a Águia do Cáucaso / *Slay the Eagle of the Caucasus* | tag destruída (criada no `setup`) |
| `hefesto` | secreto | Encontre o Altar de Hefesto / *Find the Altar of Hephaestus* | gatilho espelho |

```json
{
  "config": {
    "players": [
      { "name": "Argos", "god": "zeus", "isAI": false, "difficulty": "normal", "team": 0 },
      { "name": "Culto de Cronos", "god": "hades", "isAI": true, "difficulty": "normal", "team": 1 },
      { "name": "Guardiões do Cáucaso", "god": "hades", "isAI": false, "difficulty": "normal", "team": 1 }
    ],
    "startingAge": 2,
    "startingResources": { "food": 600, "wood": 600, "gold": 500, "favor": 60, "knowledge": 150 },
    "startKit": [false, true, false]
  },
  "setup": [
    { "do": "set", "player": 0, "minorGods": ["athena", "apollo"] },
    { "do": "set", "player": 1, "techs": ["masonry"] },
    { "do": "spawn", "player": 2, "units": ["manticore"], "at": { "at": [46, 16] }, "tag": "aguia" }
  ],
  "objectives": [
    { "id": "colonia", "text": { "pt": "Funde a colônia de Argos no Vale da Cólquida (Centro Cívico)", "en": "Found the Argive colony in the Valley of Colchis (Town Center)" },
      "done": { "buildings": { "player": 0, "type": "town_center", "complete": true }, "gte": 1 } },
    { "id": "correntes", "text": { "pt": "Rompa as três correntes de Prometeu", "en": "Break the three chains of Prometheus" },
      "done": { "all": [ { "entity": { "tag": "corrente1" }, "exists": false }, { "entity": { "tag": "corrente2" }, "exists": false }, { "entity": { "tag": "corrente3" }, "exists": false } ] } },
    { "id": "culto", "hidden": true, "text": { "pt": "Destrua a Fortaleza do Passo", "en": "Destroy the Fortress of the Pass" },
      "done": { "entity": { "tag": "fortaleza_culto" }, "exists": false } },
    { "id": "cidades", "optional": true, "text": { "pt": "Pesquise Civismo I na Academia e funde uma 2ª cidade", "en": "Research Civics I at the Academy and found a 2nd city" },
      "done": { "buildings": { "player": 0, "type": "town_center", "complete": true }, "gte": 2 } },
    { "id": "aguia", "optional": true, "text": { "pt": "Abata a Águia do Cáucaso", "en": "Slay the Eagle of the Caucasus" },
      "done": { "entity": { "tag": "aguia" }, "exists": false } },
    { "id": "hefesto", "optional": true, "hidden": true, "text": { "pt": "Encontre o Altar de Hefesto", "en": "Find the Altar of Hephaestus" } }
  ],
  "triggers": [
    { "id": "start", "when": { "time": { "gte": 1 } }, "then": [
      { "do": "say", "speaker": { "pt": "Héracles", "en": "Heracles" }, "icon": "💪",
        "text": { "pt": "Praia boa, vale melhor. Funde a colônia lá no meio, arconte: sem casa, ninguém sobe montanha.", "en": "Good beach, better valley. Found the colony in the middle, archon: without a home, nobody climbs mountains." } } ] },
    { "id": "dica_colonia", "when": { "time": { "gte": 20 } }, "then": [
      { "do": "say", "speaker": { "pt": "Oráculo de Delfos", "en": "Oracle of Delphi" }, "icon": "🔮",
        "text": { "pt": "Um Centro Cívico pode ser erguido em terra de ninguém. Selecione os cidadãos e escolha-o no menu de construção.", "en": "A Town Center can be raised on no man's land. Select the villagers and pick it from the build menu." } } ] },
    { "id": "dica_atrito", "when": { "all": [ { "objective": "colonia", "is": "done" }, { "time": { "gte": 240 } } ] }, "then": [
      { "do": "say", "speaker": { "pt": "Oráculo de Delfos", "en": "Oracle of Delphi" }, "icon": "🔮",
        "text": { "pt": "Além da linha dourada é terra do Culto: ali seus homens sangram (atrito). Civismo, na Academia, empurra a fronteira e permite outra cidade.", "en": "Beyond the golden line is Cult land: there your men bleed (attrition). Civics, at the Academy, pushes the border and allows another city." } } ] },
    { "id": "colonia_fundada", "when": { "objective": "colonia", "is": "done" }, "then": [
      { "do": "give", "player": 0, "resources": { "wood": 300 } } ] },
    { "id": "corrente1_cai", "when": { "entity": { "tag": "corrente1" }, "exists": false }, "then": [
      { "do": "say", "speaker": { "pt": "Prometeu", "en": "Prometheus" }, "icon": "🔥",
        "text": { "pt": "Sinto o bronze ceder... Mortal, sabes que Zeus me acorrentou por amar os teus?", "en": "I feel the bronze give way... Mortal, do you know Zeus chained me for loving your kind?" } },
      { "do": "raid", "player": 2, "units": ["hypaspist", "hypaspist", "cerberus"], "target": { "entity": { "tag": "heracles" } }, "angle": 6, "distance": 18 } ] },
    { "id": "corrente2_cai", "when": { "entity": { "tag": "corrente2" }, "exists": false }, "then": [
      { "do": "raid", "player": 2, "units": ["hypaspist", "hypaspist", "toxotes", "toxotes", "cerberus"], "target": { "entity": { "tag": "heracles" } }, "angle": 7, "distance": 18 } ] },
    { "id": "libertado", "when": { "objective": "correntes", "is": "done" }, "then": [
      { "do": "spawn", "player": 0, "units": ["prometheus"], "at": { "at": [48, 14] }, "tag": "prometeu" },
      { "do": "reveal", "id": "culto" },
      { "do": "say", "speaker": "Zeus", "icon": "⚡",
        "text": { "pt": "Ele é teu por um dia, arconte. Contra meu pai, até meus prisioneiros me servem. Derrube a fortaleza deles.", "en": "He is yours for a day, archon. Against my father, even my prisoners serve me. Bring down their fortress." } },
      { "do": "say", "speaker": { "pt": "Lícaon", "en": "Lycaon" }, "icon": "🐺",
        "text": { "pt": "Sentem-se à minha mesa, argivos. Zeus sentou-se uma vez... e nunca mais teve fome.", "en": "Sit at my table, Argives. Zeus sat there once... and never hungered again." } } ] },
    { "id": "aguia_cai", "when": { "objective": "aguia", "is": "done" }, "then": [
      { "do": "give", "player": 0, "resources": { "favor": 100 } },
      { "do": "say", "speaker": { "pt": "Héracles", "en": "Heracles" }, "icon": "💪",
        "text": { "pt": "Já matei essa águia uma vez. Os deuses gostam de repetir histórias.", "en": "I killed this eagle once already. The gods love a rerun." } } ] },
    { "id": "hefesto_altar", "when": { "units": { "player": 0, "near": { "point": { "at": [88, 104] }, "radius": 4 } }, "gte": 1 }, "then": [
      { "do": "objective", "id": "hefesto", "status": "done" },
      { "do": "set", "player": 0, "minorGods": ["hephaestus"] },
      { "do": "say", "speaker": { "pt": "Hefesto", "en": "Hephaestus" }, "icon": "⚒️",
        "text": { "pt": "Fui eu que forjei aquelas correntes. Seis elos cada, eu contei. Leve minha Abundância e não conte a meu pai.", "en": "I forged those chains. Six links each, I counted. Take my Plenty and don't tell my father." } } ] },
    { "id": "contra_ataque", "repeat": true, "when": { "all": [ { "objective": "colonia", "is": "done" }, { "every": { "seconds": 150, "after": 300 } } ] }, "then": [
      { "do": "raid", "player": 2, "units": ["hoplite", "hoplite", "toxotes", "toxotes", "hypaspist"], "target": { "tc": 0 }, "angle": 6 } ] }
  ],
  "victory": { "all": [ { "objective": "correntes", "is": "done" }, { "objective": "culto", "is": "done" } ] },
  "defeat": { "any": [
    { "entity": { "tag": "heracles" }, "exists": false },
    { "all": [ { "time": { "gte": 5 } }, { "buildings": { "player": 0, "type": "town_center" }, "eq": 0 }, { "units": { "player": 0, "type": "villager" }, "eq": 0 } ] },
    { "all": [ { "objective": "colonia", "is": "done" }, { "buildings": { "player": 0, "type": "town_center" }, "eq": 0 } ] }
  ] }
}
```

**Gatilhos (resumo):**
- dicas da Pítia sobre colônia, fronteira e atrito;
- 300 de madeira ao fundar a colônia;
- cada corrente derrubada provoca uma fala de Prometeu e um `raid` de vingança contra Héracles (a `corrente3_cai` segue o mesmo modelo, com ângulo 5);
- libertação: Prometeu passa a ser do jogador, o objetivo `culto` é revelado e Lícaon aparece;
- contra-ataques a cada 150 s depois da colônia, sempre pelo norte.

**Derrota:** Héracles morre; **ou** o jogador fica sem CC e sem cidadãos (a expedição fracassou); **ou** a colônia foi fundada e depois perdeu todos os CCs.

**Dificuldade:**
- **Hoje:** os `raid` escalam e o Culto joga como IA Difícil.
- **Com [G3]:**
  - Fácil: no segundo 1, `kill` na `corrente3` (só 2 correntes).
  - Difícil: a Águia renasce 180 s depois de abatida, com um `spawn` condicionado a `{ "difficulty": "hard" }` e `fired aguia_cai`, e o objetivo `cidades` passa a ser obrigatório.

**Diálogos-chave:**
- **Pítia** (primeiro contato com o atrito): *"Terra de Hades bebe o sangue de quem entra sem convite."* / *"Hades' land drinks the blood of those who enter uninvited."*
- **Prometeu** (2ª corrente): *"Trinta gerações olhando o sol nascer sobre a mesma pedra. Não te apresses por mim, mortal. Apressa-te por ti."* / *"Thirty generations watching the sun rise over the same rock. Don't hurry for me, mortal. Hurry for yourself."*
- **Lícaon** (libertação): ver o JSON.
- **Prometeu** (fim): *"Obrigado, Argos. E perdoa o que vou dizer: a cidade que acender o fogo dos Titãs arderá nele."* / *"Thank you, Argos. And forgive what I must say: the city that lights the Titans' fire shall burn in it."*

**Outro:**
- PT: *"Prometeu caminha livre pela primeira vez em trinta gerações. O Culto recua e deixa no rochedo um estandarte com um lobo. Zeus sorri; a Pítia, não: 'A cidade que acender o fogo dos Titãs arderá nele.' E no mar, um náufrago de Ítaca pede abrigo às praias de Argos..."*
- EN: *"Prometheus walks free for the first time in thirty generations. The Cult retreats, leaving a wolf banner on the rock. Zeus smiles; the Pythia does not: 'The city that lights the Titans' fire shall burn in it.' And at sea, a castaway from Ithaca begs shelter on the shores of Argos..."*

**Riscos:**
- O jogador 0 começa na Heroica e está longe da Idade dos Titãs. Mesmo assim, um Portal próprio geraria um segundo Prometeu, porque o `spawn` não marca `titanSpawned`. O que resolve de vez é [G6] `maxAge`. Até lá, o teste da §7 confere se existe no máximo 1 `prometheus`.
- Guardas do jogador 2 mortos em combate podem voltar como Sombras (efeito do deus Hades). É intencional e combina com a história.

---

### 5.2 M5 · O Hóspede de Ítaca / *The Guest from Ithaca* 🏹

- **Subtítulo:** Ato II · Missão 5 · Escolta / *Act II · Mission 5 · Escort*
- **Mecânica em destaque:**
  - **escolta ativa** de um herói controlável que atrai os inimigos enquanto as torres de sinal da Liga estiverem de pé;
  - escolha entre proteger Odisseu ou caçar as torres.
- **Mecânica cobrada:** o **Mercado**. Com um Mercado de pé e 1500 de ouro, compra-se uma trégua de 2 min.
- **Objetivo-tipo:** escolta. **Tempo:** 20–25 min. **Lacunas:** nenhuma.

**Jogadores:**

| # | Nome | Deus | Controle | Time | Kit |
|---|---|---|---|---|---|
| 0 | Argos | Zeus (+ Atena e Apolo) | humano | 0 | não (cidade pré-construída no mapa) |
| 1 | Liga do Istmo | Poseidon | IA normal | 1 | sim (Corinto) |
| 2 | Cavaleiros de Poseidon | Poseidon | marionete | 1 | não |

**Idade e recursos:** Heroica. 800 / 800 / 400 / 60 favor / 200 conhecimento. O ouro é pouco de propósito, para que o Mercado valha a pena.

**Mapa `fixo` "Planície da Argólida", 128×112:**
- **Noroeste, Argos numa colina** (`start` 0 = [22,22]). Entidades:
  - edifícios: CC, Templo, Quartel, Estábulo, Academia e 4 Casas;
  - unidades: 12 cidadãos, 6 hoplitas, 4 toxotas e 2 hipeus.
- **Centro, o rio Ínaco**, de norte a sul (x ≈ 64), com **2 vaus** em [64,36] e [64,78].
- **Heraion:** Templo do jogador 0 com `tag` `heraion`, em [50,60], perto do caminho.
- **Sudeste, a praia de Náuplia**, com os restos do naufrágio (decoração) em [110,98].
- **Nordeste, Corinto** (`start` 1 = [108,16]), atrás do istmo.
- **Torres de sinal:** Torres do jogador 2 com `tag` `sinal1` [84,50] e `sinal2` [96,74]. `start` 2 = [120,56], sem kit.
- `relics: false`.

**Briefing:**
1. PT: *"Um navio de Ítaca se despedaçou na praia de Náuplia. Entre os sobreviventes está Odisseu, o homem que cegou o filho de Poseidon. O deus do mar quer a cabeça dele."*
   EN: *"A ship from Ithaca broke apart on the beach of Nauplia. Among the survivors is Odysseus, the man who blinded Poseidon's son. The sea god wants his head."*
2. PT: *"A hospitalidade é lei de Zeus: quem pede abrigo o recebe. Traga Odisseu vivo até Argos, e tantos náufragos quanto puder. Os cavaleiros de Corinto já estão na planície."*
   EN: *"Hospitality is the law of Zeus: whoever asks for shelter receives it. Bring Odysseus alive to Argos, and as many castaways as you can. The riders of Corinth are already on the plain."*

**Objetivos:**

| id | Tipo | Texto PT / EN |
|---|---|---|
| `encontrar` | principal | Chegue a Odisseu na praia de Náuplia com 3 soldados / *Reach Odysseus on the beach of Nauplia with 3 soldiers* |
| `escolta` | principal | Leve Odisseu vivo até o Centro Cívico de Argos / *Bring Odysseus alive to the Town Center of Argos* |
| `naufragos` | secundário | Traga ao menos 4 náufragos / *Bring at least 4 castaways* |
| `heraion` | secundário | Faça Odisseu passar pelo Heraion / *Lead Odysseus past the Heraion* |
| `resgate` | secundário | Compre uma trégua: com um Mercado de pé, junte 1500 de ouro / *Buy a truce: with a Market standing, gather 1500 gold* |
| `sinais` | secreto | Derrube as duas torres de sinal da Liga / *Topple both League signal towers* |

```json
{
  "config": {
    "players": [
      { "name": "Argos", "god": "zeus", "isAI": false, "difficulty": "normal", "team": 0 },
      { "name": "Liga do Istmo", "god": "poseidon", "isAI": true, "difficulty": "normal", "team": 1 },
      { "name": "Cavaleiros de Poseidon", "god": "poseidon", "isAI": false, "difficulty": "normal", "team": 1 }
    ],
    "startingAge": 2,
    "startingResources": { "food": 800, "wood": 800, "gold": 400, "favor": 60, "knowledge": 200 },
    "startKit": [false, true, false]
  },
  "setup": [
    { "do": "set", "player": 0, "minorGods": ["athena", "apollo"] },
    { "do": "spawn", "player": 0, "units": ["odysseus"], "at": { "at": [110, 98] }, "tag": "odisseu" },
    { "do": "spawn", "player": 0, "units": ["villager", "villager", "villager", "villager", "villager", "villager"], "at": { "at": [106, 100] }, "tag": "naufragos" }
  ],
  "objectives": [
    { "id": "encontrar", "text": { "pt": "Chegue a Odisseu na praia de Náuplia com 3 soldados", "en": "Reach Odysseus on the beach of Nauplia with 3 soldiers" },
      "done": { "units": { "player": 0, "military": true, "excludeTag": "odisseu", "near": { "point": { "entity": { "tag": "odisseu" } }, "radius": 6 } }, "gte": 3 } },
    { "id": "escolta", "text": { "pt": "Leve Odisseu vivo até o Centro Cívico de Argos", "en": "Bring Odysseus alive to the Town Center of Argos" },
      "done": { "units": { "player": 0, "tag": "odisseu", "near": { "point": { "tc": 0 }, "radius": 7 } }, "gte": 1 } },
    { "id": "naufragos", "optional": true, "text": { "pt": "Traga ao menos 4 náufragos", "en": "Bring at least 4 castaways" },
      "done": { "units": { "player": 0, "tag": "naufragos", "near": { "point": { "tc": 0 }, "radius": 8 } }, "gte": 4 },
      "failed": { "units": { "player": 0, "tag": "naufragos" }, "lt": 4 } },
    { "id": "heraion", "optional": true, "text": { "pt": "Faça Odisseu passar pelo Heraion", "en": "Lead Odysseus past the Heraion" },
      "done": { "units": { "player": 0, "tag": "odisseu", "near": { "point": { "entity": { "tag": "heraion" } }, "radius": 5 } }, "gte": 1 } },
    { "id": "resgate", "optional": true, "text": { "pt": "Compre uma trégua: com um Mercado de pé, junte 1500 de ouro", "en": "Buy a truce: with a Market standing, gather 1500 gold" },
      "done": { "fired": "resgate_pago" } },
    { "id": "sinais", "optional": true, "hidden": true, "text": { "pt": "Derrube as duas torres de sinal da Liga", "en": "Topple both League signal towers" } }
  ],
  "triggers": [
    { "id": "tregua", "when": { "time": { "gte": 1 } }, "then": [
      { "do": "ceasefire", "seconds": 45 },
      { "do": "say", "speaker": { "pt": "Emissário do Istmo", "en": "Envoy of the Isthmus" }, "icon": "🔱",
        "text": { "pt": "Poseidon pede pouco, arconte: um homem. Argos tem tantos. Você tem o tempo desta trégua para decidir.", "en": "Poseidon asks little, archon: one man. Argos has so many. You have the length of this truce to decide." } } ] },
    { "id": "sinais_caem", "when": { "all": [ { "entity": { "tag": "sinal1" }, "exists": false }, { "entity": { "tag": "sinal2" }, "exists": false } ] }, "then": [
      { "do": "objective", "id": "sinais", "status": "done" },
      { "do": "say", "speaker": { "pt": "Odisseu", "en": "Odysseus" }, "icon": "🏹",
        "text": { "pt": "Sem fogueiras, os cavaleiros caçam no escuro. Gosto mais assim.", "en": "Without their fires, the riders hunt blind. I like it better this way." } } ] },
    { "id": "caca", "repeat": true, "when": { "all": [ { "every": { "seconds": 75, "after": 60 } }, { "not": { "fired": "sinais_caem" } }, { "objective": "escolta", "is": "pending" } ] }, "then": [
      { "do": "raid", "player": 2, "units": ["hippeus", "hippeus", "hetairoi"], "target": { "entity": { "tag": "odisseu" } }, "angle": 7 } ] },
    { "id": "caca_cega", "repeat": true, "when": { "all": [ { "every": { "seconds": 120 } }, { "fired": "sinais_caem" }, { "objective": "escolta", "is": "pending" } ] }, "then": [
      { "do": "raid", "player": 2, "units": ["hippeus", "hippeus"], "target": { "tc": 0 }, "angle": 0 } ] },
    { "id": "vau", "when": { "any": [
        { "units": { "player": 0, "tag": "odisseu", "near": { "point": { "at": [64, 36] }, "radius": 5 } }, "gte": 1 },
        { "units": { "player": 0, "tag": "odisseu", "near": { "point": { "at": [64, 78] }, "radius": 5 } }, "gte": 1 } ] }, "then": [
      { "do": "raid", "player": 2, "units": ["hetairoi", "hetairoi", "hippeus", "hippeus", "hippeus"], "target": { "entity": { "tag": "odisseu" } }, "angle": 0, "distance": 16 },
      { "do": "say", "speaker": { "pt": "Batedor", "en": "Scout" }, "icon": "🐎",
        "text": { "pt": "Cavalaria na outra margem! Lanças na frente: cavalo não gosta de ponta.", "en": "Cavalry on the far bank! Spears to the front: horses hate points." } } ] },
    { "id": "hera", "when": { "objective": "heraion", "is": "done" }, "then": [
      { "do": "give", "player": 0, "resources": { "favor": 80 } },
      { "do": "say", "speaker": "Hera", "icon": "👑",
        "text": { "pt": "O astuto passou pelo meu templo. Que ao menos meu marido cumpra a própria lei.", "en": "The cunning one passed my temple. May my husband at least keep his own law." } } ] },
    { "id": "resgate_pago", "when": { "all": [ { "buildings": { "player": 0, "type": "market", "complete": true }, "gte": 1 }, { "value": { "stat": "gold", "player": 0 }, "gte": 1500 }, { "objective": "escolta", "is": "pending" } ] }, "then": [
      { "do": "give", "player": 0, "resources": { "gold": -1500 } },
      { "do": "ceasefire", "seconds": 120 },
      { "do": "say", "speaker": { "pt": "Emissário do Istmo", "en": "Envoy of the Isthmus" }, "icon": "🔱",
        "text": { "pt": "Ouro fala mais alto que o mar. Dois minutos, arconte. Nem um a mais.", "en": "Gold speaks louder than the sea. Two minutes, archon. Not one more." } } ] },
    { "id": "fim", "when": { "objective": "escolta", "is": "done" }, "then": [
      { "do": "say", "speaker": "Poseidon", "icon": "🔱",
        "text": { "pt": "Argos escolheu. Que Argos se lembre disso quando o mar subir.", "en": "Argos has chosen. Let Argos remember it when the sea rises." } } ] }
  ],
  "victory": { "objective": "escolta", "is": "done" },
  "defeat": { "any": [
    { "entity": { "tag": "odisseu" }, "exists": false },
    { "all": [ { "time": { "gte": 5 } }, { "buildings": { "player": 0, "type": "town_center" }, "eq": 0 } ] }
  ] },
  "hud": [
    { "type": "countdown", "seconds": 45, "while": { "time": { "lt": 45 } }, "label": { "pt": "🕊️ Trégua", "en": "🕊️ Truce" } }
  ]
}
```

**Notas de design:**
- A caça mira **onde Odisseu estava no momento do disparo**, porque o `raid` resolve o alvo uma vez só. Ela não o persegue. A tensão vem do ritmo (75 s) e do vau.
- O `resgate` só dispara com um **Mercado de pé**. Construir o Mercado é o "sim" do jogador, e assim o gatilho nunca toma ouro de quem não quis negociar. A trégua para todo mundo, inclusive a caça.

**Derrota:** Odisseu morre, ou `DERROTA_CC`.

**Dificuldade:**
- **Hoje:** a caça escala (`raid`) e a Liga joga como IA Difícil.
- **Com [G3]:**
  - Fácil: `kill` em `sinal2` no segundo 1.
  - Difícil: `naufragos` exige 6, e a caça fica a cada 55 s. Isso pede gatilhos `caca_hard`/`caca` com `difficulty`.

**Diálogos-chave:**
- **Odisseu** (encontro): *"Pode me chamar de Ninguém. Os cavaleiros de Corinto me chamam de coisas piores."* / *"You may call me Nobody. The riders of Corinth call me worse."*
- **Atena** (aos 90 s): *"A hospitalidade é lei de Zeus. Nem toda lei agrada a todos os deuses."* / *"Hospitality is the law of Zeus. Not every law pleases every god."*
- **Odisseu** (Mercado, aos 150 s): *"Ouro não dá em árvore, arconte... mas madeira dá. E o Mercado troca uma pela outra."* / *"Gold doesn't grow on trees, archon... but wood does. And the Market trades one for the other."*

**Outro:**
- PT: *"Odisseu jantou à mesa de Argos e pagou com a única moeda que tinha: conselhos. Em Corinto, a Liga afia as lanças. E no Olimpo, Zeus quer ser visto do mar."*
- EN: *"Odysseus dined at the table of Argos and paid with the only coin he had: advice. In Corinth, the League sharpens its spears. And on Olympus, Zeus wants to be seen from the sea."*

---

### 5.3 M6 · A Estátua de Zeus / *The Statue of Zeus* 🗽

- **Subtítulo:** Ato II · Missão 6 · Maravilha / *Act II · Mission 6 · Wonder*
- **Mecânica em destaque:** erguer uma **Maravilha** e mantê-la de pé por **6 minutos** sob ataque, com reparo, torres e uma IA aliada.
- **Mecânica cobrada:** chegar à Idade Mítica, com a 4ª pesquisa da Academia.
- **Tema:** o **custo humano**. Um objetivo secundário pede que o povo não seja sacrificado à obra.
- **Objetivo-tipo:** maravilha. **Tempo:** 25–30 min. **Lacunas:** nenhuma. Com [G4], ganha uma barra de guarda no painel.

**Jogadores:**

| # | Nome | Deus | Controle | Time |
|---|---|---|---|---|
| 0 | Argos | Zeus | humano | 0 |
| 1 | Liga do Istmo | Poseidon | IA normal | 1 |
| 2 | Micenas | Zeus | IA fácil (aliada) | 0 |
| 3 | Frota de Poseidon | Poseidon | marionete (sem kit) | 1 |

**Idade e recursos:** Heroica, com `civic1`, `science1` e `commerce1` concedidas (3 de 4 pesquisas para a Mítica). 1000 / 1000 / 800 / 100 favor / 300 conhecimento.

**Mapa `gen` médio, `continental`, semente 6606 (4 inícios).** É a missão mais barata: nenhum mapa para desenhar. Templo e Academia de Argos são pré-colocados por `place` relativo a `{ "tc": 0 }`.

**Briefing:**
1. PT: *"Zeus quer bronze. Quer que Poseidon, do alto das ondas, veja o rosto do irmão sobre a Argólida."*
   EN: *"Zeus wants bronze. He wants Poseidon, from atop the waves, to see his brother's face over the Argolid."*
2. PT: *"Alcance a Idade Mítica, erga a Estátua de Zeus e mantenha-a de pé por seis minutos. Micenas prometeu lanças. A Liga prometeu fogo."*
   EN: *"Reach the Mythic Age, raise the Statue of Zeus and keep it standing for six minutes. Mycenae promised spears. The League promised fire."*

**Objetivos:**

| id | Tipo | Texto PT / EN |
|---|---|---|
| `mitica` | principal | Alcance a Idade Mítica / *Reach the Mythic Age* |
| `estatua` | principal | Erga a Estátua de Zeus (Maravilha, tecla M) / *Raise the Statue of Zeus (Wonder, M key)* |
| `guardar` | principal | Mantenha a Estátua de pé por 6 minutos / *Keep the Statue standing for 6 minutes* |
| `micenas` | secundário | Não deixe Micenas cair / *Don't let Mycenae fall* |
| `povo` | secundário | O povo não é sacrificado à obra: tenha 20 cidadãos ao fim da guarda / *The people are not sacrificed to the work: have 20 villagers when the watch ends* |
| `colossos` | secreto | Derrube os dois Colossos de Poseidon / *Topple both of Poseidon's Colossi* |

```json
{
  "config": {
    "players": [
      { "name": "Argos", "god": "zeus", "isAI": false, "difficulty": "normal", "team": 0 },
      { "name": "Liga do Istmo", "god": "poseidon", "isAI": true, "difficulty": "normal", "team": 1 },
      { "name": "Micenas", "god": "zeus", "isAI": true, "difficulty": "easy", "team": 0 },
      { "name": "Frota de Poseidon", "god": "poseidon", "isAI": false, "difficulty": "normal", "team": 1 }
    ],
    "startingAge": 2,
    "startingResources": { "food": 1000, "wood": 1000, "gold": 800, "favor": 100, "knowledge": 300 },
    "startKit": [true, true, true, false]
  },
  "setup": [
    { "do": "set", "player": 0, "techs": ["civic1", "science1", "commerce1"] },
    { "do": "place", "player": 0, "building": "temple", "at": { "tc": 0, "dx": 6 }, "complete": true },
    { "do": "place", "player": 0, "building": "academy", "at": { "tc": 0, "dx": -6 }, "complete": true },
    { "do": "spawn", "player": 0, "units": ["villager", "villager", "villager", "villager", "villager", "villager", "villager", "villager", "villager", "villager", "villager", "villager"], "at": { "tc": 0, "dy": 4 } },
    { "do": "spawn", "player": 0, "units": ["jason", "hoplite", "hoplite", "hoplite", "hoplite", "toxotes", "toxotes"], "at": { "tc": 0, "dy": -5 }, "tag": "jasao" }
  ],
  "objectives": [
    { "id": "mitica", "text": { "pt": "Alcance a Idade Mítica", "en": "Reach the Mythic Age" },
      "done": { "value": { "stat": "age", "player": 0 }, "gte": 3 } },
    { "id": "estatua", "text": { "pt": "Erga a Estátua de Zeus (Maravilha, tecla M)", "en": "Raise the Statue of Zeus (Wonder, M key)" },
      "done": { "buildings": { "player": 0, "type": "wonder_zeus", "complete": true }, "gte": 1 } },
    { "id": "guardar", "text": { "pt": "Mantenha a Estátua de pé por 6 minutos", "en": "Keep the Statue standing for 6 minutes" },
      "done": { "var": "estatua_s", "gte": 360 } },
    { "id": "micenas", "optional": true, "text": { "pt": "Não deixe Micenas cair", "en": "Don't let Mycenae fall" },
      "done": { "var": "estatua_s", "gte": 360 },
      "failed": { "all": [ { "time": { "gte": 5 } }, { "buildings": { "player": 2, "type": "town_center" }, "eq": 0 } ] } },
    { "id": "povo", "optional": true, "text": { "pt": "O povo não é sacrificado à obra: tenha 20 cidadãos ao fim da guarda", "en": "The people are not sacrificed to the work: have 20 villagers when the watch ends" },
      "done": { "all": [ { "var": "estatua_s", "gte": 360 }, { "units": { "player": 0, "type": "villager" }, "gte": 20 } ] },
      "failed": { "all": [ { "objective": "estatua", "is": "done" }, { "units": { "player": 0, "type": "villager" }, "lt": 20 } ] } },
    { "id": "colossos", "optional": true, "hidden": true, "text": { "pt": "Derrube os dois Colossos de Poseidon", "en": "Topple both of Poseidon's Colossi" } }
  ],
  "triggers": [
    { "id": "estatua_tick", "repeat": true, "when": { "buildings": { "player": 0, "type": "wonder_zeus", "complete": true }, "gte": 1 }, "then": [
      { "do": "addVar", "name": "estatua_s", "delta": 1 } ] },
    { "id": "estatua_caiu", "repeat": true, "when": { "all": [ { "var": "estatua_s", "gt": 0 }, { "var": "estatua_s", "lt": 360 }, { "buildings": { "player": 0, "type": "wonder_zeus" }, "eq": 0 } ] }, "then": [
      { "do": "setVar", "name": "estatua_s", "value": 0 },
      { "do": "addVar", "name": "quedas", "delta": 1 },
      { "do": "say", "speaker": "Zeus", "icon": "⚡",
        "text": { "pt": "Meu rosto no chão, arconte? Erga-o de novo. Não haverá terceira vez.", "en": "My face in the dust, archon? Raise it again. There will be no third time." } } ] },
    { "id": "obra", "when": { "buildings": { "player": 0, "type": "wonder_zeus", "complete": false }, "gte": 1 }, "then": [
      { "do": "spawn", "player": 3, "units": ["colossus"], "at": { "tc": 1, "dy": 5 }, "tag": "colosso1" },
      { "do": "order", "units": { "tag": "colosso1" }, "order": { "type": "attackMove", "at": { "entity": { "player": 0, "type": "wonder_zeus" } } } },
      { "do": "say", "speaker": "Poseidon", "icon": "🔱",
        "text": { "pt": "Bronze para o meu irmão? Então bronze ele terá.", "en": "Bronze for my brother? Then bronze he shall have." } } ] },
    { "id": "colosso2", "when": { "var": "estatua_s", "gte": 180 }, "then": [
      { "do": "spawn", "player": 3, "units": ["colossus", "hoplite", "hoplite", "hoplite"], "at": { "tc": 1, "dy": 5 }, "tag": "colosso2" },
      { "do": "order", "units": { "tag": "colosso2" }, "order": { "type": "attackMove", "at": { "entity": { "player": 0, "type": "wonder_zeus" } } } } ] },
    { "id": "colossos_caem", "when": { "all": [ { "fired": "colosso2" }, { "units": { "player": 3, "type": "colossus" }, "eq": 0 } ] }, "then": [
      { "do": "objective", "id": "colossos", "status": "done" },
      { "do": "give", "player": 0, "resources": { "favor": 100 } } ] },
    { "id": "cerco_estatua", "repeat": true, "when": { "all": [ { "every": { "seconds": 90 } }, { "buildings": { "player": 0, "type": "wonder_zeus" }, "gte": 1 }, { "var": "estatua_s", "lt": 360 } ] }, "then": [
      { "do": "raid", "player": 3, "units": ["hoplite", "hoplite", "hippeus", "hippeus", "petrobolos"], "target": { "entity": { "player": 0, "type": "wonder_zeus" } }, "angle": 0 } ] },
    { "id": "onda1", "when": { "time": { "gte": 300 } }, "then": [
      { "do": "raid", "player": 3, "units": ["hoplite", "hoplite", "toxotes", "toxotes"], "target": { "tc": 0 }, "angle": 0 } ] },
    { "id": "onda2", "when": { "time": { "gte": 540 } }, "then": [
      { "do": "raid", "player": 3, "units": ["hoplite", "hoplite", "hippeus", "hippeus", "toxotes", "toxotes"], "target": { "tc": 0 }, "angle": 1 } ] },
    { "id": "falta4", "when": { "var": "estatua_s", "gte": 120 }, "then": [
      { "do": "say", "speaker": { "pt": "Oráculo de Delfos", "en": "Oracle of Delphi" }, "icon": "🔮",
        "text": { "pt": "Faltam quatro minutos. Enquanto o bronze sobe, o celeiro desce: os deuses nunca pagam a obra.", "en": "Four minutes left. While the bronze rises, the granary sinks: the gods never pay for the work." } } ] },
    { "id": "micenas_ajuda", "when": { "objective": "estatua", "is": "done" }, "then": [
      { "do": "spawn", "player": 0, "units": ["hoplite", "hoplite", "hoplite", "hoplite", "hoplite", "hoplite", "hetairoi", "hetairoi"], "at": { "tc": 0, "dy": 6 } },
      { "do": "say", "speaker": { "pt": "Rei Atreu de Micenas", "en": "King Atreus of Mycenae" }, "icon": "🦅",
        "text": { "pt": "Micenas lembra quem a salvou de Hades. Estas lanças são tuas, arconte.", "en": "Mycenae remembers who saved it from Hades. These spears are yours, archon." } } ] }
  ],
  "victory": { "all": [ { "objective": "mitica", "is": "done" }, { "objective": "guardar", "is": "done" } ] },
  "defeat": { "any": [
    { "all": [ { "time": { "gte": 5 } }, { "buildings": { "player": 0, "type": "town_center" }, "eq": 0 } ] },
    { "var": "quedas", "gte": 2 }
  ] },
  "hud": [
    { "type": "progress", "entity": { "player": 0, "type": "wonder_zeus" }, "max": 240, "label": { "pt": "🗽 Obra da Estátua", "en": "🗽 Statue construction" } }
  ]
}
```

**Notas de design:**
- A vitória por Maravilha do modo normal **não roda em cenários** [G2]. O contador `estatua_s` faz esse papel. As falas em `estatua_s` = 120, 240 e 300 (`falta4`, `falta2`, `falta1`) substituem a barra de guarda até existir [G4].
- **Colossos e ondas vêm do jogador 3, que é marionete.** Com unidades roteirizadas da Liga, a IA dela poderia desviá-las [G16].
- Os reforços de Micenas nascem **para o jogador 0** pelo mesmo motivo.
- A Liga (IA) pode erguer a própria Maravilha na Mítica. A vitória nativa dela também não roda, então isso não encerra a missão. Na história, é só a Liga imitando Argos.

**Derrota:** `DERROTA_CC`, ou a Estátua cai duas vezes (`quedas` ≥ 2). Fala de Zeus: *"Não aceito um deus de bronze que cai duas vezes."*

**Dificuldade:**
- **Hoje:** as ondas escalam. Os Colossos vêm por `spawn` e não escalam.
- **Com [G3]:**
  - guarda de 4, 6 ou 6 min (`guardar_easy` com `gte 240`);
  - no Fácil, sem o `colosso2`;
  - no Difícil, derrota já com 1 queda.

**Diálogos-chave:**
- **Zeus** (início): *"Quero bronze, arconte. Quero que Poseidon veja meu rosto do alto das ondas."* / *"I want bronze, archon. I want Poseidon to see my face from atop the waves."*
- **Jasão** (Estátua concluída): *"Torres em volta, cidadãos para reparar. Uma Maravilha é o maior alvo do mundo."* / *"Towers around it, villagers to repair. A Wonder is the biggest target in the world."*

**Outro:**
- PT: *"A Estátua brilha sobre a Argólida e Poseidon a vê. Naquela noite, um navio negro ancora na praia do sul: os mirmidões de Aquiles, emprestados pelo mar."*
- EN: *"The Statue gleams over the Argolid, and Poseidon sees it. That night a black ship anchors on the southern beach: Achilles' Myrmidons, on loan from the sea."*

---

### 5.4 M7 · A Cólera de Aquiles / *The Wrath of Achilles* 🔥

- **Subtítulo:** Ato II · Missão 7 · Caça ao herói / *Act II · Mission 7 · Hero hunt*
- **Mecânica em destaque:** caçar um herói inimigo que vai queimando aldeias. O poder **Oráculo** (revela o mapa por 60 s) vira ferramenta de caça. Há **duas soluções**: interceptar Aquiles no caminho, ou queimar o acampamento para que ele venha até você.
- **Mecânica cobrada:** defesa de edifícios espalhados.
- **Objetivo-tipo:** caça ao herói. **Tempo:** 20–30 min. **Lacunas:** nenhuma.

**Jogadores:**

| # | Nome | Deus | Controle | Time | Kit |
|---|---|---|---|---|---|
| 0 | Argos | Zeus (+ Atena e Apolo: Restauração e **Oráculo**) | humano | 0 | sim |
| 1 | Liga do Istmo | Poseidon | IA normal | 1 | sim |
| 2 | Mirmidões de Aquiles | Poseidon | marionete (só obedece a `order`: comportamento previsível) | 1 | não |

**Idade e recursos:** Heroica. 1000 / 800 / 800 / 120 favor / 300 conhecimento.

**Mapa `gen` médio, `forest`, semente 7707.** A mata densa quebra a linha de visão.
- As **4 aldeias** são Celeiros do jogador 0 com `tag` `aldeia1..4`, pré-colocados por `place` em `{ "tc": 0 }` com deslocamentos de ±16. O `placeNear` procura o tile livre mais próximo num raio de 14.
- O **acampamento mirmidão** é uma Fortaleza do jogador 2 em `{ "start": 2 }`.

**Briefing:**
1. PT: *"Poseidon pediu um favor à nereida Tétis, e ela emprestou o filho. Aquiles desembarcou no sul com seus mirmidões e queima as aldeias de Argos, uma a uma."*
   EN: *"Poseidon asked a favor of the nereid Thetis, and she lent him her son. Achilles has landed in the south with his Myrmidons and is burning the villages of Argos, one by one."*
2. PT: *"Ninguém vence Aquiles na planície. Mas ele é um só, e escolhe sempre a aldeia mais próxima. Salve o que puder e derrube o filho de Tétis."*
   EN: *"No one beats Achilles on open ground. But he is only one man, and he always chooses the nearest village. Save what you can and bring down the son of Thetis."*

**Objetivos:**

| id | Tipo | Texto PT / EN |
|---|---|---|
| `aquiles` | principal | Derrote Aquiles / *Defeat Achilles* |
| `aldeias` | secundário | Salve ao menos 2 aldeias / *Save at least 2 villages* |
| `acampamento` | secundário | Queime o acampamento mirmidão / *Burn the Myrmidon camp* |
| `odisseu_vivo` | secreto | Derrote Aquiles com Odisseu vivo / *Defeat Achilles with Odysseus alive* |

```json
{
  "config": {
    "players": [
      { "name": "Argos", "god": "zeus", "isAI": false, "difficulty": "normal", "team": 0 },
      { "name": "Liga do Istmo", "god": "poseidon", "isAI": true, "difficulty": "normal", "team": 1 },
      { "name": "Mirmidões de Aquiles", "god": "poseidon", "isAI": false, "difficulty": "normal", "team": 1 }
    ],
    "startingAge": 2,
    "startingResources": { "food": 1000, "wood": 800, "gold": 800, "favor": 120, "knowledge": 300 },
    "startKit": [true, true, false]
  },
  "setup": [
    { "do": "set", "player": 0, "minorGods": ["athena", "apollo"] },
    { "do": "place", "player": 0, "building": "granary", "at": { "tc": 0, "dx": 16, "dy": 10 }, "tag": "aldeia1" },
    { "do": "place", "player": 0, "building": "granary", "at": { "tc": 0, "dx": -16, "dy": 12 }, "tag": "aldeia2" },
    { "do": "place", "player": 0, "building": "granary", "at": { "tc": 0, "dx": 14, "dy": -14 }, "tag": "aldeia3" },
    { "do": "place", "player": 0, "building": "granary", "at": { "tc": 0, "dx": -14, "dy": -14 }, "tag": "aldeia4" },
    { "do": "spawn", "player": 0, "units": ["hypaspist", "hypaspist", "hypaspist", "cretan_archer", "cretan_archer", "cretan_archer"], "at": { "tc": 0, "dy": 5 } },
    { "do": "spawn", "player": 0, "units": ["odysseus"], "at": { "tc": 0, "dy": 3 }, "tag": "odisseu" },
    { "do": "place", "player": 2, "building": "fortress", "at": { "start": 2 }, "tag": "acampamento" },
    { "do": "spawn", "player": 2, "units": ["achilles"], "at": { "start": 2, "dy": 4 }, "tag": "aquiles" },
    { "do": "spawn", "player": 2, "units": ["myrmidon", "myrmidon", "myrmidon", "myrmidon", "myrmidon", "myrmidon", "myrmidon", "myrmidon"], "at": { "start": 2, "dy": 5 }, "tag": "mirmidoes" }
  ],
  "objectives": [
    { "id": "aquiles", "text": { "pt": "Derrote Aquiles", "en": "Defeat Achilles" },
      "done": { "entity": { "tag": "aquiles" }, "exists": false } },
    { "id": "aldeias", "optional": true, "text": { "pt": "Salve ao menos 2 aldeias", "en": "Save at least 2 villages" },
      "done": { "all": [ { "objective": "aquiles", "is": "done" }, { "var": "aldeias_perdidas", "lt": 3 } ] },
      "failed": { "var": "aldeias_perdidas", "gte": 3 } },
    { "id": "acampamento", "optional": true, "text": { "pt": "Queime o acampamento mirmidão", "en": "Burn the Myrmidon camp" },
      "done": { "entity": { "tag": "acampamento" }, "exists": false } },
    { "id": "odisseu_vivo", "optional": true, "hidden": true, "text": { "pt": "Derrote Aquiles com Odisseu vivo", "en": "Defeat Achilles with Odysseus alive" } }
  ],
  "triggers": [
    { "id": "rota1", "when": { "time": { "gte": 150 } }, "then": [
      { "do": "order", "units": { "tag": "aquiles" }, "order": { "type": "attackMove", "at": { "entity": { "tag": "aldeia1" } } } },
      { "do": "order", "units": { "tag": "mirmidoes" }, "order": { "type": "attackMove", "at": { "entity": { "tag": "aldeia1" } } } },
      { "do": "raid", "player": 2, "units": ["myrmidon", "peltast", "peltast"], "target": { "entity": { "tag": "aldeia1" } }, "angle": 2 },
      { "do": "say", "speaker": { "pt": "Batedor", "en": "Scout" }, "icon": "🐎",
        "text": { "pt": "Fumaça sobre a primeira aldeia! Os mirmidões marcham com ele.", "en": "Smoke over the first village! The Myrmidons march with him." } } ] },
    { "id": "rota2", "when": { "all": [ { "fired": "rota1" }, { "not": { "fired": "isca" } },
        { "any": [ { "time": { "gte": 330 } }, { "entity": { "tag": "aldeia1" }, "exists": false } ] } ] }, "then": [
      { "do": "order", "units": { "tag": "aquiles" }, "order": { "type": "attackMove", "at": { "entity": { "tag": "aldeia2" } } } },
      { "do": "order", "units": { "tag": "mirmidoes" }, "order": { "type": "attackMove", "at": { "entity": { "tag": "aldeia2" } } } },
      { "do": "raid", "player": 2, "units": ["myrmidon", "myrmidon", "peltast", "peltast"], "target": { "entity": { "tag": "aldeia2" } }, "angle": 3 } ] },
    { "id": "perda1", "when": { "entity": { "tag": "aldeia1" }, "exists": false }, "then": [ { "do": "addVar", "name": "aldeias_perdidas", "delta": 1 } ] },
    { "id": "perda2", "when": { "entity": { "tag": "aldeia2" }, "exists": false }, "then": [ { "do": "addVar", "name": "aldeias_perdidas", "delta": 1 } ] },
    { "id": "isca", "when": { "objective": "acampamento", "is": "done" }, "then": [
      { "do": "order", "units": { "tag": "aquiles" }, "order": { "type": "attackMove", "at": { "tc": 0 } } },
      { "do": "order", "units": { "tag": "mirmidoes" }, "order": { "type": "attackMove", "at": { "tc": 0 } } },
      { "do": "say", "speaker": { "pt": "Aquiles", "en": "Achilles" }, "icon": "🔥",
        "text": { "pt": "Queimaram minhas naus? Então vou até o seu trono, arconte, e não levo pressa nem medo.", "en": "You burned my ships? Then I'm coming to your throne, archon, with neither haste nor fear." } } ] },
    { "id": "apolo", "when": { "time": { "gte": 90 } }, "then": [
      { "do": "say", "speaker": "Apolo", "icon": "☀️",
        "text": { "pt": "Todo imortal tem um lado que não vê. Use meu Oráculo: por um minuto, nada se esconde de você.", "en": "Every immortal has a side he cannot see. Use my Oracle: for one minute, nothing hides from you." } } ] },
    { "id": "odisseu_premio", "when": { "all": [ { "objective": "aquiles", "is": "done" }, { "entity": { "tag": "odisseu" }, "exists": true } ] }, "then": [
      { "do": "objective", "id": "odisseu_vivo", "status": "done" } ] }
  ],
  "victory": { "objective": "aquiles", "is": "done" },
  "defeat": { "all": [ { "time": { "gte": 5 } }, { "buildings": { "player": 0, "type": "town_center" }, "eq": 0 } ] }
}
```

**Notas de design:**
- Odisseu nasce num `spawn` próprio, com `tag` `odisseu`. As tropas de escolta vêm num `spawn` separado, sem tag.
- `rota3` e `rota4` (aldeias 3 e 4, aos 510 e 690 s) e `perda3`/`perda4` seguem o mesmo modelo de `rota2`/`perda1`.
- Os mirmidões são marionete e só obedecem ao roteiro. Depois de arrasar a aldeia, **param lá**, o que dá tempo de interceptá-los.
- A escolta via `raid` em cada rota é o que escala com a dificuldade.
- Não existe "atacar e fugir": o motor não tem recuo roteirizado [G16]. Aquiles avança e luta até morrer. A caça está em **chegar antes dele** à aldeia seguinte.
- Aquiles (3,0 de velocidade) é **mais lento** que a cavalaria de Argos (hipeu 3,6). As falas não dizem o contrário.

**Derrota:** `DERROTA_CC`.

**Dificuldade:**
- **Hoje:** a escolta das rotas escala e a Liga joga como IA Difícil.
- **Com [G3]:** intervalo das rotas de 240, 180 ou 120 s.
- **Com [G12]:** Aquiles usa Fúria ao chegar a cada aldeia.

**Diálogos-chave:**
- **Aquiles** (rota1): *"Minha mãe me deu duas vidas para escolher: uma longa e esquecida, outra curta e cantada. Adivinhe qual escolhi, arconte."* / *"My mother gave me two lives to choose from: a long forgotten one, or a short one sung forever. Guess which I chose, archon."*
- **Odisseu** (aos 200 s): *"Não corra atrás dele pela mata. Esteja onde ele vai estar, ou dê a ele um motivo para vir até você."* / *"Don't chase him through the woods. Be where he's going to be, or give him a reason to come to you."*
- **Mirmidão** (após a queda): *"Nosso senhor caiu cantado, como queria. Voltamos ao mar."* / *"Our lord fell in song, as he wished. We return to the sea."*

**Outro:**
- PT: *"Aquiles caiu, e as aldeias choram um inimigo que não odiavam. Entre as coisas dele havia um presente: um colar de dentes de lobo. 'Para o filho da nereida, de um rei que também foi traído pelos deuses.'"*
- EN: *"Achilles has fallen, and the villages mourn an enemy they did not hate. Among his things was a gift: a necklace of wolf teeth. 'For the nereid's son, from a king the gods also betrayed.'"*

---

### 5.5 M8 · A Maré de Oceano / *The Tide of Oceanus* 🌊 *(clímax do Ato II e do EA)*

- **Subtítulo:** Ato II · Missão 8 · Titã / *Act II · Mission 8 · Titan*
- **Mecânica em destaque:** **chefe-Titã com contagem regressiva visível.** Há três respostas:
  - correr para a Idade dos Titãs e invocar Prometeu pelo Portal;
  - usar o Raio (que tira metade da vida de um Titã) com heróis (dano ×3 contra míticos);
  - usar muralhas, torres e cerco para atrasá-lo.
- **Mecânica cobrada:** muralhas e torres (m2).
- **Objetivo-tipo:** defesa + chefe. **Tempo:** 30–35 min. **Lacunas:** nenhuma.

**Jogadores:**

| # | Nome | Deus | Controle | Time | Kit |
|---|---|---|---|---|---|
| 0 | Argos | Zeus (+ Atena e Apolo) | humano | 0 | não (cidade no mapa) |
| 1 | Liga do Istmo | Poseidon | IA normal | 1 | sim |
| 2 | Oceano | Poseidon | marionete | 1 | não |
| 3 | Micenas | Zeus | IA fácil | 0 | sim |

**Idade e recursos:** Mítica, com `civic1`, `science1`, `military1` e `commerce1` concedidas. Para os Titãs faltam: uma Fortaleza, mais 2 pesquisas e o custo da Idade. 1500 / 1500 / 1500 / 200 favor / 800 conhecimento.

**Mapa `fixo` "Golfo da Argólida", 128×128:**
- **Norte, Argos numa colina** (`start` 0 = [64,20]). Entidades:
  - edifícios: CC, Templo, Academia, Quartel, Estábulo, Oficina de Cerco, 2 Torres e muralha parcial com 2 Portões;
  - unidades: 20 cidadãos.
- **Noroeste, Micenas** (`start` 3 = [20,24]). **Leste, a Liga** (`start` 1 = [110,64]).
- **Centro, os pântanos de Lerna** ([44,78], areia e terra) e duas estradas que descem ao sul.
- **Sul, uma praia larga** e o **mar** (água funda nas linhas y ≥ 124, intransponível, sem naval). `start` 2 = [64,120] fica na praia, sem kit: é o ponto de subida de Oceano.
- `relics: false`.

**Briefing:**
1. PT: *"Poseidon não esqueceu Odisseu, nem a Estátua, nem Aquiles. Desta vez não mandou homens: chamou Oceano, o rio que cerca o mundo, o Titã que nunca tomou partido."*
   EN: *"Poseidon has not forgotten Odysseus, nor the Statue, nor Achilles. This time he sent no men: he called Oceanus, the river that encircles the world, the Titan who never took sides."*
2. PT: *"A Pítia viu a onda: em dez minutos, o golfo se levanta. Fortifique Argos, chame Prometeu se puder, e lembre que o raio de Zeus fere até um Titã."*
   EN: *"The Pythia has seen the wave: in ten minutes, the gulf will rise. Fortify Argos, call Prometheus if you can, and remember that Zeus' bolt wounds even a Titan."*

**Objetivos:**

| id | Tipo | Texto PT / EN |
|---|---|---|
| `preparar` | principal | Prepare Argos: o Titã sobe em 10 minutos / *Prepare Argos: the Titan rises in 10 minutes* |
| `oceano` | principal, oculto até surgir | Derrote Oceano / *Defeat Oceanus* |
| `liga` | secundário | Destrua os Centros Cívicos da Liga / *Destroy the League's Town Centers* |
| `titas` | secundário | Chame Prometeu pelo Portal dos Titãs / *Call Prometheus through the Titans' Gate* |
| `jasao` | secundário | Jasão sobrevive à onda / *Jason survives the wave* |
| `lerna` | secreto | Mate a Hidra de Lerna antes que Oceano suba / *Slay the Hydra of Lerna before Oceanus rises* |

```json
{
  "config": {
    "players": [
      { "name": "Argos", "god": "zeus", "isAI": false, "difficulty": "normal", "team": 0 },
      { "name": "Liga do Istmo", "god": "poseidon", "isAI": true, "difficulty": "normal", "team": 1 },
      { "name": "Oceano", "god": "poseidon", "isAI": false, "difficulty": "normal", "team": 1 },
      { "name": "Micenas", "god": "zeus", "isAI": true, "difficulty": "easy", "team": 0 }
    ],
    "startingAge": 3,
    "startingResources": { "food": 1500, "wood": 1500, "gold": 1500, "favor": 200, "knowledge": 800 },
    "startKit": [false, true, false, true]
  },
  "setup": [
    { "do": "set", "player": 0, "minorGods": ["athena", "apollo"], "techs": ["civic1", "science1", "military1", "commerce1"] },
    { "do": "set", "player": 1, "techs": ["civic1", "military1", "military2", "science1"] },
    { "do": "spawn", "player": 0, "units": ["jason"], "at": { "tc": 0, "dy": 5 }, "tag": "jasao" },
    { "do": "spawn", "player": 0, "units": ["hoplite", "hoplite", "hoplite", "hoplite", "cretan_archer", "cretan_archer", "cretan_archer", "cretan_archer"], "at": { "tc": 0, "dy": 6 } },
    { "do": "spawn", "player": 2, "units": ["hydra"], "at": { "at": [44, 80] }, "tag": "hidra" }
  ],
  "objectives": [
    { "id": "preparar", "text": { "pt": "Prepare Argos: o Titã sobe em 10 minutos", "en": "Prepare Argos: the Titan rises in 10 minutes" },
      "done": { "time": { "gte": 600 } } },
    { "id": "oceano", "hidden": true, "text": { "pt": "Derrote Oceano", "en": "Defeat Oceanus" },
      "done": { "all": [ { "fired": "ergue" }, { "entity": { "tag": "oceano" }, "exists": false } ] } },
    { "id": "liga", "optional": true, "text": { "pt": "Destrua os Centros Cívicos da Liga", "en": "Destroy the League's Town Centers" },
      "done": { "all": [ { "time": { "gte": 5 } }, { "buildings": { "player": 1, "type": "town_center" }, "eq": 0 } ] } },
    { "id": "titas", "optional": true, "text": { "pt": "Chame Prometeu pelo Portal dos Titãs", "en": "Call Prometheus through the Titans' Gate" },
      "done": { "units": { "player": 0, "type": "prometheus" }, "gte": 1 } },
    { "id": "jasao", "optional": true, "text": { "pt": "Jasão sobrevive à onda", "en": "Jason survives the wave" },
      "done": { "all": [ { "objective": "oceano", "is": "done" }, { "entity": { "tag": "jasao" }, "exists": true } ] },
      "failed": { "entity": { "tag": "jasao" }, "exists": false } },
    { "id": "lerna", "optional": true, "hidden": true, "text": { "pt": "Mate a Hidra de Lerna antes que Oceano suba", "en": "Slay the Hydra of Lerna before Oceanus rises" } }
  ],
  "triggers": [
    { "id": "start", "when": { "time": { "gte": 1 } }, "then": [
      { "do": "say", "speaker": "Poseidon", "icon": "🔱",
        "text": { "pt": "Chamei o rio que cerca o mundo, arconte. Ele não conhece Zeus. Não conhece nada além de subir.", "en": "I have called the river that circles the world, archon. He does not know Zeus. He knows nothing but rising." } } ] },
    { "id": "hidra_morta", "when": { "all": [ { "not": { "fired": "ergue" } }, { "entity": { "tag": "hidra" }, "exists": false } ] }, "then": [
      { "do": "objective", "id": "lerna", "status": "done" },
      { "do": "give", "player": 0, "resources": { "favor": 100 } } ] },
    { "id": "onda1", "when": { "time": { "gte": 180 } }, "then": [
      { "do": "raid", "player": 2, "units": ["hippeus", "hippeus", "hoplite", "hoplite", "toxotes"], "target": { "tc": 0 }, "angle": 2 } ] },
    { "id": "onda2", "when": { "time": { "gte": 390 } }, "then": [
      { "do": "raid", "player": 2, "units": ["hetairoi", "hetairoi", "hoplite", "hoplite", "petrobolos"], "target": { "tc": 0 }, "angle": 1 } ] },
    { "id": "aviso", "when": { "time": { "gte": 480 } }, "then": [
      { "do": "say", "speaker": { "pt": "Oráculo de Delfos", "en": "Oracle of Delphi" }, "icon": "🔮",
        "text": { "pt": "Dois minutos. O mar recua da praia, arconte. É assim que ele toma fôlego.", "en": "Two minutes. The sea is pulling back from the beach, archon. That is how it draws breath." } } ] },
    { "id": "ergue", "when": { "time": { "gte": 600 } }, "then": [
      { "do": "spawn", "player": 2, "units": ["oceanus"], "at": { "at": [64, 118] }, "tag": "oceano" },
      { "do": "order", "units": { "tag": "oceano" }, "order": { "type": "attackMove", "at": { "tc": 0 } } },
      { "do": "reveal", "id": "oceano" },
      { "do": "say", "speaker": { "pt": "Oceano", "en": "Oceanus" }, "icon": "🌊",
        "text": { "pt": "Pequena cidade de pedra... eu já cobri montanhas maiores.", "en": "Little city of stone... I have covered greater mountains." } },
      { "do": "say", "speaker": "Zeus", "icon": "⚡",
        "text": { "pt": "Meu raio corta a vida de um Titã pela metade. O resto é trabalho de mortais.", "en": "My bolt cuts a Titan's life in half. The rest is mortal work." } } ] },
    { "id": "mare", "repeat": true, "when": { "all": [ { "fired": "ergue" }, { "every": { "seconds": 60 } }, { "entity": { "tag": "oceano" }, "exists": true } ] }, "then": [
      { "do": "raid", "player": 2, "units": ["hydra", "hippeus", "hippeus"], "target": { "tc": 0 }, "angle": 2 } ] },
    { "id": "vitoria_fala", "when": { "objective": "oceano", "is": "done" }, "then": [
      { "do": "say", "speaker": "Poseidon", "icon": "🔱",
        "text": { "pt": "O rio voltou ao leito. Guarde esta vitória, arconte. O mar tem memória longa.", "en": "The river has returned to its bed. Keep this victory, archon. The sea has a long memory." } } ] }
  ],
  "victory": { "objective": "oceano", "is": "done" },
  "defeat": { "all": [ { "time": { "gte": 5 } }, { "buildings": { "player": 0, "type": "town_center" }, "eq": 0 } ] },
  "hud": [
    { "type": "countdown", "seconds": 600, "while": { "not": { "fired": "ergue" } }, "label": { "pt": "🌊 Oceano sobe em", "en": "🌊 Oceanus rises in" } }
  ]
}
```

**Notas de design:**
- O Prometeu **invocado** pelo Portal é coerente com a m4. Desde que foi libertado, ele atende ao chamado de Argos.
- O Oceano **inimigo** é criado por `spawn` num jogador marionete. Não vem de Portal nenhum, então a Liga não tem como gerar "outro Oceano" sem Portal. A IA da Liga chegar aos Titãs em 30 min é improvável, e o teste confere se existe no máximo 1 `oceanus`.

**Derrota:** `DERROTA_CC`.

**Dificuldade:**
- **Hoje:** as ondas e as marés escalam, e a Liga joga como IA Difícil.
- **Com [G3]:** Oceano sobe aos 13, 10 ou 8 min, com três gatilhos `ergue_*` e três HUDs. No Fácil, Micenas passa para IA normal via `ai` [G16].

**Diálogos-chave:**
- **Jasão** (aos 60 s): *"Muralhas não param um rio, arconte. Mas o fazem escolher um caminho."* / *"Walls don't stop a river, archon. But they make it choose a path."*
- **Rei Atreu** (aos 30 s): *"Micenas está contigo. Mandamos o que temos."* / *"Mycenae stands with you. We send what we have."*

**Outro (a saída de Jasão, fiel ao mito, e a virada do ato):**
- PT: *"Oceano voltou ao leito que cerca o mundo. Jasão sobreviveu à onda, mas não à vergonha: partiu para Corinto, e dizem que morreu dormindo à sombra da Argo quando a proa podre caiu sobre ele. Na praia, Lícaon deixou uma mensagem escrita na areia molhada: 'Dois Titãs. Falta um.' A Pítia fecha os olhos: 'Duas vezes Argos venceu um Titã. Na terceira, o preço será a própria Argos.'"*
- EN: *"Oceanus has returned to the bed that circles the world. Jason survived the wave, but not the shame: he left for Corinth, and they say he died asleep in the shadow of the Argo when its rotten prow fell on him. On the beach, Lycaon left a message in the wet sand: 'Two Titans. One to go.' The Pythia closes her eyes: 'Twice Argos has beaten a Titan. The third time, the price will be Argos itself.'"*

**Fim do Early Access.** O `outro` é fixo, mesmo que Jasão tenha morrido na partida. Um desfecho condicional pede [G15].

---

### 5.6 M9 · A Descida ao Tênaro / *The Descent at Taenarum* 💀

- **Subtítulo:** Ato III · Missão 9 · Criaturas míticas / *Act III · Mission 9 · Myth units*
- **Mecânica em destaque:** **jogar como Hades**, com um exército mítico. Envolve Cérbero no Templo, Sombras que voltam dos mortos, custo em Favor e o triângulo herói > mítica > humano.
- **Mecânica cobrada:** heróis contra míticas (Héracles e Perseu).
- **Objetivo-tipo:** resgate (jaulas) + cerco leve (fendas). **Tempo:** 25–30 min.
- **Lacunas:** nenhuma. Relíquias como secundário só com [G10].

**Jogadores:**

| # | Nome | Deus | Controle | Time | Kit |
|---|---|---|---|---|---|
| 0 | Legiões de Hades (comandadas pelo arconte) | **Hades** (+ Atena e Apolo) | humano | 0 | sim ("Palácio de Hades" = CC) |
| 1 | Culto de Cronos | **Zeus** (o raio roubado: Raio e Pégasos contra o jogador) | IA normal | 1 | sim |
| 2 | Carcereiros de Cronos | Zeus | marionete | 1 | não |

**Idade e recursos:** Heroica, com `civic1`, `science1` e `military1` concedidas (a Mítica está a uma pesquisa). 800 / 500 / 800 / **250 favor** / 300 conhecimento.

**Mapa `gen` médio, `lakes`, semente 9909.** Os lagos fazem o papel do Estige e do Aqueronte. Tudo o que é especial vem por `place`, relativo ao `start` 1:
- as **3 jaulas dos Ciclopes** são Torres do jogador 2 com `tag` `jaula1..3`;
- as **3 Fendas do Tártaro** são Templos do jogador 2 com `tag` `fenda1..3`.

A paleta de bioma "Submundo" é visual e pedido da Fase 2 [G14]. Até lá, o terreno usa as cores comuns.

**Briefing:**
1. PT: *"Hades nunca pediu ajuda a um mortal. Hoje pede. Os sacerdotes que marcharam contra Argos em seu nome serviam a Lícaon, e agora o Culto está no Tártaro, com o raio roubado de Zeus e os Ciclopes que o forjam presos em jaulas."*
   EN: *"Hades has never asked a mortal for help. Today he does. The priests who marched on Argos in his name served Lycaon, and now the Cult is in Tartarus, with Zeus' stolen bolt and the Cyclopes who forge it locked in cages."*
2. PT: *"Comande as legiões dos mortos, arconte. Liberte os Ciclopes e feche as fendas por onde o Culto desce. Héracles já conhece o caminho."*
   EN: *"Command the legions of the dead, archon. Free the Cyclopes and seal the rifts through which the Cult descends. Heracles already knows the way."*

**Objetivos:**

| id | Tipo | Texto PT / EN |
|---|---|---|
| `jaulas` | principal | Liberte os Ciclopes (3 jaulas) / *Free the Cyclopes (3 cages)* |
| `fendas` | principal | Feche as 3 Fendas do Tártaro / *Seal the 3 Rifts of Tartarus* |
| `miticas` | secundário | Reúna 8 criaturas míticas / *Gather 8 myth units* |
| `cerbero` | secundário | Treine um Cérbero no Templo / *Train a Cerberus at the Temple* |
| `sombras` | secreto | Legião de Sombras: tenha 10 Sombras / *Legion of Shades: have 10 Shades* |

```json
{
  "config": {
    "players": [
      { "name": "Legiões de Hades", "god": "hades", "isAI": false, "difficulty": "normal", "team": 0 },
      { "name": "Culto de Cronos", "god": "zeus", "isAI": true, "difficulty": "normal", "team": 1 },
      { "name": "Carcereiros de Cronos", "god": "zeus", "isAI": false, "difficulty": "normal", "team": 1 }
    ],
    "startingAge": 2,
    "startingResources": { "food": 800, "wood": 500, "gold": 800, "favor": 250, "knowledge": 300 },
    "startKit": [true, true, false]
  },
  "setup": [
    { "do": "set", "player": 0, "minorGods": ["athena", "apollo"], "techs": ["civic1", "science1", "military1"] },
    { "do": "place", "player": 0, "building": "temple", "at": { "tc": 0, "dx": 6 }, "complete": true },
    { "do": "place", "player": 0, "building": "temple", "at": { "tc": 0, "dx": -6 }, "complete": true },
    { "do": "place", "player": 0, "building": "academy", "at": { "tc": 0, "dy": 6 }, "complete": true },
    { "do": "spawn", "player": 0, "units": ["heracles"], "at": { "tc": 0, "dy": -4 }, "tag": "heracles" },
    { "do": "spawn", "player": 0, "units": ["minotaur", "minotaur", "minotaur", "shade", "shade", "shade", "shade", "shade", "shade"], "at": { "tc": 0, "dy": -6 } },
    { "do": "place", "player": 2, "building": "tower", "at": { "start": 1, "dx": -14, "dy": 8 }, "tag": "jaula1" },
    { "do": "place", "player": 2, "building": "tower", "at": { "start": 1, "dx": 12, "dy": 12 }, "tag": "jaula2" },
    { "do": "place", "player": 2, "building": "tower", "at": { "start": 1, "dx": 0, "dy": -14 }, "tag": "jaula3" },
    { "do": "place", "player": 2, "building": "temple", "at": { "start": 1, "dx": -20, "dy": 18 }, "tag": "fenda1" },
    { "do": "place", "player": 2, "building": "temple", "at": { "start": 1, "dx": 20, "dy": 16 }, "tag": "fenda2" },
    { "do": "place", "player": 2, "building": "temple", "at": { "start": 1, "dx": 16, "dy": -18 }, "tag": "fenda3" }
  ],
  "objectives": [
    { "id": "jaulas", "text": { "pt": "Liberte os Ciclopes (3 jaulas)", "en": "Free the Cyclopes (3 cages)" },
      "done": { "all": [ { "entity": { "tag": "jaula1" }, "exists": false }, { "entity": { "tag": "jaula2" }, "exists": false }, { "entity": { "tag": "jaula3" }, "exists": false } ] } },
    { "id": "fendas", "text": { "pt": "Feche as 3 Fendas do Tártaro", "en": "Seal the 3 Rifts of Tartarus" },
      "done": { "all": [ { "entity": { "tag": "fenda1" }, "exists": false }, { "entity": { "tag": "fenda2" }, "exists": false }, { "entity": { "tag": "fenda3" }, "exists": false } ] } },
    { "id": "miticas", "optional": true, "text": { "pt": "Reúna 8 criaturas míticas", "en": "Gather 8 myth units" },
      "done": { "units": { "player": 0, "type": ["minotaur", "manticore", "cerberus", "cyclops", "nemean_lion", "medusa", "colossus", "hydra", "chimera", "centaur"] }, "gte": 8 } },
    { "id": "cerbero", "optional": true, "text": { "pt": "Treine um Cérbero no Templo", "en": "Train a Cerberus at the Temple" },
      "done": { "units": { "player": 0, "type": "cerberus" }, "gte": 1 } },
    { "id": "sombras", "optional": true, "hidden": true, "text": { "pt": "Legião de Sombras: tenha 10 Sombras", "en": "Legion of Shades: have 10 Shades" } }
  ],
  "triggers": [
    { "id": "start", "when": { "time": { "gte": 1 } }, "then": [
      { "do": "say", "speaker": "Hades", "icon": "💀",
        "text": { "pt": "Nunca pensei que pediria ajuda a um mortal. Nunca pensei que meu pai voltaria. O dia está cheio de surpresas.", "en": "I never thought I'd ask a mortal for help. I never thought my father would return. The day is full of surprises." } } ] },
    { "id": "dica_triangulo", "when": { "time": { "gte": 45 } }, "then": [
      { "do": "say", "speaker": { "pt": "Oráculo de Delfos", "en": "Oracle of Delphi" }, "icon": "🔮",
        "text": { "pt": "Heróis ferem criaturas míticas, míticas esmagam homens, homens em número derrubam heróis. Aqui embaixo, quase tudo é mítico.", "en": "Heroes wound myth units, myth units crush men, men in numbers bring down heroes. Down here, almost everything is mythic." } } ] },
    { "id": "perseu_chega", "when": { "time": { "gte": 90 } }, "then": [
      { "do": "spawn", "player": 0, "units": ["perseus"], "at": { "tc": 0, "dy": -4 }, "tag": "perseu" },
      { "do": "say", "speaker": { "pt": "Perseu", "en": "Perseus" }, "icon": "🪞",
        "text": { "pt": "Nasci em Argos e fui jogado ao mar dentro de um baú. Voltei para pagar a dívida, com juros.", "en": "I was born in Argos and thrown into the sea in a chest. I came back to repay the debt, with interest." } } ] },
    { "id": "jaula1_cai", "when": { "entity": { "tag": "jaula1" }, "exists": false }, "then": [
      { "do": "spawn", "player": 0, "units": ["cyclops", "cyclops"], "at": { "start": 1, "dx": -14, "dy": 8 } },
      { "do": "say", "speaker": { "pt": "Ciclope", "en": "Cyclops" }, "icon": "👁️",
        "text": { "pt": "Forjamos o raio de Zeus. Forjaremos a ruína de Cronos.", "en": "We forged the bolt of Zeus. We shall forge the ruin of Cronus." } } ] },
    { "id": "fenda1_onda", "repeat": true, "when": { "all": [ { "every": { "seconds": 120, "after": 180 } }, { "entity": { "tag": "fenda1" }, "exists": true } ] }, "then": [
      { "do": "raid", "player": 2, "units": ["hoplite", "hoplite", "hypaspist", "toxotes", "toxotes"], "target": { "tc": 0 }, "angle": 3 } ] },
    { "id": "fenda2_onda", "repeat": true, "when": { "all": [ { "every": { "seconds": 120, "after": 240 } }, { "entity": { "tag": "fenda2" }, "exists": true } ] }, "then": [
      { "do": "raid", "player": 2, "units": ["hippeus", "hippeus", "hetairoi", "cretan_archer"], "target": { "tc": 0 }, "angle": 1 } ] },
    { "id": "fenda3_onda", "repeat": true, "when": { "all": [ { "every": { "seconds": 120, "after": 300 } }, { "entity": { "tag": "fenda3" }, "exists": true } ] }, "then": [
      { "do": "raid", "player": 2, "units": ["hypaspist", "hypaspist", "petrobolos", "centaur"], "target": { "tc": 0 }, "angle": 5 } ] },
    { "id": "sombras_legiao", "when": { "units": { "player": 0, "type": "shade" }, "gte": 10 }, "then": [
      { "do": "objective", "id": "sombras", "status": "done" },
      { "do": "give", "player": 0, "resources": { "favor": 150 } } ] },
    { "id": "pacto", "when": { "all": [ { "objective": "jaulas", "is": "done" }, { "objective": "fendas", "is": "done" } ] }, "then": [
      { "do": "say", "speaker": "Hades", "icon": "💀",
        "text": { "pt": "Meus sacerdotes eram dele. Minha guerra contra Argos era dele. Lícaon me usou como um manto. Isso, arconte, eu não perdoo.", "en": "My priests were his. My war on Argos was his. Lycaon wore me like a cloak. That, archon, I do not forgive." } } ] }
  ],
  "victory": { "all": [ { "objective": "jaulas", "is": "done" }, { "objective": "fendas", "is": "done" } ] },
  "defeat": { "all": [ { "time": { "gte": 5 } }, { "buildings": { "player": 0, "type": "town_center" }, "eq": 0 } ] }
}
```

**Notas de design:**
- `jaula2_cai` e `jaula3_cai` seguem o modelo de `jaula1_cai`.
- Os Ciclopes libertados **não usam `tag` de grupo com `exists`**. A contagem é por tipo.
- Com a **fenda** fechada, a onda dela para. É o mesmo padrão de "desligar a fonte" da m5.
- O `set minorGods` ignora o panteão. Atena e Apolo pertencem à lista de Hades de qualquer forma.
- **Relíquias** (secundário, só com [G10]): *"Recupere o Elmo das Trevas"*, com `{ "value": { "stat": "relics", "player": 0 }, "gte": 2 }`. O mapa gerado já sorteia relíquias, mas hoje não há condição que as leia.

**Derrota:** `DERROTA_CC` (o Palácio de Hades).

**Dificuldade:**
- **Hoje:** as ondas das fendas escalam e o Culto joga como IA Difícil.
- **Com [G3]:** intervalo das fendas de 150, 120 ou 90 s, e Perseu chega aos 60, 90 ou 150 s.

**Diálogos-chave:**
- **Caronte** (aos 20 s): *"Uma moeda por cabeça, arconte. Os vivos pagam em dobro."* / *"One coin a head, archon. The living pay double."*
- **Héracles** (aos 30 s): *"Da última vez que desci aqui, foi para buscar um cachorro de três cabeças. Hoje ele luta do nosso lado."* / *"Last time I came down here, it was to fetch a three-headed dog. Today he fights on our side."*
- **Lícaon** (a primeira fenda cai): *"Ciclopes, raios, fendas... brinquedos. O que eu quero está no Ótris, e vocês vão abrir para mim."* / *"Cyclopes, bolts, rifts... toys. What I want is on Othrys, and you will open it for me."*

**Outro:**
- PT: *"Os Ciclopes forjam de novo, desta vez para os três irmãos. Hades, pela primeira vez desde a partilha do mundo, sobe à superfície. O Culto recua para o Monte Ótris, a velha fortaleza dos Titãs, onde três Pilares guardam... alguma coisa."*
- EN: *"The Cyclopes forge again, this time for all three brothers. Hades, for the first time since the world was divided, climbs to the surface. The Cult falls back to Mount Othrys, the old fortress of the Titans, where three Pillars guard... something."*

---

### 5.7 M10 · O Cerco de Ótris / *The Siege of Othrys* 🏰

- **Subtítulo:** Ato III · Missão 10 · Cerco / *Act III · Mission 10 · Siege*
- **Mecânica em destaque:**
  - **cerco clássico:** helépoles e petróbolos contra **muralhas concêntricas** e um Portão de Bronze;
  - **Rei da Colina** no Altar do Tempo, com `mode: "koth"` e a colina do mapa em [72,80]. A IA de todos os lados disputa a colina (`ai.ts`), e o jogo já mostra as mensagens de posse (`updateKoth` roda em cenário).
- **Mecânica cobrada:** IA aliada.
- **A vitória é o erro trágico da campanha.**
- **Objetivo-tipo:** cerco + rei da colina. **Tempo:** 30–35 min.
- **Lacunas:** funciona hoje com contador emulado. Com [G2] (`koth`) e [G4] (barra por variável), fica mais limpa.

**Jogadores:**

| # | Nome | Deus | Controle | Time | Kit |
|---|---|---|---|---|---|
| 0 | Argos | Zeus (+ Atena, Apolo e Hera) | humano | 0 | sim |
| 1 | Hades | Hades | IA normal (aliada) | 0 | sim |
| 2 | Culto de Cronos | Hades | IA difícil | 1 | sim (cidadela no mapa) |
| 3 | Sentinelas de Ótris | Hades | marionete | 1 | não |

**Idade e recursos:** Mítica. 2000 / 2000 / 1500 / 150 favor / 600 conhecimento. Entidades do jogador 0: Oficina de Cerco, 2 helépoles, 2 petróbolos e Perseu (`spawn`).

**Mapa `fixo` "Monte Ótris", 144×144, com `koth: [72, 80]`:**
- **Norte, a cidadela no platô.** Tem **dois anéis de muralha** (Muralhas do jogador 2 como entidades), com o **Portão de Bronze** no anel externo (Portão do jogador 2 com `tag` `portao_bronze`, [72,52]).
- **Dentro da cidadela:** os **3 Pilares do Tempo** (Fortalezas do jogador 2 com `tag` `pilar1` [60,24], `pilar2` [84,24], `pilar3` [72,14]) e o CC do Culto (`start` 2 = [72,32]).
- **Centro da planície, o Altar do Tempo** (a colina).
- **Acampamentos aliados:** Argos a sudoeste (`start` 0 = [24,120]) e Hades a sudeste (`start` 1 = [120,120]). O `start` 3 = [72,6] fica dentro da cidadela.
- `relics: false`.

**Briefing:**
1. PT: *"O Culto se trancou no Monte Ótris, a cidadela de onde os Titãs governaram a Idade de Ouro. Dois anéis de muralha, um Portão de Bronze e, no centro, três Pilares que zumbem como colmeias."*
   EN: *"The Cult has locked itself on Mount Othrys, the citadel from which the Titans ruled the Golden Age. Two rings of walls, a Bronze Gate and, at the heart, three Pillars that hum like beehives."*
2. PT: *"Hades trouxe suas legiões. Segure o Altar do Tempo na planície para cortar as sortidas, rompa o Portão e derrube os Pilares."*
   EN: *"Hades has brought his legions. Hold the Altar of Time on the plain to stop their sorties, breach the Gate and bring down the Pillars."*

**Objetivos:**

| id | Tipo | Texto PT / EN |
|---|---|---|
| `portao` | principal | Rompa o Portão de Bronze / *Breach the Bronze Gate* |
| `pilares` | principal | Derrube os três Pilares do Tempo / *Bring down the three Pillars of Time* |
| `altar` | secundário | Segure o Altar do Tempo por 2 minutos seguidos / *Hold the Altar of Time for 2 minutes straight* |
| `hades_vive` | secundário | O Centro Cívico de Hades não cai / *Hades' Town Center must not fall* |
| `licaon` | secreto | Mate Lícaon, o lobo, antes do último Pilar / *Slay Lycaon the wolf before the last Pillar* |

```json
{
  "config": {
    "players": [
      { "name": "Argos", "god": "zeus", "isAI": false, "difficulty": "normal", "team": 0 },
      { "name": "Hades", "god": "hades", "isAI": true, "difficulty": "normal", "team": 0 },
      { "name": "Culto de Cronos", "god": "hades", "isAI": true, "difficulty": "hard", "team": 1 },
      { "name": "Sentinelas de Ótris", "god": "hades", "isAI": false, "difficulty": "normal", "team": 1 }
    ],
    "startingAge": 3,
    "startingResources": { "food": 2000, "wood": 2000, "gold": 1500, "favor": 150, "knowledge": 600 },
    "startKit": [true, true, false, false],
    "mode": "koth"
  },
  "setup": [
    { "do": "set", "player": 0, "minorGods": ["athena", "apollo", "hera"], "techs": ["civic1", "science1", "military1", "military2"] },
    { "do": "set", "player": 2, "techs": ["masonry", "fortified_towns", "ballista_towers"] },
    { "do": "spawn", "player": 0, "units": ["perseus", "helepolis", "helepolis", "petrobolos", "petrobolos"], "at": { "tc": 0, "dy": -6 } },
    { "do": "spawn", "player": 3, "units": ["nemean_lion"], "at": { "at": [72, 20] }, "tag": "licaon" }
  ],
  "objectives": [
    { "id": "portao", "text": { "pt": "Rompa o Portão de Bronze", "en": "Breach the Bronze Gate" },
      "done": { "entity": { "tag": "portao_bronze" }, "exists": false } },
    { "id": "pilares", "text": { "pt": "Derrube os três Pilares do Tempo", "en": "Bring down the three Pillars of Time" },
      "done": { "all": [ { "entity": { "tag": "pilar1" }, "exists": false }, { "entity": { "tag": "pilar2" }, "exists": false }, { "entity": { "tag": "pilar3" }, "exists": false } ] } },
    { "id": "altar", "optional": true, "text": { "pt": "Segure o Altar do Tempo por 2 minutos seguidos", "en": "Hold the Altar of Time for 2 minutes straight" },
      "done": { "var": "altar_s", "gte": 120 } },
    { "id": "hades_vive", "optional": true, "text": { "pt": "O Centro Cívico de Hades não cai", "en": "Hades' Town Center must not fall" },
      "done": { "objective": "pilares", "is": "done" },
      "failed": { "all": [ { "time": { "gte": 5 } }, { "buildings": { "player": 1, "type": "town_center" }, "eq": 0 } ] } },
    { "id": "licaon", "optional": true, "hidden": true, "text": { "pt": "Mate Lícaon, o lobo, antes do último Pilar", "en": "Slay Lycaon the wolf before the last Pillar" } }
  ],
  "triggers": [
    { "id": "altar_tick", "repeat": true, "when": { "all": [
        { "objective": "altar", "is": "pending" },
        { "any": [
          { "units": { "player": 0, "military": true, "near": { "point": { "at": [72, 80] }, "radius": 6 } }, "gte": 1 },
          { "units": { "player": 1, "military": true, "near": { "point": { "at": [72, 80] }, "radius": 6 } }, "gte": 1 } ] },
        { "units": { "player": 2, "military": true, "near": { "point": { "at": [72, 80] }, "radius": 6 } }, "eq": 0 },
        { "units": { "player": 3, "military": true, "near": { "point": { "at": [72, 80] }, "radius": 6 } }, "eq": 0 } ] }, "then": [
      { "do": "addVar", "name": "altar_s", "delta": 1 } ] },
    { "id": "altar_reset", "repeat": true, "when": { "all": [ { "objective": "altar", "is": "pending" }, { "var": "altar_s", "gt": 0 }, { "not": { "any": [
          { "units": { "player": 0, "military": true, "near": { "point": { "at": [72, 80] }, "radius": 6 } }, "gte": 1 },
          { "units": { "player": 1, "military": true, "near": { "point": { "at": [72, 80] }, "radius": 6 } }, "gte": 1 } ] } } ] }, "then": [
      { "do": "setVar", "name": "altar_s", "value": 0 } ] },
    { "id": "altar_tomado", "when": { "objective": "altar", "is": "done" }, "then": [
      { "do": "give", "player": 0, "resources": { "favor": 150 } },
      { "do": "say", "speaker": "Hades", "icon": "💀",
        "text": { "pt": "O altar é nosso. As sortidas acabaram. Traga as catapultas, arconte.", "en": "The altar is ours. The sorties are over. Bring the catapults, archon." } } ] },
    { "id": "sortida", "repeat": true, "when": { "all": [ { "every": { "seconds": 150, "after": 180 } }, { "objective": "altar", "is": "pending" } ] }, "then": [
      { "do": "raid", "player": 3, "units": ["cyclops", "medusa", "cerberus", "hypaspist", "hypaspist", "hypaspist"], "target": { "tc": 0 }, "angle": 7 } ] },
    { "id": "pilar1_cai", "when": { "entity": { "tag": "pilar1" }, "exists": false }, "then": [
      { "do": "say", "speaker": { "pt": "Cronos", "en": "Cronus" }, "icon": "⏳",
        "text": { "pt": "Cada pedra que cai é um século que me devolvem.", "en": "Every stone that falls is a century returned to me." } } ] },
    { "id": "licaon_morto", "when": { "all": [ { "entity": { "tag": "licaon" }, "exists": false }, { "not": { "objective": "pilares", "is": "done" } } ] }, "then": [
      { "do": "objective", "id": "licaon", "status": "done" },
      { "do": "say", "speaker": { "pt": "Lícaon", "en": "Lycaon" }, "icon": "🐺",
        "text": { "pt": "Matem o lobo... O banquete já está servido.", "en": "Kill the wolf... The feast is already served." } } ] },
    { "id": "peripecia", "when": { "objective": "pilares", "is": "done" }, "then": [
      { "do": "say", "speaker": { "pt": "Oráculo de Delfos", "en": "Oracle of Delphi" }, "icon": "🔮",
        "text": { "pt": "Os pilares não protegiam Cronos, arconte. Prendiam-no.", "en": "The pillars did not protect Cronus, archon. They held him." } } ] }
  ],
  "victory": { "objective": "pilares", "is": "done" },
  "defeat": { "all": [ { "time": { "gte": 5 } }, { "buildings": { "player": 0, "type": "town_center" }, "eq": 0 } ] }
}
```

**Notas de design:**
- O `portao_bronze` e os `pilarN` vêm de **entidades do mapa**, uma tag por entidade, então existem desde o segundo 0. O Lícaon-lobo nasce no `setup`.
- `pilar2_cai` e `pilar3_cai` seguem o modelo, com falas mais fortes de Cronos: *"Três mil anos de espera... e mais três pedras."*
- O `mode: "koth"` serve só para que as IAs disputem a colina e o jogo mostre as mensagens de posse. **A vitória nativa não roda em cenário**, então quem decide é `altar_s`. Esse contador exige 120 s, e não os 240 s do modo.
- Sem [G2], a condição do altar precisa de uma cláusula por jogador, porque `UnitFilter` não tem `team`.
- O Lícaon-lobo aparece como "Leão de Nemeia" até existir [G8].

**Derrota:** `DERROTA_CC`.

**Dificuldade:**
- **Hoje:** as sortidas escalam. O Culto joga como IA Difícil, ou Muito difícil no Difícil (degrau automático).
- **Com [G3]:** o altar exige 90, 120 ou 180 s. No Fácil, `kill` no `pilar3` no segundo 1.

**Diálogos-chave:**
- **Hades** (início): *"Passei eras erguendo muralhas no submundo e agora derrubo as de meu pai. Traga suas catapultas, arconte."* / *"I spent ages raising walls in the underworld, and now I tear down my father's. Bring your catapults, archon."*
- **Lícaon** (Portão cai): *"Sob Cronos não havia velhice, nem fome, nem arado. Vocês lutam para manter a dor."* / *"Under Cronus there was no old age, no hunger, no plough. You fight to keep the pain."*

**Outro (a peripécia):**
- PT: *"O último Pilar desaba e o chão do Ótris se abre como uma boca. Os Pilares não guardavam o Culto: acorrentavam o Tempo. Cronos se ergue inteiro, pela primeira vez desde a primeira guerra, e olha para o sul, para Argos. A Pítia não diz nada. Não precisa."*
- EN: *"The last Pillar collapses and the floor of Othrys opens like a mouth. The Pillars did not guard the Cult: they chained Time. Cronus rises whole, for the first time since the first war, and looks south, toward Argos. The Pythia says nothing. She does not need to."*

---

### 5.8 M11 · Argos em Chamas / *Argos in Flames* 🔥

- **Subtítulo:** Ato III · Missão 11 · Êxodo / *Act III · Mission 11 · Exodus*
- **Mecânica em destaque:**
  - **abandonar a cidade de propósito** e levar o povo às naus;
  - **poderes divinos um a um**: Zeus não tem exército para dar, só a ira. Cada onda foi desenhada para um poder: Maldição, Tempestade de Raios, Trégua e Restauração.
- **Mecânica cobrada:** **proteger o líder** (o arconte em pessoa, no estilo regicídio).
- **Objetivo-tipo:** regicídio (proteger o arconte) + escolta em massa. **Tempo:** 18 min (cronômetro fixo).
- **Lacunas:** funciona hoje. [G8] troca "Rei" por "Arconte", [G9] deixa Cronos imbatível aqui e [G6] `remove` faz o embarque sem animação de morte.

**Jogadores:**

| # | Nome | Deus | Controle | Time | Kit |
|---|---|---|---|---|---|
| 0 | Argos | Zeus | humano | 0 | não (cidade inteira no mapa) |
| 1 | Culto de Cronos | Hades | IA difícil | 1 | sim |
| 2 | Cronos | Hades | marionete | 1 | não |

**Idade e recursos:** Mítica. 800 / 800 / 800 / 100 favor. Pouco: não há tempo para uma economia.

**Mapa `fixo` "Argólida em Chamas", 128×128:**
- **Centro-norte, Argos inteira** (`start` 0 = [64,40]). Entidades:
  - edifícios: CC, Templo, Academia, Quartel, Estábulo, Mercado, Fortaleza, 10 Casas, muralhas e 2 Torres;
  - unidades: 40 cidadãos, 8 hoplitas, 6 arqueiros cretenses e 4 hipeus.
- **Sudoeste, o porto de Náuplia.** As **naus** são um Mercado do jogador 0 no cais, com `tag` `naus`, em [18,112], sobre areia junto à água funda. Náuplia fica a cerca de 80 tiles da cidade.
- **Meio do caminho, Tirinto em ruínas:** uma Torre do jogador 0 em [40,80], ponto de parada.
- **Nordeste, o Culto** (`start` 1 = [116,12]). **Norte, a descida de Cronos** (`start` 2 = [64,4]).
- `relics: false`.

**Briefing:**
1. PT: *"Cronos desceu do Ótris. Onde ele passa, as colheitas apodrecem e os homens envelhecem num dia. Ele vem para Argos, a cidade que acendeu o fogo dos Titãs."*
   EN: *"Cronus has come down from Othrys. Where he walks, harvests rot and men grow old in a day. He is coming for Argos, the city that lit the Titans' fire."*
2. PT: *"Não há como defender a cidade. Leve o povo às naus de Náuplia. Trinta vidas salvas valem mais que mil pedras. E o arconte não pode cair."*
   EN: *"There is no defending the city. Lead the people to the ships at Nauplia. Thirty lives saved are worth more than a thousand stones. And the archon must not fall."*

**Objetivos:**

| id | Tipo | Texto PT / EN |
|---|---|---|
| `exodo` | principal | Leve 30 cidadãos às naus de Náuplia / *Bring 30 villagers to the ships at Nauplia* |
| `arconte` | principal | O arconte deve sobreviver / *The archon must survive* |
| `retaguarda` | secundário | O Templo de Zeus resiste até os 12 minutos / *The Temple of Zeus holds until minute 12* |
| `chama` | secreto | Salve a chama de Héstia (o sacerdote chega às naus) / *Save the flame of Hestia (the priest reaches the ships)* |

```json
{
  "config": {
    "players": [
      { "name": "Argos", "god": "zeus", "isAI": false, "difficulty": "normal", "team": 0 },
      { "name": "Culto de Cronos", "god": "hades", "isAI": true, "difficulty": "hard", "team": 1 },
      { "name": "Cronos", "god": "hades", "isAI": false, "difficulty": "normal", "team": 1 }
    ],
    "startingAge": 3,
    "startingResources": { "food": 800, "wood": 800, "gold": 800, "favor": 100 },
    "startKit": [false, true, false]
  },
  "setup": [
    { "do": "spawn", "player": 0, "units": ["basileus"], "at": { "tc": 0, "dy": 4 }, "tag": "arconte" },
    { "do": "spawn", "player": 0, "units": ["villager"], "at": { "tc": 0, "dx": 3, "dy": 4 }, "tag": "sacerdote" }
  ],
  "objectives": [
    { "id": "exodo", "text": { "pt": "Leve 30 cidadãos às naus de Náuplia", "en": "Bring 30 villagers to the ships at Nauplia" },
      "done": { "var": "embarcados", "gte": 30 } },
    { "id": "arconte", "text": { "pt": "O arconte deve sobreviver", "en": "The archon must survive" },
      "done": { "var": "embarcados", "gte": 30 },
      "failed": { "entity": { "tag": "arconte" }, "exists": false } },
    { "id": "retaguarda", "optional": true, "text": { "pt": "O Templo de Zeus resiste até os 12 minutos", "en": "The Temple of Zeus holds until minute 12" },
      "done": { "all": [ { "time": { "gte": 720 } }, { "buildings": { "player": 0, "type": "temple" }, "gte": 1 } ] },
      "failed": { "all": [ { "time": { "gte": 5 } }, { "buildings": { "player": 0, "type": "temple" }, "eq": 0 } ] } },
    { "id": "chama", "optional": true, "hidden": true, "text": { "pt": "Salve a chama de Héstia (o sacerdote chega às naus)", "en": "Save the flame of Hestia (the priest reaches the ships)" } }
  ],
  "triggers": [
    { "id": "nau1", "when": { "time": { "gte": 240 } }, "then": [
      { "do": "addVar", "name": "capacidade", "delta": 10 },
      { "do": "say", "speaker": { "pt": "Batedor", "en": "Scout" }, "icon": "⛵",
        "text": { "pt": "A primeira nau de Micenas atracou em Náuplia! Dez lugares.", "en": "The first ship from Mycenae has docked at Nauplia! Ten places." } } ] },
    { "id": "nau2", "when": { "time": { "gte": 540 } }, "then": [ { "do": "addVar", "name": "capacidade", "delta": 10 } ] },
    { "id": "nau3", "when": { "time": { "gte": 780 } }, "then": [ { "do": "addVar", "name": "capacidade", "delta": 10 } ] },
    { "id": "chama_salva", "when": { "units": { "player": 0, "tag": "sacerdote", "near": { "point": { "entity": { "tag": "naus" } }, "radius": 4 } }, "gte": 1 }, "then": [
      { "do": "objective", "id": "chama", "status": "done" } ] },
    { "id": "embarque", "repeat": true, "when": { "all": [
        { "every": { "seconds": 2 } },
        { "var": "embarcados", "lt": { "var": "capacidade" } },
        { "units": { "player": 0, "type": "villager", "near": { "point": { "entity": { "tag": "naus" } }, "radius": 4 } }, "gte": 1 } ] }, "then": [
      { "do": "kill", "entity": { "player": 0, "type": "villager", "pick": "nearest", "near": { "entity": { "tag": "naus" } } } },
      { "do": "addVar", "name": "embarcados", "delta": 1 } ] },
    { "id": "ira1", "when": { "time": { "gte": 120 } }, "then": [
      { "do": "set", "player": 0, "minorGods": ["aphrodite"] },
      { "do": "raid", "player": 1, "units": ["hoplite", "hoplite", "hoplite", "hoplite", "hoplite", "hoplite", "hoplite", "hoplite"], "target": { "tc": 0 }, "angle": 7 },
      { "do": "say", "speaker": "Zeus", "icon": "⚡",
        "text": { "pt": "Não tenho exército para te dar, arconte. Tenho minha ira. Afrodite te empresta a Maldição: um muro de lanças vira uma vara de porcos.", "en": "I have no army to give you, archon. I have my wrath. Aphrodite lends you her Curse: a wall of spears becomes a herd of swine." } } ] },
    { "id": "ira2", "when": { "time": { "gte": 330 } }, "then": [
      { "do": "set", "player": 0, "minorGods": ["hera"] },
      { "do": "raid", "player": 1, "units": ["toxotes", "toxotes", "toxotes", "toxotes", "cretan_archer", "cretan_archer", "cretan_archer", "cretan_archer"], "target": { "entity": { "tag": "arconte" } }, "angle": 6 },
      { "do": "say", "speaker": "Hera", "icon": "👑",
        "text": { "pt": "Arqueiros amontoados sob o céu aberto. Minha Tempestade de Raios os espera.", "en": "Archers huddled under the open sky. My Lightning Storm awaits them." } } ] },
    { "id": "ira3", "when": { "time": { "gte": 570 } }, "then": [
      { "do": "set", "player": 0, "minorGods": ["hermes"] },
      { "do": "raid", "player": 1, "units": ["hetairoi", "hetairoi", "hetairoi", "hippeus", "hippeus", "hippeus"], "target": { "entity": { "tag": "naus" } }, "angle": 1 },
      { "do": "say", "speaker": { "pt": "Oráculo de Delfos", "en": "Oracle of Delphi" }, "icon": "🔮",
        "text": { "pt": "Cavalaria rumo ao porto! Hermes concede a Trégua: trinta segundos em que ninguém mata. Use-os para correr.", "en": "Cavalry heading for the harbor! Hermes grants the Truce: thirty seconds in which no one kills. Use them to run." } } ] },
    { "id": "prometeu", "when": { "time": { "gte": 660 } }, "then": [
      { "do": "spawn", "player": 0, "units": ["prometheus"], "at": { "tc": 0, "dy": -8 }, "tag": "prometeu" },
      { "do": "say", "speaker": { "pt": "Prometeu", "en": "Prometheus" }, "icon": "🔥",
        "text": { "pt": "Fui eu quem lhes deu o fogo. Deixem-me ao menos cobrir a retirada.", "en": "It was I who gave you fire. Let me at least cover your retreat." } } ] },
    { "id": "cronos", "when": { "time": { "gte": 720 } }, "then": [
      { "do": "spawn", "player": 2, "units": ["cronus"], "at": { "start": 2 }, "tag": "cronos" },
      { "do": "order", "units": { "tag": "cronos" }, "order": { "type": "attackMove", "at": { "tc": 0 } } },
      { "do": "order", "units": { "tag": "prometeu" }, "order": { "type": "attack", "target": { "tag": "cronos" } } },
      { "do": "set", "player": 0, "minorGods": ["athena"] },
      { "do": "say", "speaker": { "pt": "Cronos", "en": "Cronus" }, "icon": "⏳",
        "text": { "pt": "Devorei meus filhos para que não me destronassem. O que acha que farei com os filhos deles?", "en": "I devoured my children so they would not dethrone me. What do you think I will do to theirs?" } } ] },
    { "id": "prometeu_cai", "when": { "all": [ { "fired": "prometeu" }, { "entity": { "tag": "prometeu" }, "exists": false } ] }, "then": [
      { "do": "say", "speaker": { "pt": "Oráculo de Delfos", "en": "Oracle of Delphi" }, "icon": "🔮",
        "text": { "pt": "O Tempo arrasta Prometeu de volta ao Tártaro. Não olhe para trás, arconte.", "en": "Time drags Prometheus back to Tartarus. Don't look back, archon." } } ] }
  ],
  "victory": { "var": "embarcados", "gte": 30 },
  "defeat": { "any": [
    { "entity": { "tag": "arconte" }, "exists": false },
    { "all": [ { "time": { "gte": 1080 } }, { "var": "embarcados", "lt": 30 } ] }
  ] },
  "hud": [
    { "type": "countdown", "seconds": 1080, "while": { "var": "embarcados", "lt": 30 }, "label": { "pt": "⛵ As naus zarpam em", "en": "⛵ The ships sail in" } }
  ]
}
```

**Notas de design:**
- **A queda do CC não é derrota.** As ondas do meio para o fim miram as **naus** e o **arconte**. Um `raid` contra `{ "tc": 0 }` depois do CC cair simplesmente não acontece.
- **As naus chegam em três levas** (4, 9 e 13 min, 10 lugares cada). Assim o êxodo não termina antes do clímax: com Prometeu aos 11 min e Cronos aos 12, o mais cedo possível é cerca de 13 min.
- O embarque retira 1 cidadão a cada 2 s, como uma fila no cais. `chama_salva` vem **antes** de `embarque` na lista, então o sacerdote conta antes de ser embarcado. Com `kill` (dono Zeus, sem autor) **não nascem Sombras**. [G6] `remove` apagaria até a animação de morte.
- **Risco de narrativa:** se o jogador matar Cronos aqui, a m12 perde força. Hoje há três defesas:
  1. Cronos surge a 6 minutos do fim;
  2. Prometeu (aliado) é ordenado a lutar com ele e absorve o dano;
  3. o `outro` funciona nos dois casos ("Cronos recua ferido ao Ótris").

  A solução definitiva é [G9] (`hpFloor`).

**Derrota:** o arconte morre, ou o tempo acaba com menos de 30 embarcados.

**Dificuldade:**
- **Hoje:** as ondas escalam e o Culto joga como IA Muito difícil no Difícil.
- **Com [G3]:** meta de 20, 30 ou 40 (com 4 naus no Difícil), e Cronos aos 14, 12 ou 10 min.

**Diálogos-chave:**
- **Pítia** (início): *"Eu disse, arconte. A cidade que acendeu o fogo dos Titãs arde nele. Não me peça outra profecia; peça navios."* / *"I told you, archon. The city that lit the Titans' fire burns in it. Don't ask me for another prophecy; ask for ships."*
- **Anciã de Argos** (aos 60 s): *"Leve as crianças primeiro. Os velhos já viram Argos. Basta."* / *"Take the children first. The old have seen Argos. That is enough."*

**Outro:**
- PT: *"As naus deixam Náuplia com Argos em chamas no horizonte. Cronos recua ao Ótris para devorar o que restou da Idade de Ouro e crescer. Mas no convés, um velho sacerdote protege com as mãos uma brasa da lareira comum. Zeus chama os irmãos: é hora da segunda Titanomaquia."*
- EN: *"The ships leave Nauplia with Argos burning on the horizon. Cronus withdraws to Othrys to devour what is left of the Golden Age and grow. But on deck, an old priest shields an ember from the common hearth with his hands. Zeus summons his brothers: it is time for the second Titanomachy."*

---

### 5.9 M12 · O Fim da Idade de Ouro / *The End of the Golden Age* ⏳ *(final)*

- **Subtítulo:** Ato III · Missão 12 · Titanomaquia / *Act III · Mission 12 · Titanomachy*
- **Mecânica em destaque:** **grande batalha de 3 contra 1 com chefe em fases.** Primeiro os 3 Altares da Foice, depois Cronos. As ferramentas combinam:
  - o Raio (metade da vida de um Titã);
  - Perseu (×2,5 contra Titãs);
  - Prometeu de volta pelo Portal;
  - os aliados Hades e Poseidon.
- **Mecânica cobrada:** tudo.
- **Objetivo-tipo:** cerco + chefe. **Tempo:** 35–40 min.
- **Lacunas:** funciona hoje. [G6] `maxAge` impede um 2º Cronos da IA, e [G9] permite fases de vida de Cronos.

**Jogadores:**

| # | Nome | Deus | Controle | Time | Kit |
|---|---|---|---|---|---|
| 0 | Exilados de Argos | Zeus | humano | 0 | não (Nova Argos no mapa) |
| 1 | Hades | Hades | IA normal | 0 | sim |
| 2 | Poseidon | Poseidon | IA normal (a reconciliação) | 0 | sim |
| 3 | Culto de Cronos | Hades | IA difícil | 1 | sim |

**Idade e recursos:** Mítica, com 5 pesquisas (`civic1`, `civic2`, `science1`, `military1`, `commerce1`). Para os Titãs faltam: concluir a Fortaleza, 1 pesquisa e o custo da Idade. 1500 / 1500 / 1200 / 200 favor / 800 conhecimento.

**Mapa `fixo` "Planície da Tessália", 144×144:**
- **Noroeste, o Olimpo** (`start` 0 = [24,24]), com a **Nova Argos**: CC, Templo, Academia, **Fortaleza incompleta** (`complete: false`), 15 cidadãos, Perseu, Odisseu e Héracles.
- **Nordeste, o Monte Ótris** (`start` 3 = [120,24]) e o **Trono de Cronos**, uma Fortaleza do jogador 3 com `tag` `trono`, em [112,30].
  - **O trono não é `titan_gate`.** Um Portal completo invoca o Titã do dono na hora.
- **Sudoeste, a caverna de Hades** (`start` 1 = [24,120]). **Sudeste, a costa de Poseidon** (`start` 2 = [120,120]).
- **Centro, o Campo da Titanomaquia**, com os **3 Altares da Foice** (Templos do jogador 3 com `tag` `foice1` [72,60], `foice2` [56,86], `foice3` [90,86]).
- `relics: false`.

**Briefing:**
1. PT: *"Pela primeira vez desde a primeira guerra, os três filhos de Cronos marcham juntos. Zeus do Olimpo, Hades do fundo da terra, Poseidon do mar, que engoliu o rancor. E com eles, os exilados de uma cidade que já não existe."*
   EN: *"For the first time since the first war, the three sons of Cronus march together. Zeus from Olympus, Hades from the depths of the earth, Poseidon from the sea, his grudge swallowed. And with them, the exiles of a city that no longer exists."*
2. PT: *"Cronos se alimenta dos três Altares da Foice na planície. Derrube-os e ele terá de sair do trono. Depois, faça o que nenhum mortal fez: derrote o Tempo."*
   EN: *"Cronus feeds on the three Altars of the Sickle on the plain. Bring them down and he must leave his throne. Then do what no mortal has done: defeat Time."*

**Objetivos:**

| id | Tipo | Texto PT / EN |
|---|---|---|
| `foices` | principal | Destrua os três Altares da Foice / *Destroy the three Altars of the Sickle* |
| `cronos` | principal, oculto até surgir | Derrote Cronos / *Defeat Cronus* |
| `irmaos` | secundário | Proteja Hades e Poseidon / *Protect Hades and Poseidon* |
| `prometeu` | secundário | Chame Prometeu de volta pelo Portal / *Call Prometheus back through the Gate* |
| `perseu` | secreto | Derrote Cronos com Perseu vivo / *Defeat Cronus with Perseus alive* |

```json
{
  "config": {
    "players": [
      { "name": "Exilados de Argos", "god": "zeus", "isAI": false, "difficulty": "normal", "team": 0 },
      { "name": "Hades", "god": "hades", "isAI": true, "difficulty": "normal", "team": 0 },
      { "name": "Poseidon", "god": "poseidon", "isAI": true, "difficulty": "normal", "team": 0 },
      { "name": "Culto de Cronos", "god": "hades", "isAI": true, "difficulty": "hard", "team": 1 }
    ],
    "startingAge": 3,
    "startingResources": { "food": 1500, "wood": 1500, "gold": 1200, "favor": 200, "knowledge": 800 },
    "startKit": [false, true, true, true]
  },
  "setup": [
    { "do": "set", "player": 0, "minorGods": ["athena", "apollo", "hera"], "techs": ["civic1", "civic2", "science1", "military1", "commerce1"] },
    { "do": "spawn", "player": 0, "units": ["perseus"], "at": { "tc": 0, "dy": 4 }, "tag": "perseu" }
  ],
  "objectives": [
    { "id": "foices", "text": { "pt": "Destrua os três Altares da Foice", "en": "Destroy the three Altars of the Sickle" },
      "done": { "all": [ { "entity": { "tag": "foice1" }, "exists": false }, { "entity": { "tag": "foice2" }, "exists": false }, { "entity": { "tag": "foice3" }, "exists": false } ] } },
    { "id": "cronos", "hidden": true, "text": { "pt": "Derrote Cronos", "en": "Defeat Cronus" },
      "done": { "all": [ { "fired": "cronos_surge" }, { "entity": { "tag": "cronos" }, "exists": false } ] } },
    { "id": "irmaos", "optional": true, "text": { "pt": "Proteja Hades e Poseidon", "en": "Protect Hades and Poseidon" },
      "done": { "objective": "cronos", "is": "done" },
      "failed": { "all": [ { "time": { "gte": 5 } }, { "any": [ { "buildings": { "player": 1, "type": "town_center" }, "eq": 0 }, { "buildings": { "player": 2, "type": "town_center" }, "eq": 0 } ] } ] } },
    { "id": "prometeu", "optional": true, "text": { "pt": "Chame Prometeu de volta pelo Portal", "en": "Call Prometheus back through the Gate" },
      "done": { "units": { "player": 0, "type": "prometheus" }, "gte": 1 } },
    { "id": "perseu", "optional": true, "hidden": true, "text": { "pt": "Derrote Cronos com Perseu vivo", "en": "Defeat Cronus with Perseus alive" } }
  ],
  "triggers": [
    { "id": "abertura", "when": { "time": { "gte": 1 } }, "then": [
      { "do": "say", "speaker": "Zeus", "icon": "⚡",
        "text": { "pt": "Irmãos. Da última vez que estivemos juntos, estávamos dentro da barriga dele.", "en": "Brothers. The last time we were all together, we were inside his belly." } },
      { "do": "say", "speaker": "Hades", "icon": "💀", "text": { "pt": "Não se acostume.", "en": "Don't get used to it." } },
      { "do": "say", "speaker": "Poseidon", "icon": "🔱",
        "text": { "pt": "Argos me desafiou por um homem de Ítaca. Cronos me engoliu inteiro. Escolho meu rancor menor.", "en": "Argos defied me for a man from Ithaca. Cronus swallowed me whole. I choose my lesser grudge." } } ] },
    { "id": "devorar", "repeat": true, "when": { "all": [ { "every": { "seconds": 120, "after": 240 } }, { "not": { "objective": "foices", "is": "done" } } ] }, "then": [
      { "do": "forEachPlayer", "team": 0, "then": [
        { "do": "raid", "player": 3, "units": ["hypaspist", "hypaspist", "hypaspist", "medusa", "cyclops"], "target": { "tc": "$p" }, "angle": { "base": 1, "perIndex": 3 } } ] } ] },
    { "id": "cronos_surge", "when": { "any": [ { "objective": "foices", "is": "done" }, { "time": { "gte": 1500 } } ] }, "then": [
      { "do": "spawn", "player": 3, "units": ["cronus"], "at": { "entity": { "tag": "trono" }, "dy": 4 }, "tag": "cronos" },
      { "do": "order", "units": { "tag": "cronos" }, "order": { "type": "attackMove", "at": { "tc": 0 } } },
      { "do": "reveal", "id": "cronos" },
      { "do": "say", "speaker": { "pt": "Cronos", "en": "Cronus" }, "icon": "⏳",
        "text": { "pt": "Vocês chamam de vitória o que é só espera. Eu SOU a espera.", "en": "You call victory what is only waiting. I AM the waiting." } } ] },
    { "id": "perseu_premio", "when": { "all": [ { "objective": "cronos", "is": "done" }, { "entity": { "tag": "perseu" }, "exists": true } ] }, "then": [
      { "do": "objective", "id": "perseu", "status": "done" } ] },
    { "id": "fim", "when": { "objective": "cronos", "is": "done" }, "then": [
      { "do": "say", "speaker": { "pt": "Oráculo de Delfos", "en": "Oracle of Delphi" }, "icon": "🔮",
        "text": { "pt": "Os deuses venceram. Os homens sobreviveram. É tudo o que uma tragédia concede.", "en": "The gods have won. Mankind has survived. That is all a tragedy grants." } } ] }
  ],
  "victory": { "objective": "cronos", "is": "done" },
  "defeat": { "all": [ { "time": { "gte": 5 } }, { "buildings": { "player": 0, "type": "town_center" }, "eq": 0 }, { "buildings": { "player": 0, "type": "fortress", "complete": true }, "eq": 0 } ] }
}
```

**Notas de design:**
- O `devorar` usa `forEachPlayer` e ataca **os três acampamentos aliados** a cada disparo, de ângulos diferentes. É intencional: Cronos devora tudo.
- **O prazo de 25 min** (`time` ≥ 1500) garante o clímax mesmo para quem se atrasa com os altares. "O tempo não espera."
- **Continuidade:** Odisseu e Héracles vêm do mapa com uma tag cada (`odisseu`, `heracles`). Perseu vem do `setup`. Jasão (saiu na m8) e Aquiles (morreu na m7) **não aparecem**.
- **Risco:** o Culto em IA difícil na Mítica pode chegar aos Titãs e erguer um Portal próprio, o que criaria um 2º Cronos. Até existir [G6] `maxAge`, o Culto começa **sem** pesquisas da Academia (com 6 pesquisas e uma Fortaleza a Idade dos Titãs fica fora de alcance em 25 min) e o teste confere se existe no máximo 1 `cronus`.

**Derrota:** o jogador perde o CC **e** fica sem Fortaleza completa.

**Dificuldade:**
- **Hoje:** o `devorar` escala e o Culto joga como IA Muito difícil no Difícil.
- **Com [G3]:** prazo de Cronos de 30, 25 ou 20 min. No Difícil, Cronos surge com 2 Colossos.
- **Com [G9]:** a cada 1/3 de vida perdida, Cronos invoca uma onda ("fases").

**Diálogos-chave:**
- **Héracles** (1º altar): *"Uma foice gigante? Já enfrentei coisa pior. Quer dizer... não. Mas vamos lá."* / *"A giant sickle? I've faced worse. Well... no. But let's go."*
- **Odisseu** (aos 300 s): *"Três deuses, um Titã e nenhum plano. Deixem o plano comigo."* / *"Three gods, one Titan and no plan. Leave the plan to me."*
- **Perseu** (Cronos surge): *"Minha espada foi feita para isto. Abram caminho."* / *"My sword was made for this. Clear the way."*
- **Zeus** (Cronos cai): *"Pai. Você me engoliu uma vez. Hoje o mundo inteiro te cospe de volta ao Tártaro."* / *"Father. You swallowed me once. Today the whole world spits you back into Tartarus."*

**Outro (epílogo da campanha):**
- PT: *"Cronos voltou ao Tártaro, acorrentado pelos Ciclopes com bronze novo. No Olimpo, Zeus ofereceu ao arconte um lugar entre as estrelas. O arconte recusou. Voltou às cinzas de Argos e, com a brasa que um velho sacerdote salvou do fogo, acendeu a nova lareira comum. Os deuses venceram. Os homens sobreviveram. É tudo o que uma tragédia concede."*
- EN: *"Cronus has returned to Tartarus, chained by the Cyclopes in new bronze. On Olympus, Zeus offered the archon a place among the stars. The archon refused. He went back to the ashes of Argos and, with the ember an old priest saved from the fire, lit the new common hearth. The gods have won. Mankind has survived. That is all a tragedy grants."*

Se a chama de Héstia não foi salva na m11, o texto continua coerente: "uma brasa" pode ter vindo de Prometeu. Um *outro* condicional pede [G15].

---

## 6. Lacunas do motor (priorizadas)

As lacunas foram conferidas no código atual. A ordem é: impacto nas missões ÷ esforço. Nenhuma **bloqueia** as missões m4–m9.

| # | Lacuna | Onde está hoje | Proposta | Esforço | Missões que ganham | Prioridade |
|---|---|---|---|---|---|---|
| **G0** ✅ | **Registro de missões JSON na aba Campanha** (infraestrutura, não gramática) | **Feito.** `src/core/scenario/campaign.ts`: `CAMPAIGN: { act, id, source: 'ts' \| 'json', file?, prologue? }[]` (m1–m3 TS no Ato I com selo "Prólogo"); `campaignMissions()`, `campaignMission(id)` (JSON compilado por `compileScenarioCached`, cache por idioma), `nextCampaignMission(id)`, `isCampaignMission(id)`, `missionConfig(def, diff)`; `SCENARIOS` ficou como alias do prólogo. Plano oficial (12 ids e atos) em `official.ts` (`CAMPAIGN_PLAN`); `RESERVED_SCENARIO_IDS` = `horde` + os 12 ids | Menu, HUD (`isOfficialScenario`), `main.startMission`/`onNextMission` e o runner leem o registro. Aba Campanha com cabeçalhos "Ato I · A Sombra dos Titãs" / "Ato II · A Maré de Poseidon" / "Ato III · A Queda de Cronos" (PT/EN), desbloqueio sequencial e 🔥 do Difícil. Conquistas geradas em `achievements.ts`: uma por missão JSON registrada (id = id da missão), `campaign_act1..3` e `campaign_all_hard`; `campaign_prologue` continua. **Registrar uma missão:** criar `missions/<id>.scenario.json`, importar em `campaign.ts`, acrescentar `{ act, id, source: 'json', file }` em `CAMPAIGN` e o roteiro em `MISSION_SCRIPTS` (`testing.ts`) | — | **todas** | **feita** |
| **G1** ✅ | Objetivo oculto nunca é avaliado | **Feito.** `runner.ts` avalia também os ocultos; ao mudar de estado, `ctx.objective` os revela | Segredo = objetivo `hidden` com `done`/`failed` direto (sem gatilho espelho). Um oculto que só deve contar depois de revelado leva a guarda `{ "fired": "<gatilho que o revela>" }` no `all` (m1 `camp`, m2 `counter` e m3 `cronus` ganharam essa guarda: comportamento visível idêntico) | — | todas | **feita** |
| **G2** ✅ | Fim de partida em cenário | **Feito.** `victory.ts` separa `eliminatePlayers` (sem edifícios que contam e sem cidadãos — `hasStartKit` respeitado —, ou Regicídio sem rei → `alive=false`, eventos de derrota, unidades somem) de `declareWinner`; em cenário, `game.ts` chama `eliminateInScenario` (sem vencedor global) antes do runner. Marionetes (sem IA e fora do time local) nunca são eliminadas | Derrota implícita: todos os humanos do time local com `alive=false`. Condições `{ "koth": { "team": 0 }, "gte": 120 }` (segundos de `state.koth` quando o time é T, senão 0), `{ "wonderHeld": { "player": 0 }, "gte": 360 }` (segundos desde a conclusão da Maravilha mais antiga de pé; 0 sem Maravilha), `{ "kingAlive": 0 }` e `{ "alive": 0 }`. A `DERROTA_CC` continua útil quando a derrota deve vir antes da eliminação | — | m6, m10, m11; m1 perde ao perder tudo | **feita** |
| **G3** ✅ | Condição de dificuldade | **Feito.** `{ "difficulty": "easy" \| "normal" \| "hard" \| [...] }`, `Value { "stat": "difficulty" }` (0/1/2, sem `player`) e `spawn { "scaled": true }` (mesmo `scaledGroup` do `raid`: Fácil ≈ 2/3, Difícil ≈ 1,5×). `config.campaignDifficulty` ausente = normal. IAs aliadas do jogador não mudam de nível (`withCampaignDifficulty`) | — | — | as variações "com [G3]" de todas | **feita** |
| **G4** | HUD e tempo relativo | `progress` só lê a obra de um edifício; `countdown` é absoluto | `progress { "var", "max" }`, `countdown { "fromVar" }` e `Value { "time": true }` para marcar instantes com `setVar` | 4–6 h | m6 (guarda), m10 (altar), m11 (embarcados) | média-alta |
| **G5** ✅ | Tag de grupo em entidades do mapa | **Feito.** Entidades do mapa com a mesma tag acumulam `vars['#tag[k]']` (ordem do arquivo) e `vars['#tag']` = primeiro id, como `spawn`/`place` | `UnitFilter`/`BuildingFilter { "tag" }` contam o grupo inteiro; `EntityRef { "tag", "pick": "first" \| "alive" \| "nearest", "near"? }` (`alive` = primeiro vivo do grupo; `nearest` exige `near`). Para "o grupo todo caiu": `{ "entity": { "tag": "g", "pick": "alive" }, "exists": false }` | — | libera grupos desenhados no editor | **feita** |
| **G6** | `remove`, `order garrison` e `maxAge`/`forbid` | `kill` gera morte; `order` sem guarnecer (o comando existe em `commands.ts`); nada trava a Idade | `{ "do": "remove", "entity" }` (usa `removeUnitNow`); `order { "type": "garrison" \| "ungarrison" }`; `config.maxAge` e `config.forbid { buildings, units, techs }` conferidos em `commands.ts` e na IA | 4 h | m11 (embarque limpo), m12 e m4/m8 (sem Titã duplicado) | média |
| **G7** ✅ | Lint de cenário (ferramenta) | **Feito.** `validateScenario(file, { warnings: true })` / `lintScenario(file)`: `ScenarioIssue.level` opcional (`'error'` padrão, `'warn'` no lint); `scenarioErrors(issues)` filtra só os erros | Avisos: tag criada só por gatilho usada numa condição que vale com o grupo ausente, sem `{ "fired" }` no mesmo `all`; objetivo `hidden` sem `done`/`failed` e sem gatilho que o revele; fala sem `en` ou com mais de 200 caracteres. O modal Gatilhos do editor mostra os avisos; `tests/missions.test.ts` exige lint limpo nas missões do registro | — | todas | **feita** |
| **G8** | Nome exibido por entidade | O `basileus` aparece como "Rei"; o Lícaon-lobo como "Leão de Nemeia" | `spawn`/`place { "name": { "pt", "en" } }` guardado na entidade e exibido pelo HUD; nomes de facção `{ pt, en }` | 3 h | m10, m11 | média |
| **G9** | Vida de chefe | Sem condição `hp` nem ações de vida | `{ "entity": …, "hp": { "lte": 0.5 } }` (fração), `{ "do": "hpFloor", "entity", "value": 0.3 }`, `damage` e `heal` | 4–6 h | m11 (Cronos imbatível), m12 (fases) | média |
| **G10** | Relíquias em cenário | Posições sorteadas; sem condição | `map.relics: [x,y][]` (além de boolean) e `Value { "stat": "relics" }` (usa `relicsOf`) | 3–4 h | m9 (secundário) | baixa-média |
| **G11** | Poderes específicos | Só `set minorGods` concede poder (1 por deus) | `set { "powers": { "add", "reset" } }` e `{ "powerUsed": { "player", "id" } }` | 2–3 h | m11 (2º Raio), variações | baixa |
| **G12** | Habilidade de herói por roteiro | Marionete não usa Q | `{ "do": "ability", "unit": { "tag": … } }` | 2 h | m7 (Fúria no Difícil) | baixa |
| **G13** | Autoria de abate | Só `exists` | `{ "kills": { "player", "type", "by": { "tag" } }, "gte": 1 }` | 4 h | m12 ("Perseu dá o golpe final") | baixa |
| **G14** | Câmera, ping, retrato e bioma | `say` só tem emoji; não há ping, foco nem paleta de Submundo | `ping`, `camera`, `revealArea` (eventos, sem estado) e `say { "portrait" }`; paleta por bioma (Fase 2) | 6–8 h + arte | m7, m8, m9 | baixa (Fase 2) |
| **G15** | Estrutura de campanha | Não há `outro` condicional nem marcas entre missões | `outro: [{ "when", "text" }]` e `aoe_campaign.flags` lidas por `{ "flag": … }` | 6 h | m8 (Jasão), m12 (chama de Héstia) | baixa (pós-EA) |
| **G16** | Diretivas de IA | `order` em unidade de IA pode ser desfeito; não há "defender/atacar alvo"; marionete não recua | `{ "do": "ai", "player", "mode": "defend" \| "attack" \| "idle", "target" }` e uma tag "roteirizada" que a IA ignora | 8 h | m6, m7, m8 | baixa |
| **G17** | Contador de `repeat` | Disparos `repeat` não entram em `fired` | `repeat: { "max": N }` e `vars['@id']` automático | 1–2 h | ondas fixas ficam mais curtas | baixa |

**Correções técnicas no prólogo** (bugs, não roteiro) — ✅ **feitas**:
- a) `m3_portal`: os "Aliados de Poseidon" não tinham `team` e eram **hostis** a todos (`team: pc.team ?? i`). Agora Argos e os aliados têm `team: 0` (o Culto, `team: 1`); a IA aliada coopera (teste em `tests/scenario-gaps.test.ts`) e não muda de nível com a dificuldade da campanha.
- b) `m1_despertar`: não tinha `defeat` e quem perdia tudo ficava numa partida sem fim. Com [G2], o jogador sem edifícios e sem cidadãos é eliminado e a missão termina em derrota, sem mexer no texto.
- O texto e o roteiro das três missões continuam idênticos.

**Missões que não dependem de nenhuma lacuna** (vão primeiro para a produção): **m4, m5, m6, m7, m8 e m9**. Todas usam só a gramática atual, com gatilho espelho para segredos e contadores por segundo. As três seguintes funcionam hoje com paliativo, mas convém esperar as lacunas indicadas:
- **m10:** G2 + G4;
- **m11:** G8 + G9 + G6;
- **m12:** G6 + G9.

---

## 7. Ordem de produção e testes automáticos

### 7.1 Cronograma (2 missões por semana)

| Semana | Missões | Motor em paralelo | Entregável |
|---|---|---|---|
| 0 (preparação) | — | **G0** registro e atos; harness de testes (§7.2); **G1**; **G7** lint | Aba Campanha com "Ato I · Prólogo" e espaço para as missões novas |
| 1 | **m6** (mapa gerado, a mais barata) + **m4** (1º mapa fixo) | **G3** dificuldade; **G5** tags de grupo | Ato I completo (m1–m4) |
| 2 | **m5** + **m7** (mapa gerado) | **G2** fim de partida e `koth`/`wonderHeld` | Ato II pela metade |
| 3 | **m8** + revisão do EA (balanceamento com `npm run balance`, playtest do dono) | **G4** HUD | **EA pronto: m1–m8** |
| 4 | **m9** (mapa gerado) + **m10** | **G8** nomes; **G6** remove/maxAge | Ato III pela metade |
| 5 | **m11** + **m12** | **G9** vida de chefe | Campanha completa |

- **Mapas fixos:** 6 no total, desenhados no editor (Etapa 4 do `docs/EDITOR.md`). Cada um passa por `validateMap` sem erros e por `npm run map:check`.
- **Textos:** ~250 falas `{ pt, en }` (as fichas trazem as principais).
- **Ilustrações das intros:** ficam para a Fase 2.7.

### 7.2 Testes por missão (Fase 3.5)

Os três casos "medidos no rascunho" da tabela abaixo rodaram os blocos JSON deste documento nos mapas gerados reais (sementes 6606, 7707 e 9909). Os demais usam mapas fixos que ainda não existem, e seus valores são estimativas.

Cada missão ganha 4 verificações, rodadas por `npx tsx scripts/missions.ts` e por `tests/missions.test.ts` (vitest), com **semente fixa** e nas **três dificuldades** (`campaignDifficulty` = `easy`/`normal`/`hard`):

1. **Validação estática:**
   - `validateScenario` sem problemas;
   - `validateMap` do mapa fixo sem erros;
   - lint de tags [G7]: toda tag citada em condição existe no mapa ou no `setup`, ou vem protegida por `fired`;
   - nenhum objetivo `hidden` com `done`/`failed` enquanto [G1] não existir.
2. **Viabilidade passiva (sem jogador):** roda N minutos sem comandos do jogador 0 e confere:
   - (a) nenhuma exceção;
   - (b) o resultado **não** é vitória;
   - (c) a derrota, quando a missão tem pressão, acontece dentro de uma janela esperada;
   - (d) nenhum objetivo foi cumprido antes do primeiro minuto (pega tags futuras);
   - (e) no máximo 1 unidade de cada Titã;
   - (f) todo `raid` gerou unidades (a origem é alcançável e o alvo existia);
   - (g) determinismo: duas execuções com a mesma semente dão o mesmo `stateHash`.
3. **Jogador roteirizado por IA:** o harness (só de teste, sem mexer no núcleo) dá ao jogador 0 um estado `ai` e chama `aiThink(state, p0)` a cada tick. Assim a economia e o exército rodam como numa partida "IA × missão". Por cima vêm **passos roteirizados**, cada um uma lista `{ quando: Condition, comando: Command }` aplicada por `applyCommand`, como mover um herói até um ponto, atacar uma tag ou usar um poder. Mede-se a vitória e o **tempo até a vitória**, que precisa cair na faixa da tabela da §4 com tolerância de ±30 %.
4. **Regressão de texto:** todas as falas têm `pt` e `en` e cabem em 200 caracteres.

| Missão | Passiva: resultado esperado | Roteiro do jogador (resumo) | Vitória esperada |
|---|---|---|---|
| m4 | Sem colônia: nada acontece até cerca de 5 min; não vence; não perde | IA econômica funda o CC em [48,84]; Héracles e o exército fazem `attackMove` em `corrente1` → `corrente2` → `corrente3`; depois Prometeu e o exército em `fortaleza_culto` | 22–35 min |
| m5 | A caça mata Odisseu parado na praia: **derrota** em 2–5 min | Tropas vão até a praia; Odisseu e a escolta fazem `move` por 3 pontos (praia → vau sul → Heraion → CC) | 12–25 min |
| m6 | Sem Mítica e sem Estátua: não vence. **Medido no rascunho:** ainda em jogo aos 20 min no Fácil e no Normal; derrota perto dos 19 min no Difícil | IA econômica chega à Mítica; o roteiro manda construir `wonder_zeus` perto do CC e pôr 6 cidadãos em `repair` | 25–35 min |
| m7 | Aquiles queima as aldeias uma a uma (`aldeias` falha); não vence. **Medido no rascunho:** as 4 aldeias são colocadas, e `rota1`/`rota2` derrubam as aldeias 1 e 2 em 20 min | Arqueiros cretenses e hipaspistas esperam na `aldeia2`; o poder Oráculo é usado aos 150 s | 15–30 min |
| m8 | Oceano derruba o CC: **derrota** em 12–20 min | IA econômica, 8 torres no sul, Raio em Oceano ao surgir, heróis em `attack` na tag `oceano` | 13–25 min |
| m9 | Ondas das fendas até o Palácio cair. **Medido no rascunho:** derrota aos 15, 10 e 8 min (Fácil, Normal, Difícil) | Míticas e heróis fazem `attackMove` para `jaula1..3` e depois `fenda1..3` | 22–35 min |
| m10 | Sortidas até o CC cair: **derrota** em 15–25 min | Exército no altar até `altar_s` = 120; helépoles em `portao_bronze` e depois nos pilares | 25–40 min |
| m11 | Ninguém embarca: **derrota** aos 18 min (ou antes, se o arconte cair) | Arconte e cidadãos fazem `move` até `naus` em 3 levas (aos 200, 500 e 740 s); poderes usados nos grupos das ondas | vitória entre 13 e 18 min |
| m12 | Os aliados seguram; aos 25 min Cronos surge e derruba a Nova Argos: **derrota** em 30–40 min | IA econômica com os aliados; o exército faz `attackMove` nos 3 altares; Raio e Perseu em Cronos | 30–45 min |

**Saída do `scripts/missions.ts`** (uma linha por missão × dificuldade), por exemplo `m5_itaca [hard] passiva=derrota@3m12s roteiro=vitória@18m40s objetivos={...}`. A CI falha se a vitória sair da faixa ou se uma checagem passiva quebrar.

**Harness implementado (3.5):** `src/core/scenario/testing.ts` (só testes e scripts; determinístico).
- `runPassive(src, { minutes, difficulty })` e `runScripted(src, { minutes, difficulty, steps, playerAi? })`, com `src` = id do registro, `ScenarioDef` registrado ou `ScenarioFile`. O roteiro dá ao jogador 0 um estado de IA (`aiThink` a cada tick, nível `playerAi`, padrão `hard`) e aplica os passos `{ label?, when: Condition, command: (state) => Command | Command[] | null, every? }` (sem `every`, dispara uma vez; com `every: N`, repete a cada N s enquanto `when` valer).
- Saída: `{ outcome, atSeconds, fired, objectives, raids, stepsFired, me, hash, error?, checks: { noException, noEarlyObjective, oneTitanEach, raidsSpawned, deterministic } }`; `failedChecks(r)` lista as que quebraram; `fmtOutcome(r)` dá `vitória@18m40s`.
- Roteiro de uma missão nova: entrada em `MISSION_SCRIPTS` (`{ minutes, steps, expect: [minMin, maxMin], strict? }`) com utilitários `armyAttackMove`, `armyOf`, `entityPos('#tag')`, `buildingPos(owner, type)`. `tests/missions.test.ts` exige a entrada para toda missão do registro e roda a passiva de 6 min nas três dificuldades; `npx tsx scripts/missions.ts [min=14] [ids] [dificuldades]` roda a passiva e o roteiro longo.

---

## 8. Integração (para a etapa de produção)

- **Arquivos:**
  - `src/core/scenario/missions/m4_caucaso.scenario.json` … `m12_titanomaquia.scenario.json`;
  - mapas fixos embutidos em `map.data` ou em `src/core/data/maps/<id>.map.json` (cerca de 70–120 KB cada).
- **Registro [G0]:**
  - ids novos em `RESERVED_SCENARIO_IDS`;
  - desbloqueio sequencial mantido;
  - separador de ato na aba Campanha;
  - selo "Prólogo" em m1–m3.
- **Conquistas:** uma por missão nova; "Ato I", "Ato II" e "Ato III" completos; "Campanha no Difícil". `campaign_prologue` continua como está.
- **Idiomas:** todos os textos `{ pt, en }`. O texto das m1–m3 continua como é hoje.
- **Arte (Fase 2):** ilustração por intro; retratos dos personagens da §2 para [G14]; peças de dados novas, quando houver arte:
  - `aetos` (a Águia);
  - a Corrente de Bronze;
  - os Pilares;
  - o Trono.

  Até lá, os placeholders são: `manticore`, `tower`, `fortress`, `temple` e `nemean_lion`.
