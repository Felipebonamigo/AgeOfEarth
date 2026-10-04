# Roteiro para a sessão local: baixar modelos do Meshy

Este roteiro é para uma sessão do Claude Code **na máquina do dono**, com o navegador dele logado no Meshy
(Claude in Chrome ou o navegador embutido do app). A sessão na nuvem não consegue baixar da galeria: o site só roda com
o `cdn.meshy.ai` e o download exige estar logado. Aqui você baixa, reduz e envia os arquivos pela branch. A integração
no jogo (manifestos, bake, cor de time) fica com a sessão na nuvem.

Branch de trabalho: `claude/ecstatic-albattani-atz7h5` do repositório `Felipebonamigo/AgeOfEarth`.

## 0. Regras

- **Só baixar.** Não gere modelos novos, não faça remesh, rig ou retextura pelo Meshy: tudo isso gasta créditos.
  Se faltar um modelo, anote em `faltando` no catálogo (seção 6); o dono decide se gera.
- Não mude configurações da conta, não publique nada, não compre nada, não troque a licença de nada.
- **Licença: aceite só CC0 e CC BY 4.0.** A licença aparece na página de cada modelo.
  - CC0: livre.
  - CC BY 4.0: pode usar no jogo comercial, mas temos de creditar o autor e o Meshy. Anote o nome e o perfil do autor.
  - **Recuse CC BY-NC** (não comercial), "Private", modelo sem licença visível ou qualquer caso em dúvida. O jogo
    vai ser vendido na Steam.
- Não mexa em `src/`, `art/manifest/`, `public/art/` nem nos scripts do bake. Só crie arquivos em `art/meshy/`.
- Nada de arquivo original pesado no git (não há Git LFS): os originais ficam fora do repositório (seção 4).

## 1. Preparação

```bash
git clone https://github.com/Felipebonamigo/AgeOfEarth.git   # se ainda não tiver
cd AgeOfEarth
git fetch origin claude/ecstatic-albattani-atz7h5
git checkout claude/ecstatic-albattani-atz7h5
git pull
npm ci                                  # Node 22
npx -y @gltf-transform/cli@4.1.1 --version   # ferramenta de redução (baixa sozinha pelo npx)
mkdir -p ~/meshy-originais art/meshy
```

Abra https://www.meshy.ai no navegador e confirme que a conta do dono está logada (avatar no canto).

## 2. O que procurar

O jogo é um RTS na **Grécia antiga (século V a.C.) com mitologia**: visual **realista**, câmera de cima a ~50°. Busque
pela galeria (`https://www.meshy.ai/tags/<tag>`, por exemplo `/tags/greek`, `/tags/ancientgreece`, `/tags/temple`,
`/tags/boar`; também a busca do site) e pelas páginas "Free 3D Models" e "Showcase".

Critérios de cada modelo:
- **Época certa.** Nada de canhão, armadura medieval de placas, castelo gótico, elfo, goblin, orc, ficção científica.
- **Realista**, com textura PBR. Nada de chibi, cartoon, low poly estilizado, miniatura de impressão 3D sem textura.
- **Objeto único e inteiro**: sem pedestal, chão, cenário ou moldura (se o pedestal for separável, tudo bem).
- **Personagens de corpo inteiro**, de pé, em pose neutra (A ou T) ou parada de guarda. Sem rig não tem problema; o rig
  vem depois. Arma e escudo junto do corpo são bem-vindos.
- Em caso de dúvida entre dois, pegue os dois: a escolha final é feita olhando o bake.

### Prioridades (com o id usado no jogo)

