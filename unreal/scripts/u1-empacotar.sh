#!/usr/bin/env bash
# Empacota o U1 (Win64 Development, pak) em $SAIDA (padrão C:/Users/Felip/aoe-build) e copia Dados/ (catálogo de visuais),
# que fica na raiz do projeto e portanto o stage do UAT não leva. Uso: unreal/scripts/u1-empacotar.sh
cd "$(dirname "$0")/../.."
UE="/c/Program Files/Epic Games/UE_5.8/Engine"
P="$(pwd -W)/unreal/AgeOfEarthUE/AgeOfEarthUE.uproject"
SAIDA="${SAIDA:-C:/Users/Felip/aoe-build}"
MSYS_NO_PATHCONV=1 "$UE/Build/BatchFiles/RunUAT.bat" BuildCookRun -project="$P" -platform=Win64 -clientconfig=Development -build -cook -stage -pak -archive -archivedirectory="$SAIDA" -noP4 -utf8output -unattended > /tmp/uat.log 2>&1
grep -E "BUILD SUCCESSFUL|BUILD FAILED" /tmp/uat.log
mkdir -p "$SAIDA/Windows/AgeOfEarthUE/Dados" && cp unreal/AgeOfEarthUE/Dados/* "$SAIDA/Windows/AgeOfEarthUE/Dados/"
