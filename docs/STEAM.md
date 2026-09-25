# Guia de publicação na Steam

Este documento resume o caminho do projeto até a loja. Nada aqui exige mudar a base de código: o jogo roda no
navegador durante o desenvolvimento e vira um executável nativo com o Electron (pasta `desktop/`).

## 1. Conta e app
- Cadastre-se no [Steamworks](https://partner.steamgames.com/) e pague a taxa do Steam Direct (US$ 100 por jogo, devolvida após US$ 1.000 em vendas).
- Crie o app e anote o **App ID**. Coloque-o em `desktop/steam_appid.txt`.

## 2. Build
- `npm run build` gera `dist/` (jogo web otimizado).
- `cd desktop && npm install && npm run dist:win` gera `desktop/release/win-unpacked/`.
- Faça o mesmo para Linux (`dist:linux`) se quiser suporte a Steam Deck/Proton (o Electron roda muito bem no Proton mesmo sem build Linux).

## 3. Depósitos e upload (SteamPipe)
- Baixe a Steamworks SDK e use `tools/ContentBuilder`.
- Crie um script `app_build_<appid>.vdf` apontando para `desktop/release/win-unpacked` como `ContentRoot` e defina o executável de lançamento em Steamworks → Installation → General (`Age of Earth.exe`).
- `steamcmd +login <usuário> +run_app_build caminho/app_build.vdf +quit` envia a build; depois publique-a em um branch (default/beta) no painel.

## 4. Recursos Steam que o wrapper já prevê
- **Conquistas**: `window.desktop.achievement('ID')` (via `steamworks.js`). Sugestões: "Primeira Idade", "Filho de Zeus", "Titanomaquia", "Maravilha".
- **Cloud**: os saves ficam em `localStorage` do Electron (`%APPDATA%/Age of Earth`). Ative o Steam Auto-Cloud apontando para essa pasta.
- **Multiplayer (fase 3)**: o núcleo é determinístico e o agendador `LockstepScheduler` só troca comandos por tick; o transporte pode ser o Steam Networking Sockets (relay gratuito da Valve) via `steamworks.js`.
- **Workshop (fase 6)**: mapas e cenários são dados JSON, ideais para o Workshop.

## 5. Checklist de loja
- Capsules (imagens), trailer, descrição PT-BR/EN, tags (RTS, Mitologia, Estratégia, Single-player).
- Página "Em breve" o quanto antes: wishlists movem o algoritmo da Steam.
- Playtest com o **Steam Playtest** (gratuito) antes do Early Access.
