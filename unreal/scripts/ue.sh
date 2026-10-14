#!/usr/bin/env bash
# Roda um script Python no UnrealEditor-Cmd (sem janela). Uso: unreal/scripts/ue.sh <script.py> [log]
# (feche o editor antes; MSYS_NO_PATHCONV evita que /Game/... vire caminho do Windows)
R="$(cd "$(dirname "$0")/../.." && pwd -W)"
UE="/c/Program Files/Epic Games/UE_5.8/Engine/Binaries/Win64/UnrealEditor-Cmd.exe"
MSYS_NO_PATHCONV=1 "$UE" "$R/unreal/AgeOfEarthUE/AgeOfEarthUE.uproject" -ExecutePythonScript="$R/unreal/scripts/$1" -unattended -nopause -nosplash -stdout -FullStdOutLogOutput ${@:3} > "${2:-/tmp/ue.log}" 2>&1
echo "saída $? (log ${2:-/tmp/ue.log})"
