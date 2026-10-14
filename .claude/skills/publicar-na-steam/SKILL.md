---
name: publicar-na-steam
description: 'Empacota o Age of Earth (Electron hoje, Unreal depois), confere o build e sobe para a Steam pelo SteamPipe, parando onde só o Felipe pode seguir (login, Steam Guard, branch padrão). Use quando o Felipe pedir "sobe para a Steam", "gera o build da loja", "publica no beta" ou "prepara o lançamento".'
---
# Publicar na Steam

Estado hoje: não há App ID (o `desktop/steam_appid.txt` é o 480, de teste) nem `.vdf` de build. O `docs/STEAM.md` descreve o
SteamPipe, o Steam Cloud (`age-of-earth-desktop/saves`, `*.json`) e as conquistas (`npx tsx scripts/steam-achievements.ts`).
O `installer.yml` gera pré-release no GitHub, sem assinatura. O jogo vendido vai ser desenhado no Unreal (`docs/UNREAL.md`),
e o `docs/STEAM.md` ainda não fala dele.

## O que só o Felipe faz

- Conta Steamworks, taxa do Steam Direct, dados fiscais e bancários, criar o app (sai o **App ID**) e os depots.
- O login no `steamcmd`, com a **conta de build** (nunca a pessoal) e o Steam Guard. O Claude nunca digita senha nem código.
- Pôr o build no branch **padrão** (o que todo mundo baixa) e apertar o botão de lançar. O `steamcmd` só põe no ar
  branches beta; o padrão é sempre no painel, pela mão do Felipe.
- Aceitar termos, pagar ou mudar preço.

## Passos

1. Verifique o jogo (skill `verificar`). Nada sobe com teste vermelho.
2. Empacote: 
   - Electron: na raiz `npm install && npm run build`; em `desktop/`, `npm install && npm run dist:win`
     (`release/win-unpacked/Age of Earth.exe`) e `npm run dist:linux`.
   - Unreal (sessão local): `unreal/scripts/u1-empacotar.sh` faz um BuildCookRun Win64 **Development** com pak
     (~1,1 GB, ~5 min de cook) e copia `Dados/`. Para a loja faltam o Shipping e o Steamworks no Unreal: peça pela skill
     `pedido-sessao-local`.
3. Confira o build antes de subir:
   - roda sem o editor e sem a pasta do código (abra o executável empacotado);
   - tamanho total e o que entrou: nada de `.pdb`, log, save de teste, arquivo-fonte de arte ou pasta `Saved/`;
   - versão do jogo visível no menu ou no log, igual à da tag;
   - licenças e créditos no build (skill `declaracao-ia` e o registro de licenças do jogo).
4. Prepare o SteamPipe: não existe; crie em `desktop/steam/` o `app_build_<AppID>.vdf` com `ContentRoot` em `desktop/release/win-unpacked`
   (`docs/STEAM.md` §3) e o depot com `"FileExclusion" "*.pdb"` e `"FileExclusion" "steam_appid.txt"`. No `app_build`, `SetLive` aponta para um branch beta (ex.: `"SetLive" "beta"`).
   Guarde fora do depot os símbolos (`.pdb`) da mesma versão: sem eles, a pilha de um crash vem só com endereços.
5. Peça ao Felipe para rodar o envio, com a conta de build: `steamcmd +login <conta_de_build> +run_app_build <caminho>/desktop/steam/app_build_<AppID>.vdf +quit`.
6. O Felipe instala pelo cliente Steam, no branch beta, e joga 5 minutos. Só então ele promove ao padrão no painel.
7. Anote a versão, a data, o branch e o tamanho em `docs/STEAM.md` e o `docs/ROADMAP.md` (passos 6.x).

## Armadilhas

- A Valve revisa a página e o build antes do lançamento e exige a página "Em breve" no ar por um tempo mínimo. Prazos
  mudam: confira no Steamworks antes de marcar data.
- Conteúdo de IA: a declaração da página tem que bater com o build (skill `declaracao-ia`).
- Os requisitos da página (`docs/steam/LOJA.md`) são os da versão web e Electron: refaça quando o build for o do Unreal.
- Pendências do Felipe antes da loja: CNPJ e W-8BEN (ROADMAP 6.1), conta e App ID (6.2), `docs/LEGAL.md` §7 e o
  checklist do `docs/QA.md` (assinatura, EULA, IARC).
