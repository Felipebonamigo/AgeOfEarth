# 0005 — Procurar PRONTO na galeria tudo o que o jogo precisa (unidades primeiro) e anotar o que falta
- de: nuvem · aberto: 2026-10-09 · prioridade: alta (o dono quer realismo; o teste em `docs/art/etapa9-teste-cycles.png`
  mostrou que o limite é o modelo: a casa do Meshy lê realista, o hoplita procedural não)

Faça depois do 0004 (ou junto: as listas se completam). **Sem gastar créditos**: só modelos já prontos na galeria
comunitária, licença CC0 ou CC BY 4.0. Regras das seções 0, 4, 5 e 6 do roteiro valem.

## O que procurar, pela ordem

1. **Unidades humanas de hoje** (as mais vistas no jogo): hoplita grego (elmo coríntio, escudo redondo, lança),
   cidadão/camponês grego antigo (túnica), arqueiro grego, peltasta (dardos, escudo pequeno), cavaleiro grego, hetairo
   (cavalaria macedônica), falangita (sarissa), rei grego, e os heróis Jasão, Odisseu, Héracles (pele de leão),
   Aquiles, Perseu. Termos: greek hoplite, spartan, greek soldier, ancient warrior, phalanx, greek archer, greek
   peasant, greek villager, toga, chiton, greek cavalry, macedonian, heracles, achilles, perseus.
2. **Cerco**: catapulta/petróbolo, torre de cerco (helépole), aríete. Termos: catapult, ballista, siege tower, ram.
3. **Criaturas míticas e Titãs**: minotauro, centauro, ciclope, mantícora, hidra, leão de Nemeia, Medusa, colosso de
   bronze, quimera, Cérbero, Pégaso, e titãs/gigantes (Prometeu, Oceano, Cronos). Termos: minotaur, centaur, cyclops,
   manticore, hydra, lion, medusa, gorgon, bronze giant, talos, chimera, cerberus, pegasus, titan, giant.
4. **Unidades das Eras novas** (`docs/ERAS.md` §4): catafracto bizantino, piqueiro, arcabuzeiro, mosqueteiro,
   granadeiro, fuzileiro, soldado da 1ª Guerra; couraceiro, dragão, hussardo; trabuco, bombarda, canhão, obus,
   tanque (1ª/2ª Guerra); navios: trirreme, dromon, galeão, navio de linha, couraçado/encouraçado, barco de pesca.
5. **Criaturas novas** (`docs/ERAS.md` §6): sátiro, harpia, grifo, fênix, hipocampo, Escila, monstro marinho (Ceto),
   Erínias/fúrias, dragão alado.
6. **Maravilhas** (`docs/ERAS.md` §9): Partenon, Porta dos Leões de Micenas, palácio de Cnossos, Delfos, teatro grego,
   Mausoléu, Farol de Alexandria, Hagia Sophia, muralhas de Constantinopla, Meteora, fortaleza dos Cavaleiros de Rodes,
   forte estrelado, estádio Panatenaico, Olimpo/trono dos deuses; e as do pedido 0004 (Colosso de pé, templo jônico).

## Como avaliar cada candidato

- Humanoides: de preferência **em pé, em pose neutra (T ou A)** e com o corpo inteiro, para dar para animar depois
  (andar, atacar, morrer). Se o modelo vier **com rig e animações**, melhor ainda — anote isso. Pose de ação fixa
  serve só como referência; anote e siga.
- Realismo: rosto, tecido, couro e metal com textura de verdade; nada de estilo cartoon/low-poly.
- Tamanho: até ~120 mil triângulos e textura 2048; originais em `~/meshy-originais`.
- Até 2 por item; recuse e anote no catálogo o que olhou e não serviu (licença, estilo, qualidade).

## Destino

- Modelos em `art/meshy/unidades/` (pasta nova; nome `<id do jogo>__<descricao>.glb`, ids em `src/core/data/units.ts`
  e, para as Eras novas, os de `docs/eras/E3-linhas-de-unidade.md`), criaturas em `art/meshy/criaturas/`, maravilhas em
  `art/meshy/edificios/`. Atualize `art/meshy/catalogo.json` (`modelos`, `recusados`, `faltando`).
- **Crie e mantenha `art/meshy/faltando-para-gerar.md`**: uma tabela com tudo o que NÃO foi achado pronto (ou só achado
  ruim), uma linha por item: id do jogo, o que é, por que não serviu o que havia, e um **prompt sugerido em inglês** para
  gerar no Meshy (texto do modelo, estilo "realistic, PBR, game asset", pose A, sem base). É a lista que o dono vai usar
  para decidir o que vale gerar com créditos. Não gere nada.
- Responda em `art/meshy/canal/respostas/0005.md` com o que entrou por grupo (1 a 6) e o total que foi para o
  `faltando-para-gerar.md`. Pode responder em partes (status `em andamento` a cada grupo concluído).
