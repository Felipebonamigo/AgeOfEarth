# Prepara o PC (Windows) para o Unreal de Age of Earth e escreve um relatório em unreal/setup-report.txt.
# Rode no PowerShell, dentro da pasta do repositório:  powershell -ExecutionPolicy Bypass -File unreal\scripts\setup-windows.ps1
# Instala só o que falta (winget): Git, Node.js LTS, Epic Games Launcher. NÃO entra na conta da Epic nem aceita licenças:
# a instalação do Unreal Engine 5.5+ é feita pelo dono no Launcher (aba Unreal Engine > Instalar Engine).
$ErrorActionPreference = 'Continue'
$report = New-Object System.Collections.Generic.List[string]
function Say($m) { Write-Host $m; $report.Add($m) }
function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Say "== Age of Earth: preparação do PC para o Unreal ($(Get-Date -Format s)) =="
Say "Windows: $([System.Environment]::OSVersion.VersionString)"

# GPU e disco
$gpu = Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name
Say "GPU: $($gpu -join ' | ')"
if (Has 'nvidia-smi') { Say ("nvidia-smi: " + ((nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader) -join ' ; ')) }
$drive = (Get-Location).Drive
if ($drive) { $free = [math]::Round((Get-PSDrive $drive.Name).Free / 1GB); Say "Disco livre em $($drive.Name): $free GB (o Unreal + projeto pedem ~150 GB)"; if ($free -lt 150) { Say "AVISO: pouco espaço livre" } }
Say "RAM: $([math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)) GB"

# winget
if (-not (Has 'winget')) { Say "ERRO: winget ausente (instale o 'App Installer' da Microsoft Store e rode de novo)"; $report | Set-Content unreal\setup-report.txt; exit 1 }

function Ensure($cmd, $id, $nome) {
  if (Has $cmd) { Say "OK  $nome já instalado ($(& $cmd --version 2>&1 | Select-Object -First 1))"; return }
  Say "...instalando $nome ($id)"
  winget install -e --id $id --accept-package-agreements --accept-source-agreements --silent
  Say "    $nome: instalado (abra um novo PowerShell se o comando '$cmd' não aparecer ainda)"
}
Ensure 'git'  'Git.Git' 'Git'
Ensure 'node' 'OpenJS.NodeJS.LTS' 'Node.js LTS'

# Epic Games Launcher e Unreal Engine
$launcher = @("$env:ProgramFiles(x86)\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe", "$env:ProgramFiles\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($launcher) { Say "OK  Epic Games Launcher: $launcher" } else {
  Say "...instalando Epic Games Launcher"
  winget install -e --id EpicGames.EpicGamesLauncher --accept-package-agreements --accept-source-agreements --silent
  Say "    Epic Games Launcher instalado: ABRA-O, entre na sua conta e instale o Unreal Engine 5.5 ou mais novo (aba 'Unreal Engine' > 'Instalar Engine')."
}
$ue = Get-ChildItem "$env:ProgramFiles\Epic Games" -Directory -Filter 'UE_*' -ErrorAction SilentlyContinue
if ($ue) { Say ("OK  Unreal Engine: " + (($ue | ForEach-Object { $_.Name }) -join ', ') + "  (editor: $($ue[-1].FullName)\Engine\Binaries\Win64\UnrealEditor.exe)") }
else { Say "FALTA  Unreal Engine ainda não instalado (o dono instala pelo Launcher; depois rode este script de novo)" }

# Visual Studio (C++) — opcional na primeira prova
$vs = & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property displayName 2>$null
if ($vs) { Say "OK  $vs (C++)" } else { Say "INFO Visual Studio 2022 com 'Desenvolvimento de jogos com C++' não encontrado (só preciso dele para código C++; a primeira prova funciona sem)" }

# Repositório e ponte
if (Test-Path 'package.json') {
  Say "...npm ci"; npm ci --no-audit --no-fund 2>&1 | Select-Object -Last 3 | ForEach-Object { Say "    $_" }
  Say "...exportando um terreno de teste"; npm run unreal:terrain -- --seed 42 --size small --out unreal/exports/teste 2>&1 | Select-Object -Last 3 | ForEach-Object { Say "    $_" }
  Say "...teste rápido da ponte"; npx vitest run tests/unreal-bridge.test.ts 2>&1 | Select-Object -Last 6 | ForEach-Object { Say "    $_" }
} else { Say "AVISO: rode este script na raiz do repositório (onde está o package.json)" }

New-Item -ItemType Directory -Force unreal | Out-Null
$report | Set-Content unreal\setup-report.txt
Say "Relatório gravado em unreal\setup-report.txt (faça commit e push para a nuvem ler)."
