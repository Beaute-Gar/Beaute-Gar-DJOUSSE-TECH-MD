<#
setup-services.ps1 — Persistance backend local (Windows)
Crée une tâche planifiée pour démarrer le backend Node au démarrage/connexion.
Le backend doit écouter sur 127.0.0.1:PORT (défaut 3001) — ne pas exposer directement.
#>
param(
  [string]$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source,
  [string]$BackendDir = (Join-Path (Resolve-Path "$PSScriptRoot\..") 'backend'),
  [string]$TaskName = 'DJS-Backend-Local'
)
$ErrorActionPreference = 'Stop'
if (-not $NodeExe) { throw 'node introuvable dans le PATH.' }
if (-not (Test-Path (Join-Path $BackendDir 'src\server.js'))) { throw "Backend introuvable: $BackendDir\src\server.js" }

$action = New-ScheduledTaskAction -Execute $NodeExe -Argument 'src/server.js' -WorkingDirectory $BackendDir
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$triggerBoot = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($triggerLogon,$triggerBoot) -Settings $settings -Force | Out-Null
  Write-Host "Tâche créée: $TaskName (backend). Démarrer: Start-ScheduledTask -TaskName '$TaskName'"
} catch {
  Write-Warning "Échec création tâche (privilèges?). Lancer manuellement: cd $BackendDir; node src/server.js"
}
Write-Host "Vérifier écoute locale: Test-NetConnection 127.0.0.1 -Port [A_REMPLIR:PORT]"
Write-Host "Alternative: PM2/NSSM (documenter selon préférence)."