| Prioridade | id do jogo | O que buscar |
|---|---|---|
| **P1 — natureza e caça** | `olive` | oliveira mediterrânea de tronco retorcido (várias, de tamanhos diferentes) |
| | `cypress` | cipreste-italiano (alto e fino) |
| | `oak` | carvalho |
| | `berry` | arbusto com frutas vermelhas (medronheiro, *Arbutus unedo*); um com e um sem frutas |
| | `gold` | afloramento de rocha com veio de ouro / minério de ouro |
| | `deer` | cervo, veado-vermelho, gamo (corpo inteiro, de pé) |
| | `boar` | javali selvagem |
| | `crag`, `rock` | rochas e afloramentos de calcário cinza-claro |
| | `stump` | toco de árvore cortada |
| **P2 — edifícios gregos** | `house` | casa grega de pedra e telha (pequena) |
| | `temple` | templo dórico com colunas (estilo Partenon, mas pequeno) |
| | `town_center` | edifício cívico grande: stoa, ágora, palácio micênico |
| | `barracks` | quartel / casa de guarda grega |
| | `granary`, `lumber_camp`, `mine`, `market` | celeiro, serraria, entrada de mina, barracas de mercado com toldo |
| | `academy` | ginásio / academia com pórtico |
| | `fortress`, `tower`, `wall`, `gate` | acrópole fortificada, torre de pedra, muralha, portão de cidade grega |
| | `wonder_zeus`, `wonder_artemis`, `wonder_colossus` | Estátua de Zeus em Olímpia, Templo de Ártemis em Éfeso, Colosso de Rodes |
| **P3 — unidades humanas** | `villager` | camponês grego de quíton (homem e mulher) |
| | `hoplite`, `militia`, `hypaspist`, `myrmidon` | hoplita com elmo coríntio, escudo redondo (hoplon) e lança |
| | `toxotes`, `cretan_archer` | arqueiro grego / cretense |
| | `peltast` | peltasta (dardos, escudo em meia-lua) |
| | `kataskopos`, `hippeus`, `hetairoi` | cavaleiro grego e cavalo (separados ou juntos) |
| | `petrobolos`, `helepolis` | catapulta grega de torção, torre de cerco |
| | `basileus`, `heracles`, `achilles`, `perseus`, `jason`, `odysseus` | rei grego e os heróis |
| **P4 — mitologia** | `minotaur`, `cyclops`, `medusa`, `centaur`, `pegasus`, `hydra`, `cerberus`, `chimera`, `manticore`, `nemean_lion` | criaturas realistas, de corpo inteiro |
| | `colossus`, `sentinel` | estátua de bronze gigante, estátua de mármore |
| | `prometheus`, `oceanus`, `cronus` | titãs (figuras gigantes) |

## 3. Candidatos já achados pela sessão na nuvem

A sessão na nuvem varreu as páginas de tag. Confira cada um pelos critérios e pela licença antes de baixar:

