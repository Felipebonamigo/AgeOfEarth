#!/usr/bin/env bash
# Abre o jogo (editor -game) num mapa, deixa a câmera num ponto e tira as capturas do teste automático.
# Uso: unreal/scripts/captura.sh <mapa> <pasta-saída> <braço-uu> <pitch> <tileX> <tileY> [atraso-s] [extras...]
# A ponte (npx tsx unreal/scripts/u1-servidor.ts ...) precisa estar de pé na porta 8790.
R="$(cd "$(dirname "$0")/../.." && pwd -W)"
UE="/c/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor.exe"
mkdir -p "$2"
MSYS_NO_PATHCONV=1 timeout 600 "$UE" "$R/unreal/AgeOfEarthUE/AgeOfEarthUE.uproject" "$1" -game -windowed -ResX=1920 -ResY=1080 -AoEAutoTest -AoEDelay=${7:-45} -AoEShotDir="$(cd "$2" && pwd -W)" -AoEArm=$3 -AoEPitch=$4 -AoETileX=$5 -AoETileY=$6 $SHOTS -log -ABSLOG="$(cd "$(dirname "$2")" 2>/dev/null; pwd -W)/ue-jogo.log" ${@:8} > /tmp/game.log 2>&1
echo "saída $?"
