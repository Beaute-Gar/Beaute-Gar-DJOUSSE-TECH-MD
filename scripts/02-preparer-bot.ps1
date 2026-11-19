param([string]$BotPath = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'DJOUSSE TECH MD'))
$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Dest = Join-Path $Root 'www\nodejs'

if (-not (Test-Path (Join-Path $BotPath 'index.js'))) { throw "Bot introuvable : $BotPath (utilise -BotPath)" }
Write-Host "Bot source : $BotPath" -ForegroundColor Cyan

if (Test-Path $Dest) { Remove-Item $Dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

# 1) Copie du strict necessaire (jamais .env, storage, session, backend, web, deploy)
Copy-Item (Join-Path $BotPath 'index.js') $Dest
Copy-Item (Join-Path $BotPath 'package.json') $Dest
Copy-Item (Join-Path $BotPath 'src') (Join-Path $Dest 'src') -Recurse
if (Test-Path (Join-Path $BotPath 'logo.jpg')) { Copy-Item (Join-Path $BotPath 'logo.jpg') $Dest }
$mots = Join-Path $BotPath 'docs\mots-interdits.txt'
if (Test-Path $mots) {
    New-Item -ItemType Directory -Force -Path (Join-Path $Dest 'docs') | Out-Null
    Copy-Item $mots (Join-Path $Dest 'docs')
}

# 2) Fichiers mobiles (main.cjs, mobile-runtime.cjs, mobile.config.json)
Copy-Item (Join-Path $Root 'nodejs-overrides\*') $Dest -Recurse -Force

# 3) Commandes retirees en mobile
$mobProfile = Get-Content (Join-Path $Root 'config\mobile-profile.json') -Raw | ConvertFrom-Json
Write-Host "Retrait des commandes incompatibles..." -ForegroundColor Cyan
foreach ($rel in $mobProfile.removeCommands) {
    $p = Join-Path $Dest ('src\commandes\' + ($rel -replace '/', '\'))
    if (Test-Path $p) { Remove-Item $p -Force; Write-Host "  - $rel" } else { Write-Host "  (absent) $rel" -ForegroundColor DarkGray }
}

# 4) package.json mobile
Write-Host "Nettoyage des dependances..." -ForegroundColor Cyan
node (Join-Path $PSScriptRoot 'strip-deps.cjs') $Dest $BotPath
if ($LASTEXITCODE -ne 0) { throw "strip-deps.cjs a echoue" }

# 5) Installation des dependances (sans scripts natifs)
Push-Location $Dest
npm install --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund
$npmCode = $LASTEXITCODE
Pop-Location
if ($npmCode -ne 0) { Write-Warning "npm install a signale une erreur : verifie les dependances." }

$natives = Get-ChildItem (Join-Path $Dest 'node_modules') -Recurse -Filter *.node -ErrorAction SilentlyContinue
if ($natives) {
    Write-Warning "Modules NATIFS detectes (incompatibles Android) :"
    $natives | ForEach-Object { Write-Warning ("  " + $_.FullName.Substring($Dest.Length + 1)) }
}

# 6) Rapport de portage
$rmPattern = ($mobProfile.removeDeps | ForEach-Object { [regex]::Escape($_) }) -join '|'
$patterns = [ordered]@{
    'MODULES IMAGES / NATIFS (canvas, sharp, jimp, webp)'                 = 'canvas|sharp|jimp|webp'
    'FFMPEG / BINAIRES EXTERNES (interdit sur Android)'                   = 'ffmpeg|child_process|spawn\(|execSync|exec\(|execFile'
    'CHEMINS A CENTRALISER (patch P1)'                                    = 'storage|auth_info_baileys|sessions|__dirname|process\.cwd\('
    'VARIABLES D ENVIRONNEMENT (pas de .env sur mobile)'                  = 'process\.env\.[A-Za-z0-9_]+'
    'SERVEUR HTTP / TUNNEL / PM2 (inutile en local, patch P4)'            = 'express|createServer|\.listen\(|ngrok|pm2|supervisor'
    'process.exit (tue toute l appli, patch P4)'                          = 'process\.exit'
    'POINTS DE PATCH WHATSAPP (P2, P3, P5)'                               = 'makeWASocket|useMultiFileAuthState|requestPairingCode|authSafe|creds\.enc'
    'CLES / TOKENS / APPELS AUTHENTIFIES (a passer par un proxy)'         = 'api[_-]?key|apikey|token|Bearer|authorization'
    'COMPATIBILITE NODE 18 (patch P10)'                                   = 'toSorted|toReversed|toSpliced|import\.meta\.dirname|import\.meta\.filename|Object\.groupBy|Array\.fromAsync|Promise\.withResolvers'
}
$patterns['IMPORTS ORPHELINS : dependances retirees mais encore importees (crash au demarrage, patch P8)'] = "['""]($rmPattern)['""/]"

$files = Get-ChildItem $Dest -Recurse -Include *.js, *.cjs, *.mjs |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.Name -notin 'main.cjs', 'mobile-runtime.cjs' }

$out = New-Object System.Collections.Generic.List[string]
$out.Add("RAPPORT DE PORTAGE ANDROID - " + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
$out.Add("Fichiers analyses : " + $files.Count)
foreach ($k in $patterns.Keys) {
    $out.Add(''); $out.Add("=== $k ===")
    $hits = @($files | Select-String -Pattern $patterns[$k])
    if ($hits.Count -eq 0) { $out.Add('  (aucun)'); continue }
    foreach ($m in $hits) {
        $l = $m.Line.Trim(); if ($l.Length -gt 160) { $l = $l.Substring(0, 160) }
        $out.Add(("  {0}:{1}: {2}" -f $m.Path.Substring($Dest.Length + 1), $m.LineNumber, $l))
    }
}
$envs = $files | Select-String -Pattern 'process\.env\.[A-Za-z0-9_]+' -AllMatches | ForEach-Object { $_.Matches.Value } | Sort-Object -Unique
$out.Add(''); $out.Add('=== LISTE UNIQUE DES VARIABLES D ENVIRONNEMENT UTILISEES ===')
foreach ($e in $envs) { $out.Add("  $e") }

$report = Join-Path $Root 'rapport-portage.txt'
[System.IO.File]::WriteAllLines($report, $out, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host "Rapport : $report" -ForegroundColor Green
Write-Host "Lis surtout la section IMPORTS ORPHELINS et envoie-moi le rapport (docs\FICHIERS_A_ENVOYER.md)." -ForegroundColor Yellow