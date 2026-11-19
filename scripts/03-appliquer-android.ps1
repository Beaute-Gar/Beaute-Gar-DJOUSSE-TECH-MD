param([string]$BotPath = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'DJOUSSE TECH MD'))
$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

if (-not (Test-Path (Join-Path $Root 'android'))) { throw "Lance d'abord scripts\01-installer.ps1" }
if (-not (Test-Path (Join-Path $Root 'www\nodejs\main.cjs'))) { throw "Lance d'abord scripts\02-preparer-bot.ps1" }

# Code natif
$javaDst = Join-Path $Root 'android\app\src\main\java\com\djoussetech\md'
New-Item -ItemType Directory -Force -Path $javaDst | Out-Null
Copy-Item (Join-Path $Root 'android-overrides\java\*.java') $javaDst -Force
Write-Host "Code Java copie" -ForegroundColor Green

# Manifeste + minSdk
node (Join-Path $PSScriptRoot 'patch-android.cjs')
if ($LASTEXITCODE -ne 0) { throw "patch-android.cjs a echoue" }

# Logo du bot / du site
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'www\img') | Out-Null
$logo = Join-Path $BotPath 'web\public\assets\logo-512.png'
if (Test-Path $logo) { Copy-Item $logo (Join-Path $Root 'www\img\logo-512.png') -Force; Write-Host "Logo copie" -ForegroundColor Green }

npx cap sync android
if ($LASTEXITCODE -ne 0) { throw "cap sync a echoue" }
Write-Host "OK. Suite : scripts\04-compiler.ps1" -ForegroundColor Green