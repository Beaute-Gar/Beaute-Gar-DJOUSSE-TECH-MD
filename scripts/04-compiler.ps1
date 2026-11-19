param([switch]$Release)
$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Desktop = [Environment]::GetFolderPath('Desktop')
Set-Location (Join-Path $Root 'android')

if (-not $Release) {
    .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) { throw "Compilation echouee" }
    $apk = Join-Path $Root 'android\app\build\outputs\apk\debug\app-debug.apk'
    $dst = Join-Path $Desktop 'DJOUSSE-TECH-MD-debug.apk'
    Copy-Item $apk $dst -Force
    Write-Host "APK debug : $dst" -ForegroundColor Green
    return
}

# ---- Release signe ----
.\gradlew.bat assembleRelease
if ($LASTEXITCODE -ne 0) { throw "Compilation release echouee" }
$unsigned = Join-Path $Root 'android\app\build\outputs\apk\release\app-release-unsigned.apk'
if (-not (Test-Path $unsigned)) { $unsigned = Join-Path $Root 'android\app\build\outputs\apk\release\app-release.apk' }

$ks = Join-Path $Root 'keystore\djousse.jks'
if (-not (Test-Path $ks)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $ks) | Out-Null
    Write-Host "Creation de la cle de signature (SAUVEGARDE-LA, ne la perds jamais) :" -ForegroundColor Yellow
    keytool -genkeypair -v -keystore $ks -alias djousse -keyalg RSA -keysize 2048 -validity 10000
}
$sdk = $env:ANDROID_HOME; if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { $sdk = "$env:LOCALAPPDATA\Android\Sdk" }
$bt = Get-ChildItem (Join-Path $sdk 'build-tools') | Sort-Object Name -Descending | Select-Object -First 1
if (-not $bt) { throw "build-tools introuvables dans $sdk" }

$aligned = Join-Path $Root 'android\app\build\outputs\apk\release\aligned.apk'
$final = Join-Path $Desktop 'DJOUSSE-TECH-MD.apk'
& (Join-Path $bt.FullName 'zipalign.exe') -p -f 4 $unsigned $aligned
& (Join-Path $bt.FullName 'apksigner.bat') sign --ks $ks --out $final $aligned
if ($LASTEXITCODE -ne 0) { throw "Signature echouee" }
Write-Host "APK signe : $final" -ForegroundColor Green