| id do jogo | Modelo | Link |
|---|---|---|
| `hoplite` | Spartan Hoplite | https://www.meshy.ai/3d-models/Spartan-Hoplite-019e8d8c-221e-770a-8379-434bdc230ab4 |
| `hoplite` | Athenian Hoplite | https://www.meshy.ai/3d-models/Athenian-Hoplite-019e8dcb-65cd-7af7-bab3-6bb1758621e4 |
| `hoplite` | Red-Crested Hoplite | https://www.meshy.ai/3d-models/RedCrested-Hoplite-019e4b9f-3541-78a2-8f0e-b665b4280a96 |
| `militia` | Persian Infantry (Spear-Wielding Hoplite) | https://www.meshy.ai/3d-models/SpearWielding-Hoplite-019e55b9-4948-73ed-9ca2-c2b18baa7dd0 |
| `temple` / maravilha | The Parthenon | https://www.meshy.ai/3d-models/the-parthenon-01a08003-637f-71c8-b564-ef093b286a60 |
| `wonder_zeus` | Zeus-X | https://www.meshy.ai/3d-models/ZeusX-019bc4c3-4735-7c55-9a34-06a15f8c12a2 |
| `sentinel` / estátua | Arete Statue | https://www.meshy.ai/3d-models/Arete-Statue-019e7082-eac8-72f4-8e91-b9d8ef6e5854 |
| estátua de deusa | Athena (3 versões) | https://www.meshy.ai/3d-models/Athena-019e9498-6fd0-7bcf-8619-a786357a52a0 · https://www.meshy.ai/3d-models/Athena-019e949f-fe61-7e58-8303-227754ef4e6d · https://www.meshy.ai/3d-models/Athena-019e94a3-155a-7e9d-bf5a-fe9dee10e58f |
| decoração | Greek pillar | https://www.meshy.ai/3d-models/Greek-pillar-01998120-6ed4-702b-aabf-2b1681ef11de |
| decoração | Amphora with Dancing Women | https://www.meshy.ai/3d-models/Amphora-with-Dancing-Women-019d0219-20d0-7813-87f0-461abdcc4796 |
| `olive` | Ancient Olive Majesty | https://www.meshy.ai/3d-models/Ancient-Olive-Majesty-019b03e4-538e-792a-9996-dd07c42bf6bc |
| `cypress` | cypress tree | https://www.meshy.ai/3d-models/cypress-tree-019a6f08-2ceb-7fa2-bce7-829a6ceb4d87 |
| `cypress` | Cypress tree | https://www.meshy.ai/3d-models/Cypress-tree-0194e0de-d038-777e-92f8-8fe2e20b9a9a |
| `boar` | Wild Boar | https://www.meshy.ai/3d-models/Wild-Boar-019d0159-b01f-70ba-b17a-50bae1d4bc2c |
| `boar` | BOAR | https://www.meshy.ai/3d-models/BOAR-019d57be-34c6-77ce-9645-ee43b28afc4c |
| `deer` | Red Deer Stag | https://www.meshy.ai/3d-models/Red-Deer-Stag-019cad3c-8c09-74e2-81a7-9fc757187bdc |
| `deer` | Hart | https://www.meshy.ai/3d-models/Hart-01a0f65b-3b56-74f8-bc99-f35a5934c110 |
| `deer` | Stag | https://www.meshy.ai/3d-models/Stag-019d7fd3-0c09-72b3-9316-89adf5069201 |
| `pegasus` | Pegasus | https://www.meshy.ai/3d-models/Pegasus-019cecd4-ec4c-7c3c-99a2-f2f6a98cecf7 |
| `pegasus` | Winged Pegasus | https://www.meshy.ai/3d-models/Winged-Pegasus-019dbc9c-76d6-7d38-9379-de26b9998337 |
| cavalo (`hippeus`, `hetairoi`) | White Horse | https://www.meshy.ai/3d-models/White-Horse-019b277f-a6a0-788b-8fa4-9e49cbd8dc50 |
| cavalo | horse | https://www.meshy.ai/3d-models/horse-019dc34e-1a5f-7bbc-96fa-1838af5c5843 |
| `minotaur` | A minotaur, dressed with tribal attire (realistic) | https://www.meshy.ai/3d-models/A-minotaur-dressed-with-tribal-attire-Realistic-base-pose-01941dd2-2deb-7ae8-ba26-832febdf8cbe |
| `perseus` | Perseus with the Head of Medusa | https://www.meshy.ai/3d-models/Perseus-with-the-Head-of-Medusa-019d9b7f-075e-7ec6-a2ba-1c500cf1d50e |
| `medusa` / `sentinel` | Cracked Marble Medusa | https://www.meshy.ai/3d-models/Cracked-Marble-Medusa-019d4fcf-356e-744d-86ec-d8cea08f3782 |
| `hydra` | Snake Hydra | https://www.meshy.ai/3d-models/Snake-Hydra-019bf1f5-b1a8-7f29-bdb0-5fa0b5f56410 |
| `centaur` | Centaur | https://www.meshy.ai/3d-models/Centaur-019cdc34-893b-746d-99a3-f0084d9912cc |
| `cerberus` | Three-Headed Cerberus | https://www.meshy.ai/3d-models/ThreeHeaded-Cerberus-Fluffy-019c7439-6ab8-78f3-8c57-65c1f07021dc |
| `cerberus` | Greek God Hades and Cerberus | https://www.meshy.ai/3d-models/Greek-God-Hades-and-Cerberus-019d2fa7-582e-7e35-87bb-f7923541eb3c |
| `chimera` | High detail, mythical chimera | https://www.meshy.ai/3d-models/High-detail-mythical-chimera-0199cd2b-aa46-7aea-9cfc-722336465319 |
| `chimera` | A mythical chimera | https://www.meshy.ai/3d-models/A-mythical-chimera-0194469e-0f41-710d-a6b8-0e08d2c9a0a8 |
| `cronus` | Ancient Stone Titan | https://www.meshy.ai/3d-models/Ancient-Stone-Titan-019b42c8-f4dc-776f-b570-e97ec087de43 |
| `villager` | Peasant Maiden with a Basket | https://www.meshy.ai/3d-models/Peasant-Maiden-with-a-Basket-019e5066-4e9d-7e06-beb3-57f0d335f56c |
| `villager` | Peasant Girl with Wooden Bucket | https://www.meshy.ai/3d-models/Peasant-Girl-with-Wooden-Bucket-019e399b-c16d-7f35-b465-380966e977a9 |
| `petrobolos` | Catapult (confira se não é medieval) | https://www.meshy.ai/3d-models/Catapult-019563c0-c96d-73e7-9db5-fd7f3366e11d |
| `fortress` | Desert Stone Citadel (confira o estilo) | https://www.meshy.ai/3d-models/Desert-Stone-Citadel-019e23ea-f093-7e69-b186-9034e629cc2e |

Também na **conta do dono** (página "My Assets"/workspace): o **javali "WildBoar3D"** e o tigre "BengalTiger3D" **expiram
em 06/10/2026**. Baixe o javali (é o melhor que temos; o tigre não tem uso no jogo). A torre com canhão não serve
(canhão é anacrônico).

## 4. Baixar

1. Abra a página do modelo, confira licença, autor e critérios.
2. Baixe em **GLB**. Se houver escolha de resolução de textura, pegue 2K.
3. Salve o original **fora do repositório**: `~/meshy-originais/<id-do-jogo>__<nome-curto>.glb`.
4. Anote: link, título, autor (nome e link do perfil), licença, vértices e "Rigged" (aparecem na página), data.

## 5. Reduzir para o tamanho do jogo

O bake fotografa cada modelo em sprites; não precisamos de milhões de triângulos. Veja quantos o original tem:

```bash
npx -y @gltf-transform/cli@4.1.1 inspect ~/meshy-originais/boar__wild-boar.glb
```

Alvo de triângulos e textura por tipo:

| Tipo | Triângulos | Textura | Arquivo final |
|---|---|---|---|
| Natureza, animais, rochas | 30–60 mil | 1024 | ≤ 4 MB |
| Unidades e criaturas | 40–80 mil | 1024 | ≤ 5 MB |
| Edifícios e maravilhas | 60–120 mil | 2048 | ≤ 8 MB |

Comandos (troque `RATIO` por `alvo ÷ triângulos do original`, por exemplo `50000 / 5600000 ≈ 0.009`; e `TEX` por 1024 ou
2048):

```bash
IN=~/meshy-originais/boar__wild-boar.glb
OUT=art/meshy/natureza/boar__wild-boar.glb
mkdir -p "$(dirname "$OUT")"
npx -y @gltf-transform/cli@4.1.1 optimize "$IN" /tmp/etapa1.glb --compress false --texture-compress false --simplify true --simplify-ratio RATIO --simplify-error 0.002
npx -y @gltf-transform/cli@4.1.1 resize /tmp/etapa1.glb /tmp/etapa2.glb --width TEX --height TEX
npx -y @gltf-transform/cli@4.1.1 center /tmp/etapa2.glb "$OUT" --pivot below
npx -y @gltf-transform/cli@4.1.1 inspect "$OUT"     # confira triângulos e tamanho
```

- No Windows, troque `/tmp/` por qualquer pasta temporária (por exemplo `$env:TEMP` no PowerShell).
- `--compress false` e `--texture-compress false` são obrigatórios: o bake carrega o GLB sem Draco/Meshopt/KTX2.
- `center --pivot below` põe a origem no pé do modelo (o bake apoia o pé em y = 0).
- Se o arquivo final passar do limite da tabela, reduza mais (ratio menor) ou use textura 1024.
- Personagem com rig ou animação: não use `--simplify` (estraga o esqueleto); só `resize` e `center`, e anote no catálogo.

Pastas de destino: `art/meshy/natureza/`, `art/meshy/edificios/`, `art/meshy/unidades/`, `art/meshy/mitologia/`.
Nome do arquivo: `<id-do-jogo>__<nome-curto>.glb` (minúsculas, hífens), por exemplo `hoplite__spartan-hoplite.glb`.
Salve também a miniatura do site como `<mesmo-nome>.png` ao lado (ajuda na triagem).

## 6. Catálogo (obrigatório: é dele que saem os créditos e a conferência de licenças)

Mantenha `art/meshy/catalogo.json`, uma entrada por arquivo:

```json
{
  "modelos": [
    {
      "arquivo": "natureza/boar__wild-boar.glb",
      "idJogo": "boar",
      "titulo": "Wild Boar",
      "url": "https://www.meshy.ai/3d-models/Wild-Boar-019d0159-b01f-70ba-b17a-50bae1d4bc2c",
      "autor": "nome-do-autor",
      "autorUrl": "https://www.meshy.ai/@perfil",
      "licenca": "CC0",
      "origem": "galeria",
      "verticesOriginal": 652378,
      "triangulos": 54000,
      "textura": 1024,
      "rig": false,
      "baixadoEm": "2026-10-04",
      "notas": "focinho para +z"
    }
  ],
  "recusados": [
    { "url": "https://www.meshy.ai/3d-models/...", "motivo": "CC BY-NC" }
  ],
  "faltando": ["oak", "berry", "gold"]
}
```

- `licenca`: exatamente `CC0` ou `CC BY 4.0`. Para modelos da conta do dono, use `origem: "conta"` e a licença da
  assinatura (anote se o modelo foi feito antes ou depois de assinar).
- Liste em `recusados` o que você olhou e descartou, com o motivo, para a nuvem não procurar de novo.

## 7. Enviar

Faça um commit por lote (por exemplo, natureza; depois edifícios), com mensagem em português, e envie para a mesma branch:

```bash
git add art/meshy
git commit -m "Meshy: lote natureza (oliveira, cipreste, javali, cervo) com catálogo de licenças"
git push origin claude/ecstatic-albattani-atz7h5
```

- Antes do push, confira que nenhum arquivo passa de 10 MB: `find art/meshy -size +10M`.
- Pode começar pelo **P1** e enviar logo: a sessão na nuvem já integra esse lote enquanto você segue para o P2.

No fim, deixe um resumo curto para o dono colar na sessão da nuvem: quantos modelos por prioridade, quais ids
ficaram faltando e qualquer dúvida de licença.
