$ErrorActionPreference = 'Continue'
$pkg = 'com.djoussetech.md'
Write-Host "=== logcat : moteur Node (NODEJS-MOBILE) ===" -ForegroundColor Cyan
adb logcat -d | Select-String -SimpleMatch "NODEJS-MOBILE" | Select-Object -Last 60
Write-Host "`n=== lignes [mobile] ===" -ForegroundColor Cyan
adb logcat -d | Select-String -SimpleMatch "[mobile]" | Select-Object -Last 60
Write-Host "`n=== fichier mobile.log (dossier prive de l'appli, build debug) ===" -ForegroundColor Cyan
$files = adb shell "run-as $pkg find . -name mobile.log"
foreach ($f in $files) {
    $f = "$f".Trim()
    if ($f) { Write-Host $f -ForegroundColor Yellow; adb shell "run-as $pkg tail -n 80 $f" }
}
