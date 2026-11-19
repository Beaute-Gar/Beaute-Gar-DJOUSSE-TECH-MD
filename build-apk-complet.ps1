# =====================================================================
#  BUILD-APK-COMPLET.ps1  -  Synchronise le bot + compile l'APK Android
#  Usage : powershell -ExecutionPolicy Bypass -File build-apk-complet.ps1 [-Release]
# =====================================================================
param(
    [switch]$Release
)

$ErrorActionPreference = 'Stop'

$BotPath = "C:\Users\Djousse Uriel\Desktop\DJOUSSE TECH MD"
$ApkPath = "C:\Users\Djousse Uriel\Desktop\DJOUSSE-TECH-APK"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  BUILD-APK-COMPLET  -  DJOUSSE TECH MD" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verifications preliminaires
Write-Host "Verification des dossiers..." -ForegroundColor Yellow

if (-not (Test-Path (Join-Path $BotPath "index.js"))) {
    throw "Bot PC introuvable : $BotPath"
}
Write-Host "   Bot PC : $BotPath" -ForegroundColor Green

if (-not (Test-Path $ApkPath)) {
    throw "Projet APK introuvable : $ApkPath"
}
Write-Host "   Projet APK : $ApkPath" -ForegroundColor Green

$DestNodeJs = Join-Path $ApkPath "www\nodejs\src"
if (-not (Test-Path $DestNodeJs)) {
    New-Item -ItemType Directory -Force -Path $DestNodeJs | Out-Null
    Write-Host "   Dossier cree : $DestNodeJs" -ForegroundColor Yellow
}

# 2. Copie des fichiers corriges du bot vers l'APK
Write-Host ""
Write-Host "Copie des fichiers du bot vers l'APK..." -ForegroundColor Cyan

$filesToCopy = @(
    "src\handlers\handler.js",
    "src\lib\sender.js",
    "src\lib\group-cache.js",
    "src\lib\session-mode.js",
    "src\lib\dedupe.js",
    "src\lib\gate.js",
    "src\command-loader.js",
    "src\config\config.js",
    "src\config\paths.js",
    "src\config\disabled-commands.js"
)

$copied = 0
$skipped = 0

foreach ($rel in $filesToCopy) {
    $srcFile = Join-Path $BotPath $rel
    $destFile = Join-Path $DestNodeJs $rel
    $destDir = Split-Path $destFile -Parent

    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    }

    if (Test-Path $srcFile) {
        Copy-Item $srcFile $destFile -Force
        Write-Host "   $rel" -ForegroundColor Green
        $copied++
    } else {
        Write-Host "   $rel (introuvable)" -ForegroundColor Yellow
        $skipped++
    }
}

Write-Host "   $copied fichier(s) copie(s), $skipped ignore(s)" -ForegroundColor Green

# 3. Copie du logo
Write-Host ""
Write-Host "Copie du logo..." -ForegroundColor Cyan

$logoSrc = Join-Path $BotPath "web\public\assets\logo-512.png"
$logoDestDir = Join-Path $ApkPath "www\img"
$logoDest = Join-Path $logoDestDir "logo-512.png"

if (-not (Test-Path $logoDestDir)) {
    New-Item -ItemType Directory -Force -Path $logoDestDir | Out-Null
}

if (Test-Path $logoSrc) {
    Copy-Item $logoSrc $logoDest -Force
    Write-Host "   Logo copie : logo-512.png" -ForegroundColor Green
} else {
    Write-Host "   Logo introuvable : $logoSrc (icone par defaut)" -ForegroundColor Yellow
}

# 4. Application du code Android
Write-Host ""
Write-Host "Application du code Android..." -ForegroundColor Cyan

$javaDst = Join-Path $ApkPath "android\app\src\main\java\com\djoussetech\md"
if (-not (Test-Path $javaDst)) {
    New-Item -ItemType Directory -Force -Path $javaDst | Out-Null
}

$javaSrc = Join-Path $ApkPath "android-overrides\java"
if (Test-Path $javaSrc) {
    Copy-Item (Join-Path $javaSrc "*.java") $javaDst -Force
    Write-Host "   Fichiers Java copies" -ForegroundColor Green
} else {
    Write-Host "   Dossier android-overrides/java introuvable" -ForegroundColor Yellow
}

$patchScript = Join-Path $ApkPath "scripts\patch-android.cjs"
if (Test-Path $patchScript) {
    Write-Host "   Application du patch Android..." -ForegroundColor Yellow
    & node $patchScript
    if ($LASTEXITCODE -ne 0) { throw "patch-android.cjs a echoue" }
    Write-Host "   Manifeste Android patche" -ForegroundColor Green
} else {
    Write-Host "   patch-android.cjs introuvable" -ForegroundColor Yellow
}

