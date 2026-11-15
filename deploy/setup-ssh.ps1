<#
setup-ssh.ps1 — Installation et durcissement OpenSSH Server (Windows)
À exécuter en PowerShell **Administrateur**. Renseigner les placeholders avant exécution.
ANTI-VERROUILLAGE: ne ferme jamais l'ancien port avant validation du nouveau ; garde la session ouverte.

Placeholders à définir:
  $NewPort        = [A_REMPLIR]  (20000-60000 recommandé)
  $AdminUser      = '[A_REMPLIR]' (utilisateur non-root/admin autorisé)
  $PubKey         = '[A_REMPLIR]' (clé publique SSH complète, ex. ssh-ed25519 AAAA...)
  $AllowedSshFrom = '[A_REMPLIR]' (optionnel: IP/plage CIDR autorisée pour SSH, vide = non restreint au pare-feu)
#>
param(
  [int]$NewPort = 0,
  [string]$AdminUser = '[A_REMPLIR]',
  [string]$PubKey = '[A_REMPLIR]',
  [string]$AllowedSshFrom = ''
)

$ErrorActionPreference = 'Stop'
function Assert-Admin { $id=[Security.Principal.WindowsIdentity]::GetCurrent(); $p=New-Object Security.Principal.WindowsPrincipal($id); if(-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){ throw 'Ce script doit être exécuté en Administrateur.' } }
Assert-Admin

if ($NewPort -lt 20000 -or $NewPort -gt 65535) { throw "NewPort invalide: $NewPort (choisir 20000-60000, non utilisé)." }
if ($AdminUser -eq '[A_REMPLIR]' -or [string]::IsNullOrWhiteSpace($AdminUser)) { throw 'AdminUser [A_REMPLIR].' }
if ($PubKey -eq '[A_REMPLIR]' -or $PubKey -notmatch '^(ssh-|ecdsa-)') { throw 'PubKey [A_REMPLIR] ou format invalide.' }

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$sshdDir = 'C:\ProgramData\ssh'
$cfg = Join-Path $sshdDir 'sshd_config'

# 1) Installer OpenSSH Server si nécessaire
$cap = Get-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
if ($cap.State -ne 'Installed') {
  Write-Host 'Installation OpenSSH Server...'
  Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
}
if (-not (Test-Path $sshdDir)) { New-Item -ItemType Directory -Force -Path $sshdDir | Out-Null }
if (-not (Test-Path $cfg)) { & "$env:WINDIR\System32\OpenSSH\sshd.exe" -f $cfg 2>$null; if (-not (Test-Path $cfg)) { Copy-Item "$env:WINDIR\System32\OpenSSH\sshd_config_default" $cfg -ErrorAction SilentlyContinue } }

# 2) Sauvegardes
Copy-Item $cfg "$cfg.bak.$ts" -Force
Write-Host "Sauvegarde: $cfg.bak.$ts"

# 3) Installer la clé publique AVANT de désactiver les mots de passe
$userProfile = Join-Path 'C:\Users' $AdminUser
$sshDir = Join-Path $userProfile '.ssh'
$authKeys = Join-Path $sshDir 'authorized_keys'
if (-not (Test-Path $userProfile)) { throw "Profil utilisateur introuvable: $userProfile" }
New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
if (-not (Test-Path $authKeys) -or -not (Select-String -Path $authKeys -SimpleMatch $PubKey -Quiet)) {
  Add-Content -Path $authKeys -Value $PubKey -Encoding ascii
}
# Permissions: propriétaire = utilisateur, héritage désactivé (icacls). 700/.ssh 600/authorized_keys
icacls $sshDir /inheritance:r /grant:r "${AdminUser}:(OI)(CI)(F)" /grant:r "SYSTEM:(OI)(CI)(F)" | Out-Null
icacls $authKeys /inheritance:r /grant:r "${AdminUser}:(R)" /grant:r "SYSTEM:(F)" | Out-Null
Write-Host "Clé installée et permissions appliquées: $authKeys"

# 4) Préparer la nouvelle config (on GARDE le port 22 en plus du nouveau port pour l'instant)
$old = Get-Content $cfg -Raw
$managed = @"

