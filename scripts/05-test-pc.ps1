param([string]$TestNumber = '')
$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$node = Join-Path $Root 'www\nodejs'
if (-not (Test-Path (Join-Path $node 'main.cjs'))) { throw "Lance d'abord scripts\02-preparer-bot.ps1" }
if ($TestNumber) { $env:TEST_PAIR_NUMBER = ($TestNumber -replace '\D', '') }
Write-Host "Test de la version mobile sur le PC (donnees dans $Root\test-data). Ctrl+C pour arreter." -ForegroundColor Cyan
Set-Location $node
node main.cjs