# 5. Synchronisation Capacitor
Write-Host ""
Write-Host "Synchronisation Capacitor..." -ForegroundColor Cyan

Set-Location $ApkPath
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw "cap sync android a echoue" }
Write-Host "   Capacitor synchronise" -ForegroundColor Green

# 6. Compilation APK
Write-Host ""
Write-Host "Compilation de l'APK..." -ForegroundColor Cyan

$androidDir = Join-Path $ApkPath "android"
Set-Location $androidDir

if ($Release) {
    Write-Host "   Mode : RELEASE (signe)" -ForegroundColor Yellow
    .\gradlew.bat assembleRelease
    if ($LASTEXITCODE -ne 0) { throw "Compilation Release echouee" }

    $unsigned = Join-Path $androidDir "app\build\outputs\apk\release\app-release-unsigned.apk"
    if (-not (Test-Path $unsigned)) {
        $unsigned = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
    }

    $ks = Join-Path $ApkPath "keystore\djousse.jks"
    if (-not (Test-Path $ks)) {
        New-Item -ItemType Directory -Force -Path (Split-Path $ks) | Out-Null
        Write-Host "   Creation de la cle de signature..." -ForegroundColor Yellow
        keytool -genkeypair -v -keystore $ks -alias djousse -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=DJOUSSE TECH MD, O=DJOUSSE, C=CM"
    }

    $sdk = $env:ANDROID_HOME
    if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
    if (-not $sdk) { $sdk = "$env:LOCALAPPDATA\Android\Sdk" }
    $bt = Get-ChildItem (Join-Path $sdk 'build-tools') | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $bt) { throw "build-tools introuvables dans $sdk" }

    $aligned = Join-Path $androidDir "app\build\outputs\apk\release\aligned.apk"
    $finalApk = Join-Path ([Environment]::GetFolderPath('Desktop')) "DJOUSSE-TECH-MD.apk"

    & (Join-Path $bt.FullName 'zipalign.exe') -p -f 4 $unsigned $aligned
    & (Join-Path $bt.FullName 'apksigner.bat') sign --ks $ks --out $finalApk $aligned
    if ($LASTEXITCODE -ne 0) { throw "Signature echouee" }

    Write-Host "   APK signee : $finalApk" -ForegroundColor Green
} else {
    Write-Host "   Mode : DEBUG" -ForegroundColor Yellow
    .\gradlew.bat assembleDebug
    if ($LASTEXITCODE -ne 0) { throw "Compilation Debug echouee" }

    $apkDebug = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
    $finalApk = Join-Path ([Environment]::GetFolderPath('Desktop')) "DJOUSSE-TECH-MD-debug.apk"
    Copy-Item $apkDebug $finalApk -Force

    Write-Host "   APK debug : $finalApk" -ForegroundColor Green
}

# 7. Installation automatique sur appareil connecte
Write-Host ""
Write-Host "Installation sur appareil Android..." -ForegroundColor Cyan

$devices = adb devices -l 2>$null
if ($devices -match "device") {
    $apkToInstall = $finalApk
    Write-Host "   Installation sur l'appareil..." -ForegroundColor Yellow
    adb install -r $apkToInstall
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   APK installee sur l'appareil" -ForegroundColor Green
        Write-Host "   Lancement de l'application..." -ForegroundColor Yellow
        adb shell am start -n com.djoussetech.md/.MainActivity
        Write-Host "   Application lancee !" -ForegroundColor Green
    } else {
        Write-Host "   Echec de l'installation ADB" -ForegroundColor Yellow
    }
} else {
    Write-Host "   Aucun appareil Android connecte via ADB" -ForegroundColor Yellow
    Write-Host "   L'APK est disponible sur votre Bureau : $finalApk" -ForegroundColor Yellow
}

# 8. Resume final
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  BUILD TERMINEE AVEC SUCCES !" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "APK : $finalApk" -ForegroundColor Green
Write-Host "Dossier APK : $ApkPath" -ForegroundColor Green
Write-Host ""
Write-Host "Prochaines etapes :" -ForegroundColor Yellow
Write-Host "   1. Ouvrez l'application sur votre telephone Android"
Write-Host "   2. Acceptez l'avertissement de securite"
Write-Host "   3. Autorisez l'execution en arriere-plan"
Write-Host "   4. Saisissez votre numero WhatsApp et obtenez le code"
Write-Host "   5. Associez l'appareil dans WhatsApp"
Write-Host ""
Write-Host "Bon test de votre bot WhatsApp multi-session !" -ForegroundColor Green

# Maintenir la fenetre ouverte
Write-Host ""
Write-Host "Appuyez sur une touche pour fermer..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")