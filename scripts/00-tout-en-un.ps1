param(
    [string]$BotPath = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'DJOUSSE TECH MD'),
    [switch]$Release
)
$ErrorActionPreference = 'Stop'
Write-Host "RAPPEL : les patchs de docs\PATCHES_A_FAIRE.md (P1 a P3 au minimum) doivent etre appliques dans le bot avant ce script." -ForegroundColor Yellow
& "$PSScriptRoot\01-installer.ps1"
& "$PSScriptRoot\02-preparer-bot.ps1" -BotPath $BotPath
& "$PSScriptRoot\03-appliquer-android.ps1" -BotPath $BotPath
if ($Release) { & "$PSScriptRoot\04-compiler.ps1" -Release } else { & "$PSScriptRoot\04-compiler.ps1" }