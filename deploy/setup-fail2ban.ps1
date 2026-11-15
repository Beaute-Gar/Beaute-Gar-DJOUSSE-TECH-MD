<#
setup-fail2ban.ps1 — Équivalent fail2ban pour Windows
- Applique/affiche la stratégie de verrouillage de compte
- Installe une tâche planifiée qui surveille les échecs de connexion (Event ID 4625)
  et bannit l'IP source dans le Pare-feu Windows au-delà du seuil.
À exécuter en PowerShell Administrateur.
#>
param(
  [int]$MaxRetry = 3,
  [int]$FindTimeMinutes = 10,
  [int]$BanMinutes = 60,
  [string]$IgnoreIp = '' # [A_REMPLIR] IP/plage à ignorer (documenter; le script simple ci-dessous gère IP unique)
)
$ErrorActionPreference = 'Stop'
function Assert-Admin { $id=[Security.Principal.WindowsIdentity]::GetCurrent(); $p=New-Object Security.Principal.WindowsPrincipal($id); if(-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){ throw 'Exécuter en Administrateur.' } }
Assert-Admin

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
Write-Host "Configuration stratégie de verrouillage (seuil=$MaxRetry, fenêtre=$FindTimeMinutes min, durée=$BanMinutes min)"
# net accounts: /lockoutthreshold, /lockoutwindow, /lockoutduration
net accounts /lockoutthreshold:$MaxRetry /lockoutwindow:$FindTimeMinutes /lockoutduration:$BanMinutes | Out-Null
Write-Host "Stratégie appliquée (vérifier: net accounts)."

# Script de bannissement basé sur Security 4625
$banScript = Join-Path $PSScriptRoot 'ban-4625.ps1'
$banContent = @'
param([int]$MaxRetry=3,[int]$FindTimeMinutes=10,[int]$BanMinutes=60,[string]$IgnoreIp="")
$ErrorActionPreference = 'Continue'
$since = (Get-Date).AddMinutes(-$FindTimeMinutes)
$events = Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625; StartTime=$since} -ErrorAction SilentlyContinue
if (-not $events) { exit 0 }
$ips = @{}
foreach ($e in $events) {
  $xml = [xml]$e.ToXml()
  $ip = ($xml.Event.EventData.Data | Where-Object { $_.Name -eq 'IpAddress' }).'#text'
  if ($ip -and $ip -ne '-' -and $ip -ne '::1' -and $ip -ne '127.0.0.1') { $ips[$ip] = 1 + ($ips[$ip] | ForEach-Object {$_}); if (-not $ips[$ip]) { $ips[$ip]=1 } }
}
# recompute counts safely
$counts = @{}
foreach ($e in $events) {
  $xml = [xml]$e.ToXml(); $ip = ($xml.Event.EventData.Data | Where-Object { $_.Name -eq 'IpAddress' }).'#text'
  if ($ip -and $ip -ne '-' -and $ip -ne '::1' -and $ip -ne '127.0.0.1') { if ($counts.ContainsKey($ip)) { $counts[$ip]++ } else { $counts[$ip]=1 } }
}
foreach ($ip in $counts.Keys) {
  if ($IgnoreIp -and $ip -eq $IgnoreIp) { continue }
  if ($counts[$ip] -ge $MaxRetry) {
    $name = "DJS-BAN-$ip"
    if (-not (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Block -RemoteAddress $ip -Profile Any -Enabled True | Out-Null
      Write-Host "Banni: $ip ($($counts[$ip]) échecs)"
    }
  }
}
# Expiration simple: supprimer les règles plus anciennes que BanMinutes (via fichier horodaté)
$stateDir = Join-Path $env:ProgramData 'djs-ban'; New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
# (Extension: enregistrer l'heure de ban et nettoyer; ici on conserve jusqu'à débannissement manuel via check-bans.ps1)
'@
Set-Content -Path $banScript -Value $banContent -Encoding UTF8
Write-Host "Script de bannissement: $banScript"

$taskName = 'DJS-BanOn4625'
$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$banScript`" -MaxRetry $MaxRetry -FindTimeMinutes $FindTimeMinutes -BanMinutes $BanMinutes -IgnoreIp '$IgnoreIp'"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -RunLevel Highest -Force | Out-Null
Write-Host "Tâche planifiée: $taskName (toutes les 5 min)."
Write-Host "Journal API (abus/429): prévoir un filtre applicatif séparé lisant les logs du backend (jail équivalent)."
Write-Host "Récidive/alertes email: à compléter selon infrastructure de messagerie ($IgnoreIp/email [A_REMPLIR])."
