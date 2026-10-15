#!/usr/bin/env bash
# Empacota o U1 (Win64 Development, pak) em $SAIDA (padrão C:/Users/Felip/aoe-build) e copia Dados/ (catálogo de visuais),
# que fica na raiz do projeto e portanto o stage do UAT não leva. Uso: unreal/scripts/u1-empacotar.sh
cd "$(dirname "$0")/../.."
# Saved/UnrealBuildTool/BuildConfiguration.xml desliga a checagem de Live Coding (outras sessões com o editor aberto no mesmo motor)
BC=unreal/AgeOfEarthUE/Saved/UnrealBuildTool/BuildConfiguration.xml
if [ ! -f "$BC" ]; then
  mkdir -p "$(dirname "$BC")"
  cat > "$BC" <<XML
<?xml version="1.0" encoding="utf-8" ?>
<Configuration xmlns="https://www.unrealengine.com/BuildConfiguration">
  <BuildConfiguration><bAllowHotReloadFromIDE>false</bAllowHotReloadFromIDE></BuildConfiguration>
</Configuration>
XML
fi
UE="/c/Program Files/Epic Games/UE_5.8/Engine"
P="$(pwd -W)/unreal/AgeOfEarthUE/AgeOfEarthUE.uproject"
SAIDA="${SAIDA:-C:/Users/Felip/aoe-build}"
if [ "${SO_VERIFICAR:-0}" != "1" ]; then   # SO_VERIFICAR=1: só a conferência da build já empacotada
# o mutex do UBT é do motor inteiro: outra sessão compilando Detonauto/TDFende bloqueia; tenta de novo até 10 vezes (1 min)
for tentativa in $(seq 1 10); do
  MSYS_NO_PATHCONV=1 "$UE/Build/BatchFiles/RunUAT.bat" BuildCookRun -project="$P" -platform=Win64 -clientconfig=Development -build -cook -stage -pak -archive -archivedirectory="$SAIDA" -noP4 -utf8output -unattended -UbtArgs=-WaitMutex > /tmp/uat.log 2>&1
  grep -qiE "ConflictingInstance|conflicting instance|Live Coding is active" /tmp/uat.log || break   # editor de outra sessao (ou captura fechando)
  echo "UBT ocupado (outra sessão ou Live Coding); nova tentativa em 60 s ($tentativa/10)"; sleep 60
done
grep -E "BUILD SUCCESSFUL|BUILD FAILED" /tmp/uat.log
grep -q "BUILD SUCCESSFUL" /tmp/uat.log || exit 1   # outra sessao compilando no mesmo motor: o -WaitMutex espera; se ainda falhar, nao copia Dados novos para um exe velho
mkdir -p "$SAIDA/Windows/AgeOfEarthUE/Dados" && cp -r unreal/AgeOfEarthUE/Dados/. "$SAIDA/Windows/AgeOfEarthUE/Dados/"
fi
# conferência: roda a build 45 s contra a ponte e falha se algum asset carregado por caminho (catálogo, materiais, esqueletos,
# animações) não foi cozido — sem isto a build cai em caixa/estático/material cinza sem avisar ninguém
if [ "${VERIFICAR:-1}" = "1" ]; then
  for pid in $(netstat -ano | grep ":8790 .*LISTENING" | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F >/dev/null 2>&1; done
  npx tsx unreal/scripts/u1-servidor.ts --avancar 12 --seed 42 --size small > /tmp/u1srv-v.log 2>&1 &
  for i in $(seq 1 60); do grep -q "Ponte U1" /tmp/u1srv-v.log 2>/dev/null && break; sleep 1; done
  MSYS_NO_PATHCONV=1 timeout 60 "$SAIDA/Windows/AgeOfEarthUE.exe" -windowed -ResX=1280 -ResY=720 -log > /tmp/verifica.log 2>&1
  taskkill //IM AgeOfEarthUE.exe //F >/dev/null 2>&1; taskkill //IM AgeOfEarthUE-Win64-Development.exe //F >/dev/null 2>&1
  for pid in $(netstat -ano | grep ":8790 .*LISTENING" | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F >/dev/null 2>&1; done
  LOG="$SAIDA/Windows/AgeOfEarthUE/Saved/Logs/AgeOfEarthUE.log"
  FALTAS=$(grep -iE "nao encontrad|sem visual no catalogo|Failed to load|Fatal error" "$LOG" | grep -vE "caravan|merchant|LogWindows: Failed to load .*.dll|SoundConcurrency" | sort | uniq -c)
  if [ -n "$FALTAS" ]; then echo "VERIFICAÇÃO FALHOU: assets faltando na build"; echo "$FALTAS" | head -20; exit 2; fi
  echo "verificação ok: nenhum asset faltando ($(grep -c AOE_PERF "$LOG") amostras de desempenho)"
fi
