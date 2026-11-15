<#
setup-firewall.ps1 — Pare-feu Windows (durcissement de base)
À exécuter en PowerShell Administrateur. Relire avant application.
Objectifs: restreindre les entrées, garder le backend non exposé (127.0.0.1), autoriser SSH personnalisé si requis.
NOTE: modifier DefaultInboundAction=Block peut couper des services existants; tester avec prudence.
#>
param(
  [int]$SshPort = 0,               # [A_REMPLIR] port SSH personnalisé (0 = ne pas créer de règle SSH)
  [string]$SshAllowedFrom = '',     # [A_REMPLIR] IP/CIDR autorisée pour SSH (vide = non restreint)
  [switch]$SetDefaultDenyInbound    # appliquer Block par défaut en entrée (impactant)
)
$ErrorActionPreference = 'Stop'
function Assert-Admin { $id=[Security.Principal.WindowsIdentity]::GetCurrent(); $p=New-Object Security.Principal.WindowsPrincipal($id); if(-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){ throw 'Exécuter en Administrateur.' } }
Assert-Admin

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $PSScriptRoot "firewall-backup-$ts.wfw"
netsh advfirewall export $backup | Out-Null
Write-Host "Sauvegarde pare-feu: $backup"

# Profils actifs
Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled True

if ($SetDefaultDenyInbound) {
  Write-Warning "Application: DefaultInboundAction=Block, DefaultOutboundAction=Allow (peut impacter des services)."
  Set-NetFirewallProfile -Profile Domain,Private,Public -DefaultInboundAction Block -DefaultOutboundAction Allow
} else {
  Write-Host "DefaultInboundAction non modifié (relancer avec -SetDefaultDenyInbound pour politique refus par défaut)."
  Set-NetFirewallProfile -Profile Domain,Private,Public -DefaultOutboundAction Allow
}

# Règle SSH personnalisée (si port fourni)
if ($SshPort -gt 0) {
  $name = "OpenSSH-Server-Custom-$SshPort"
  if (-not (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)) {
    $p = @{ DisplayName=$name; Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=$SshPort; Profile='Any'; Enabled='True' }
    if ($SshAllowedFrom) { $p.RemoteAddress = $SshAllowedFrom }
    New-NetFirewallRule @p | Out-Null
    Write-Host "Règle créée: $name"
  } else { Write-Host "Règle existante: $name" }
}

# Backend: ne PAS ouvrir de port entrant; le service doit écouter sur 127.0.0.1 uniquement (ngrok local).
# Exemple de blocage explicite (optionnel) si un port backend était exposé par erreur:
# New-NetFirewallRule -DisplayName "Block-Backend-Exposed-[PORT]" -Direction Inbound -Action Block -Protocol TCP -LocalPort [PORT]

Write-Host "Limitation de débit SSH: configurable via stratégies/périphérie; documenter selon besoins."
Write-Host "Rollback: netsh advfirewall import '$backup'"
Write-Host "Vérifier: Get-NetFirewallProfile | Format-List Name,Enabled,DefaultInboundAction,DefaultOutboundAction"
