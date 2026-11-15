<#
setup-ngrok.ps1 — Installation et persistance ngrok (Windows)
- Télécharge/installe ngrok si absent (chemin à adapter) ou indique l'installation manuelle.
- Configure l'authtoken via NGROK_AUTHTOKEN (env) ou saisie sécurisée — JAMAIS dans le dépôt.
- Crée une tâche planifiée pour démarrer le tunnel au boot/connexion avec redémarrage.
Prérequis: renseigner ngrok.yml (domain, addr) et le token.
#>
param(
  [string]$NgrokExe = "C:\Tools\ngrok\ngrok.exe",
  [string]$ConfigPath = (Join-Path (Resolve-Path "$PSScriptRoot\..") 'ngrok.yml'),
  [string]$TunnelName = 'backend'
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $NgrokExe)) {
  Write-Warning "ngrok introuvable: $NgrokExe"
  Write-Host "Installer depuis https://ngrok.com/download, placer ngrok.exe, puis relancer."
  Write-Host "Configurer le token:  $NgrokExe config add-authtoken <TOKEN>  (ou setx NGROK_AUTHTOKEN ...)"
  Write-Host "Après installation, relancer ce script pour créer la tâche planifiée."
  exit 0
}

if ($env:NGROK_AUTHTOKEN) {
  & $NgrokExe config add-authtoken $env:NGROK_AUTHTOKEN | Out-Null
  Write-Host "Authtoken configuré depuis NGROK_AUTHTOKEN."
} else {
  Write-Host "NGROK_AUTHTOKEN non défini. Exécuter: $NgrokExe config add-authtoken <TOKEN> (ne pas stocker le token dans le dépôt)."
}

if (-not (Test-Path $ConfigPath)) { throw "Config introuvable: $ConfigPath" }

$taskName = 'DJS-Ngrok-Tunnel'
$arg = "start --config `"$ConfigPath`" $TunnelName"
$action = New-ScheduledTaskAction -Execute $NgrokExe -Argument $arg -WorkingDirectory (Split-Path $NgrokExe)
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$triggerBoot = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($triggerLogon,$triggerBoot) -Settings $settings -RunLevel Highest -Force | Out-Null
  Write-Host "Tâche planifiée créée: $taskName (démarrage auto + redémarrage)."
} catch {
  Write-Warning "Impossible de créer la tâche (privilèges requis?). Commande manuelle: $NgrokExe $arg"
}
Write-Host "Démarrer maintenant: Start-ScheduledTask -TaskName '$taskName'  (ou lancer $NgrokExe $arg)"
Write-Host "Vérifier: deploy/check-tunnel.ps1 -PublicUrl https://[A_REMPLIR].ngrok-free.app"