# --- Durcissement géré (deploy/setup-ssh.ps1 $ts) ---
Port 22
Port $NewPort
AddressFamily any
ListenAddress 0.0.0.0
Protocol 2
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
AllowUsers $AdminUser
MaxAuthTries 3
LoginGraceTime 30
MaxSessions 4
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
PermitTunnel no
Banner __PROGRAMDATA__/ssh/banner.txt
HostKeyAlgorithms ssh-ed25519,rsa-sha2-512,rsa-sha2-256
PubkeyAcceptedAlgorithms ssh-ed25519,rsa-sha2-512,rsa-sha2-256
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
# --- fin durcissement ---
"@
$banner = "Accès autorisé uniquement. Toute activité peut être surveillée et enregistrée.`r`n"
Set-Content -Path (Join-Path $sshdDir 'banner.txt') -Value $banner -Encoding ascii
# Supprimer anciennes directives en doublon simples (Port/PasswordAuthentication/etc.) puis ajouter le bloc géré
$clean = ($old -split "`r?`n" | Where-Object { $_ -notmatch '^\s*(Port|PermitRootLogin|PasswordAuthentication|KbdInteractiveAuthentication|PubkeyAuthentication|PermitEmptyPasswords|AllowUsers|MaxAuthTries|LoginGraceTime|MaxSessions|ClientAliveInterval|ClientAliveCountMax|X11Forwarding|AllowAgentForwarding|AllowTcpForwarding|PermitTunnel|Banner|Protocol)\b' }) -join "`r`n"
Set-Content -Path $cfg -Value ($clean + "`r`n" + $managed) -Encoding ascii

# 5) Valider la config
$sshdExe = "$env:WINDIR\System32\OpenSSH\sshd.exe"
& $sshdExe -t -f $cfg
if ($LASTEXITCODE -ne 0) { Copy-Item "$cfg.bak.$ts" $cfg -Force; throw 'sshd -t a échoué: restauration effectuée.' }

# 6) Pare-feu: ouvrir le NOUVEAU port AVANT le rechargement (garder 22 ouvert pour l'instant)
$ruleName = "OpenSSH-Server-Custom-$NewPort"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
  $params = @{ DisplayName=$ruleName; Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=$NewPort; Profile='Any'; Enabled='True' }
  if ($AllowedSshFrom) { $params.RemoteAddress = $AllowedSshFrom }
  New-NetFirewallRule @params | Out-Null
  Write-Host "Pare-feu: port $NewPort ouvert ($ruleName)."
}

# 7) Planifier un rollback automatique dans 5 minutes (annulé après confirmation)
$rollbackScript = Join-Path $env:TEMP "ssh-rollback-$ts.ps1"
@"
Copy-Item '$cfg.bak.$ts' '$cfg' -Force
Restart-Service sshd -ErrorAction SilentlyContinue
Write-EventLog -LogName Application -Source 'OpenSSH' -EventId 1001 -EntryType Warning -Message 'Rollback SSH automatique exécuté ($ts)' -ErrorAction SilentlyContinue
"@ | Set-Content -Path $rollbackScript -Encoding UTF8
$taskName = "DJS-SSH-Rollback-$ts"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$rollbackScript`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -RunLevel Highest -Force | Out-Null
Write-Warning "Rollback automatique planifié dans 5 min (tâche: $taskName). NE PAS fermer cette session."

# 8) Démarrer/recharger sshd (garde 22 + nouveau port)
Set-Service -Name sshd -StartupType Automatic
Restart-Service sshd
Start-Sleep -Seconds 2
$listening = Get-NetTCPConnection -LocalPort $NewPort -State Listen -ErrorAction SilentlyContinue
if (-not $listening) { Write-Warning "Le port $NewPort n'écoute pas encore. Vérifier les journaux OpenSSH avant de continuer." }

Write-Host "`n=== ÉTAPE DE VALIDATION (OBLIGATOIRE) ==="
Write-Host "1) Depuis un AUTRE terminal/machine:  ssh -p $NewPort $AdminUser@<IP_LOCAL>"
Write-Host "2) Vérifier que l'authentification par clé fonctionne."
Write-Host "3) Quand c'est confirmé, exécuter:"
Write-Host "     Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
Write-Host "   puis éditer $cfg pour retirer 'Port 22', exécuter 'sshd -t', 'Restart-Service sshd',"
Write-Host "   et fermer/supprimer la règle pare-feu du port 22 uniquement après re-test sur $NewPort."
Write-Host "`nRollback manuel: Copy-Item '$cfg.bak.$ts' '$cfg' -Force; Restart-Service sshd"
Write-Host "Sauvegarde: $cfg.bak.$ts"
