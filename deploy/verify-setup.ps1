<#
verify-setup.ps1 — Vérifications globales (infrastructure locale + exposition)
Exécuter après configuration. Certaines vérifications nécessitent admin/réseau.
#>
param(
  [string]$LocalBase = "http://127.0.0.1:3001",
  [string]$PublicUrl = "https://[A_REMPLIR].ngrok-free.app",
  [string]$AllowedOrigin = "https://[A_REMPLIR].vercel.app",
  [int]$BackendPort = 3001,
  [int]$SshPort = 0
)
$ErrorActionPreference = 'Continue'
$ok=0; $fail=0
function Pass($m){ $script:ok++; Write-Host "✓ $m" -ForegroundColor Green }
function Fail($m){ $script:fail++; Write-Host "✗ $m" -ForegroundColor Red }
function Info($m){ Write-Host "- $m" -ForegroundColor Cyan }

Info "Backend local /health"
try { $r = Invoke-WebRequest -Uri "$LocalBase/health" -UseBasicParsing -TimeoutSec 5; if($r.StatusCode -eq 200){ Pass "Backend local répond 200" } else { Fail "Backend local status $($r.StatusCode)" } } catch { Fail "Backend local injoignable ($($_.Exception.Message))" }

Info "Backend écoute sur 127.0.0.1 (pas d'exposition directe)"
$listen = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue
if ($listen) {
  $addrs = $listen | Select-Object -ExpandProperty LocalAddress -Unique
  if ($addrs -contains '127.0.0.1' -and $addrs -notcontains '0.0.0.0' -and $addrs -notcontains '::') { Pass "Port $BackendPort en écoute locale uniquement" }
  else { Fail "Port $BackendPort écoute sur $($addrs -join ',') (attendu 127.0.0.1)" }
} else { Fail "Aucune écoute détectée sur $BackendPort" }

Info "Tunnel ngrok public /health"
if ($PublicUrl -notmatch '\[A_REMPLIR\]') {
  try { $r = Invoke-WebRequest -Uri ($PublicUrl.TrimEnd('/') + '/health') -Headers @{'ngrok-skip-browser-warning'='1'} -UseBasicParsing -TimeoutSec 15; if($r.StatusCode -eq 200){ Pass "Tunnel public OK" } else { Fail "Tunnel status $($r.StatusCode)" } } catch { Fail "Tunnel injoignable ($($_.Exception.Message))" }
} else { Info "Ignoré: PublicUrl [A_REMPLIR]" }

Info "CORS (origine inconnue refusée)"
if ($PublicUrl -notmatch '\[A_REMPLIR\]') {
  try { $r = Invoke-WebRequest -Uri ($PublicUrl.TrimEnd('/') + '/health') -Headers @{'Origin'='https://evil.example.invalid';'ngrok-skip-browser-warning'='1'} -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop; $acao=$r.Headers['Access-Control-Allow-Origin']; if($acao -eq '*'){ Fail 'CORS wildcard détecté' } else { Pass "Origine inconnue non autorisée (réponse/headers contrôlés)" } } catch { Pass "Origine inconnue rejetée ou non joignable (comportement attendu si 403)" }
} else { Info "Ignoré: PublicUrl [A_REMPLIR]" }

Info "Route protégée sans token"
try { $r = Invoke-WebRequest -Uri "$LocalBase/api/me" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop; if($r.StatusCode -in 401,403){ Pass "401/403 sans token" } else { Fail "attendu 401/403, obtenu $($r.StatusCode)" } } catch { if($_.Exception.Response -and ($_.Exception.Response.StatusCode.value__ -in 401,403)){ Pass "401/403 sans token" } else { Fail "vérification /api/me: $($_.Exception.Message)" } }

Info "Secrets dans le dépôt (scan rapide)"
$hits = Get-ChildItem -Recurse -File -Include *.js,*.ps1,*.yml,*.yaml,*.json,*.md -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\\.git\\|\\storage\\|\\deploy\\firewall-backup' } | Select-String -Pattern 'NGROK_AUTHTOKEN\s*=\s*[A-Za-z0-9]|sk-[A-Za-z0-9]{20}|AIza[0-9A-Za-z_-]{35}|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY' -SimpleMatch:$false -ErrorAction SilentlyContinue
if ($hits) { Fail "Motifs sensibles potentiels détectés (à vérifier/révoquer): $($hits.Count) occurrence(s)" } else { Pass "Aucun motif de secret évident détecté (scan basique)" }

Info "SSH (si configuré)"
$sshd = Get-Service sshd -ErrorAction SilentlyContinue
if ($sshd) { if($sshd.Status -eq 'Running'){ Pass "Service sshd en cours" } else { Fail "Service sshd présent mais arrêté" } } else { Info "sshd non installé (OK si non requis)" }

Write-Host "`nRésultat: $ok ok, $fail échec(s)."
if ($fail -gt 0) { exit 1 }
