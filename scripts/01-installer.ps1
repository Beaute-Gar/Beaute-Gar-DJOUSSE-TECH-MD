$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

function Need($cmd, $msg) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw $msg } }
Need node "Node.js 20+ est requis : https://nodejs.org"
Need npm  "npm est requis (installe avec Node.js)"
Need java "JDK 21 requis (Android Studio l'inclut : ajoute son dossier jbr au PATH / JAVA_HOME)"

Write-Host "Installation des dependances Capacitor..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { npm install --legacy-peer-deps }
Write-Host "Installation du plugin Node.js pour Capacitor..." -ForegroundColor Cyan
# ATTENTION : la version npm 0.0.1 embarque Node 12.19.0 (incompatible Baileys 7 / Capacitor 7).
# La version 1.0.0-beta.9 est la derniere compatible Capacitor 7 et embarque Node 18.20.4.
$nodejsPlugin = 'https://github.com/hampoelz/Capacitor-NodeJS/releases/download/v1.0.0-beta.9/capacitor-nodejs.tgz'
npm install $nodejsPlugin --save-exact
if ($LASTEXITCODE -ne 0) { npm install $nodejsPlugin --save-exact --legacy-peer-deps }
if ($LASTEXITCODE -ne 0) { throw "capacitor-nodejs n'a pas pu etre installe. Lis son README (version de Capacitor compatible)." }

if (-not (Test-Path (Join-Path $Root 'www\index.html'))) { throw "www\index.html manquant" }
if (-not (Test-Path (Join-Path $Root 'android'))) { npx cap add android }

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk -and (Test-Path "$env:LOCALAPPDATA\Android\Sdk")) { $sdk = "$env:LOCALAPPDATA\Android\Sdk" }
if ($sdk) {
    ("sdk.dir=" + ($sdk -replace '\\', '/')) | Set-Content (Join-Path $Root 'android\local.properties') -Encoding ascii
    Write-Host "SDK Android : $sdk" -ForegroundColor Green
} else {
    Write-Warning "SDK Android introuvable : installe Android Studio puis definis ANDROID_HOME."
}
Write-Host "OK. Suite : scripts\02-preparer-bot.ps1 -BotPath <dossier du bot>" -ForegroundColor Green