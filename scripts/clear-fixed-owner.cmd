@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

echo ==================================================
echo  DJOUSSE TECH MD - Retirer le proprietaire fixe
echo  (ownerNumber DB + OWNER_NUMBER .env)
echo ==================================================
echo.
echo IMPORTANT: arretez le bot (node index.js) avant de continuer.
echo.
pause

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js introuvable dans le PATH.
  exit /b 1
)

echo.
echo [1/2] Vidage de ownerNumber dans la base locale...
node -e "const db=require('./src/lib/database'); db.setSetting('ownerNumber',''); console.log('ownerNumber(DB)=', JSON.stringify(db.getSetting('ownerNumber','')));"
if errorlevel 1 (
  echo [ERREUR] Echec de la mise a jour de la base.
  exit /b 1
)

echo.
echo [2/2] Mise a jour de .env (OWNER_NUMBER vide si present)...
if exist ".env" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$p='.env'; $c=Get-Content -LiteralPath $p -Raw; if($c -match '(?m)^OWNER_NUMBER='){ $c=[regex]::Replace($c,'(?m)^OWNER_NUMBER=.*','OWNER_NUMBER='); Set-Content -LiteralPath $p -Value $c -NoNewline -Encoding UTF8; Write-Host 'OWNER_NUMBER vide dans .env'; } else { Write-Host 'OWNER_NUMBER absent de .env (aucun changement)'; }"
  if errorlevel 1 (
    echo [ERREUR] Echec de la mise a jour de .env.
    exit /b 1
  )
) else (
  echo .env introuvable (aucun changement).
)

echo.
echo Termine. Redemarrez le bot: node index.js
echo Les numeros connectes/appaires seront alors les seuls proprietaires.
pause
