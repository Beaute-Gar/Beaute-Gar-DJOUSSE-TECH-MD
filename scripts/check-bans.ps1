<#
.SYNOPSIS
  Liste les IP bannies (règles Pare-feu Windows créées par setup-fail2ban.ps1) et permet de débannir.
.PARAMETER Unban
  Adresse IP à débannir.
#>
param([string]$Unban)
$ErrorActionPreference = "Continue"
$prefix = "DJS-BAN-"
Write-Host "=== Règles de bannissement ($prefix*) ==="
$rules = Get-NetFirewallRule -DisplayName "$prefix*" -ErrorAction SilentlyContinue
if (-not $rules) { Write-Host "Aucune règle de bannissement trouvée."; }
else {
  foreach ($rule in $rules) {
    $addr = (Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue).RemoteAddress
    [pscustomobject]@{ Name = $rule.DisplayName; Enabled = $rule.Enabled; RemoteAddress = ($addr -join ',') } | Format-List
  }
}
if ($Unban) {
  $name = "$prefix$Unban"
  $r = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
  if ($r) {
    Remove-NetFirewallRule -DisplayName $name
    Write-Host "Débanni: $Unban"
  } else {
    Write-Warning "Aucune règle trouvée pour $Unban (attendu: $name). Exécuter en administrateur."
  }
}
Write-Host "=== Stratégie de verrouillage de compte ==="
try { net accounts } catch { Write-Warning "Impossible de lire la stratégie (privilèges requis)."; }
