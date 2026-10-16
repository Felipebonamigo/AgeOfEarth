#!/usr/bin/env bash
# Sobe o servidor do U1 do zero (pré-corrida de N min; porta 8790), tira as capturas e derruba o servidor.
# Uso: AVANCAR=10 SEED=42 unreal/scripts/u1-rodar.sh "<tomadas>" <pasta-saída> [mapa] [atraso]
#   tomadas = nome:tileX:tileY:braço:pitch:yaw;nome2:...   (ver unreal/scripts/captura.sh)
matar() { for pid in $(netstat -ano | grep ":8790 .*LISTENING" | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F >/dev/null 2>&1; done; }
matar
cd "$(dirname "$0")/../.."
npx tsx unreal/scripts/u1-servidor.ts --avancar "${AVANCAR:-10}" --seed "${SEED:-42}" --size "${TAMANHO:-small}" ${EXTRA_SERVIDOR} > /tmp/u1srv.log 2>&1 &
for i in $(seq 1 60); do grep -q "Ponte U1" /tmp/u1srv.log 2>/dev/null && break; sleep 1; done
cat /tmp/u1srv.log | head -3
SHOTS="-AoEShots=$1" unreal/scripts/captura.sh "${3:-/Game/Maps/U1}" "$2" 6000 -50 40 40 "${4:-30}" ${EXTRA_JOGO}
matar
