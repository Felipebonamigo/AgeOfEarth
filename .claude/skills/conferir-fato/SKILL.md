---
name: conferir-fato
description: 'Confere em fonte confiável o texto do Age of Earth que fala do mundo real (mitologia grega, história e lugares), anota a fonte e só então libera o texto. Use antes de escrever ou mudar texto de deus, poder, criatura, Era, maravilha, missão ou enciclopédia, quando houver texto marcado para revisão, ou quando o Felipe perguntar "isso está certo?".'
---
# Conferir um fato

O Age of Earth mistura mito e história de propósito (`docs/STORY.md`). Licença poética é permitida, mas tem que ser
escolha anotada, não engano. O que o jogo afirma como fato (quem é filho de quem, o que um deus rege, a data de uma Era,
um lugar real) segue a fonte; o que é invenção do jogo fica claro na ficha da missão.

## Onde está o texto

- Deuses, poderes e criaturas: `src/core/data/gods.ts` (`title`, `desc`, `perks`) e `units.ts`; Eras em `ages.ts`;
  maravilhas em `buildings.ts`. Inglês em `src/i18n/en-data.ts`.
- Enciclopédia (F2): `src/ui/encyclopedia.ts`, que só mostra esses dados.
- Campanha: m1 a m3 em `src/core/scenario/campaign.ts` (só PT) e m4 a m12 em `src/core/scenario/missions/*.scenario.json`.
- Roteiro: `docs/STORY.md`. Licenças poéticas já anotadas: Leônidas anacrônico (`STORY.md`), Heródoto sobre Zacinto
  (`docs/ERAS.md`).
- Não há marcação de texto a conferir: anote no commit e na ficha da missão.

## Fontes que valem

- Fonte antiga em tradução: Hesíodo (Teogonia), Homero, Apolodoro (Biblioteca), Ovídio, Heródoto. O Perseus Digital
  Library (Tufts) tem os textos.
- Theoi Project, que cita a fonte antiga de cada afirmação.
- Britannica e o Oxford Classical Dictionary para história e datas.
Não valem: busca de IA, resumo de blog, Wikipédia sozinha (serve para achar a fonte primária), página sem autor nem data.

## Passos

1. Liste o que falta conferir: os textos novos ou mudados do pedido; em revisão geral, os `desc` de `gods.ts` e as falas das missões.
2. Para cada fato (data, medida, autor, regra, nome), abra a página da fonte com o WebFetch. Trecho de resultado de busca
   não é fonte. Para pesquisa longa, use a skill `deep-research`.
3. Se a fonte confirma: anote a fonte no commit (obra e trecho, ex.: "Hesíodo, Teogonia 507-616") e, se for licença poética, uma linha na
   ficha da missão no `docs/STORY.md`.
4. Se a fonte desmente ou não acha: reescreva o texto com o que a fonte diz, ou tire o fato. Não deixe "aproximadamente" no lugar de conferir.
5. Texto que nasceu de IA continua sendo de IA depois de conferido: ele entra na declaração (skill `declaracao-ia`).
6. Commit com a lista do que foi conferido e as fontes.

## Armadilhas

- Mito tem versões: quando as fontes divergem, escolha uma e anote qual.
- A grafia em inglês segue o glossário do `tests/i18n-eras.test.ts`.
