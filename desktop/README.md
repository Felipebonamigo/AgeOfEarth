# Age of Earth — build desktop (Electron) para Steam

O jogo é uma aplicação web (TypeScript + PixiJS) empacotada com Electron, o mesmo caminho usado por jogos como
Vampire Survivors (versões iniciais) e CrossCode na Steam.

## Gerar o executável

```bash
# 1) na raiz do projeto, gere a versão de produção do jogo
npm install && npm run build

# 2) na pasta desktop, instale o Electron e gere o pacote
cd desktop
npm install
npm start            # testa a janela do jogo
npm run dist:win     # release/win-unpacked/Age of Earth.exe
npm run dist:linux   # release/linux-unpacked/age-of-earth
```

## Integração Steam (opcional)

1. Crie o app no Steamworks e anote o App ID; substitua o conteúdo de `steam_appid.txt` (480 é o app de testes da Valve).
2. `npm install steamworks.js` dentro de `desktop/` (biblioteca nativa que carrega a Steamworks SDK).
3. Conquistas: chame `window.desktop.achievement('ID')` no jogo. Nome do jogador: `window.desktop.steamName()`.
4. Envie a pasta `release/win-unpacked` como depósito via SteamPipe (ver `docs/STEAM.md`).
