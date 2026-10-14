#!/bin/bash
# Prepara a sessão do Claude na nuvem: instala as dependências do npm para
# typecheck, testes (vitest), smoke e playtests (Playwright já vem no container), e gera
# as texturas fotográficas do terreno (public/terrain/, fora do git), que os testes leem.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund

if [ ! -f public/terrain/grass-albedo.png ]; then
  npm run -s art:terrain
fi
