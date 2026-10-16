#!/usr/bin/env bash
# Mede fps/GPU/VRAM da build empacotada: sobe o servidor (pré-corrida de AVANCAR min), roda o exe 1920x1080 por SEGUNDOS s.
# Uso: AVANCAR=14 SEGUNDOS=60 ESCALA=2 unreal/scripts/u1-medir.sh <saida-perf.log> [exe]
matar() { for pid in $(netstat -ano | grep ":8790 .*LISTENING" | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F >/dev/null 2>&1; done; }
matar
cd "$(dirname "$0")/../.."
EXE="${2:-/c/Users/Felip/aoe-build/Windows/AgeOfEarthUE.exe}"
npx tsx unreal/scripts/u1-servidor.ts --avancar "${AVANCAR:-14}" --seed "${SEED:-42}" --size "${TAMANHO:-small}" ${EXTRA_SERVIDOR} > /tmp/u1srv.log 2>&1 &
for i in $(seq 1 90); do grep -q "Ponte U1" /tmp/u1srv.log 2>/dev/null && break; sleep 1; done
head -2 /tmp/u1srv.log
rm -f "$1"
OUT="$(cygpath -m "$1")"
MSYS_NO_PATHCONV=1 "$EXE" ${MAPA} -windowed -ResX=1920 -ResY=1080 -AoEPerfLog="$OUT" -ExecCmds="${EXTRA_CMDS:+$EXTRA_CMDS,}sg.ViewDistanceQuality ${ESCALA:-2},sg.ShadowQuality ${ESCALA:-2},sg.PostProcessQuality ${ESCALA:-2},sg.GlobalIlluminationQuality ${ESCALA:-2},sg.ReflectionQuality ${ESCALA:-2},sg.TextureQuality ${ESCALA:-2},sg.EffectsQuality ${ESCALA:-2},sg.FoliageQuality ${ESCALA:-2}" -log > /tmp/medir-jogo.log 2>&1 &
sleep $(( ${SEGUNDOS:-60} - 8 ))
nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader >> "$1.vram"
sleep 8
taskkill //IM AgeOfEarthUE.exe //F >/dev/null 2>&1
taskkill //IM AgeOfEarthUE-Win64-Shipping.exe //F >/dev/null 2>&1
grep AOE_PERF "$(dirname "$EXE")/AgeOfEarthUE/Saved/Logs/AgeOfEarthUE.log" | sed "s/^.*AOE_PERF/AOE_PERF/" > "$1"
matar
