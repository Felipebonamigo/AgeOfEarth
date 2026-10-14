#!/bin/bash
# Prepara a sessão do Claude na nuvem: instala as dependências do npm para
# typecheck, testes (vitest), smoke e playtests (Playwright já vem no container).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund
