# =====================================================================
#  07-diagnostic-jumelage.ps1  -  collecte les logs du jumelage
#  Usage : powershell -ExecutionPolicy Bypass -File .\scripts\07-diagnostic-jumelage.ps1
# =====================================================================
$ErrorActionPreference = 'Continue'
$pkg = 'com.djoussetech.md'
$Root = Split-Path $PSScriptRoot -Parent

function Find-Adb {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'),
        (Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'),
        (Join-Path $env:ANDROID_SDK_ROOT 'platform-tools\adb.exe')
    )
    foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw "adb introuvable. Installe les Platform-Tools du SDK Android."
}

$adb = Find-Adb
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path $Root ("diagnostic-" + $stamp)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "adb : $adb" -ForegroundColor Cyan
& $adb devices -l

Write-Host "Effacement de logcat..." -ForegroundColor Cyan
& $adb logcat -c

Write-Host "Lancement de l'appli..." -ForegroundColor Cyan
& $adb shell am force-stop $pkg
& $adb shell am start -n "$pkg/.MainActivity"

Write-Host "Attente de 40 secondes (saisis le numero et appuie sur Obtenir le code)..." -ForegroundColor Yellow
Start-Sleep -Seconds 40

$pidTxt = (& $adb shell pidof $pkg 2>$null | Out-String).Trim()
Write-Host "PID : $pidTxt" -ForegroundColor Cyan

Write-Host "Export logcat complet..." -ForegroundColor Cyan
& $adb logcat -d | Out-File (Join-Path $outDir 'logcat-complet.txt') -Encoding utf8
if ($pidTxt) {
    & $adb logcat -d --pid=$pidTxt | Out-File (Join-Path $outDir 'logcat-pid.txt') -Encoding utf8
}
& $adb logcat -d | Select-String -SimpleMatch 'NODEJS-MOBILE','CapacitorNodeJS','Capacitor/Console','chromium','AndroidRuntime','[mobile]','[ui]' |
    Out-File (Join-Path $outDir 'logcat-filtre.txt') -Encoding utf8

Write-Host "Recherche de mobile.log..." -ForegroundColor Cyan
$files = & $adb shell "run-as $pkg find . -name mobile.log" 2>$null
$logTxt = Join-Path $outDir 'mobile.log.txt'
"# fichiers trouves :`n$files`n" | Out-File $logTxt -Encoding utf8
foreach ($f in $files) {
    $f = "$f".Trim()
    if ($f) {
        "===== $f =====" | Out-File $logTxt -Append -Encoding utf8
        & $adb shell "run-as $pkg tail -n 200 '$f'" | Out-File $logTxt -Append -Encoding utf8
    }
}

Write-Host ""
Write-Host "Diagnostic ecrit dans : $outDir" -ForegroundColor Green
Get-ChildItem $outDir | Select-Object Name,Length | Format-Table -AutoSize
Write-Host "Envoie les fichiers logcat-filtre.txt, logcat-pid.txt et mobile.log.txt." -ForegroundColor Yellow
