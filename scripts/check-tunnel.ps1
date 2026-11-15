<#
.SYNOPSIS
  Vérifie que le tunnel ngrok répond et que l'URL publique atteint le backend.
.PARAMETER PublicUrl
  URL publique ngrok, ex. https://[A_REMPLIR].ngrok-free.app
.PARAMETER HealthPath
  Chemin de santé (défaut /health)
#>
param(
  [string]$PublicUrl = "https://[A_REMPLIR].ngrok-free.app",
  [string]$HealthPath = "/health"
)
$ErrorActionPreference = "Stop"
if ($PublicUrl -match '\[A_REMPLIR\]') { Write-Warning "PublicUrl contient [A_REMPLIR]. Renseigne le domaine ngrok."; }
$uri = ($PublicUrl.TrimEnd('/') + $HealthPath)
Write-Host "Test: $uri"
try {
  $headers = @{ 'ngrok-skip-browser-warning' = '1' }
  $r = Invoke-WebRequest -Uri $uri -Headers $headers -UseBasicParsing -TimeoutSec 15
  Write-Host "HTTP $($r.StatusCode)"
  Write-Host $r.Content
  if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { Write-Host "OK: tunnel/backend joignable."; exit 0 }
  Write-Warning "Réponse inattendue."; exit 2
} catch {
  Write-Error "Échec: $($_.Exception.Message)"
  Write-Host "Vérifier: backend local démarré (127.0.0.1), service ngrok actif, domaine correct, quota/limites ngrok."
  exit 1
}
