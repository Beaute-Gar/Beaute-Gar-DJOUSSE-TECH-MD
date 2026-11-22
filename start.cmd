@echo off
title DJOUSSE TECH MD - Bot + ngrok
cd /D "C:\Users\Djousse Uriel\Desktop\DJOUSSE TECH MD"

echo ==========================================
echo   DEMARRAGE BOT + NGROK
echo ==========================================
echo.

:: Verifier node_modules
if not exist node_modules (
    echo Installation des dependances...
    npm install
    echo.
)

:: Nettoyage cache
echo Nettoyage cache npm...
npm cache clean --force >nul 2>&1

echo.
echo ==========================================
echo   Etape 1 : Demarrage du bot Node.js
echo ==========================================
start "DJOUSSE-BOT" /min cmd /c "node index.js"
echo Bot lance. Attente 10 secondes...
timeout /t 10 /nobreak >nul

echo.
echo ==========================================
echo   Etape 2 : Demarrage de ngrok
echo ==========================================
echo Lancement du tunnel public...
start "NGROK" /min cmd /c "ngrok http 3001"
echo.
echo ngrok lance. Attente 5 secondes...
timeout /t 5 /nobreak >nul

echo.
echo ==========================================
echo   TOUT EST DEMARRE
echo ==========================================
echo.
echo Bot WhatsApp : en ligne sur http://127.0.0.1:3001
echo API publique : via ngrok (voir fenetre ngrok ci-dessus)
echo.
echo ==========================================
echo   IMPORTANT - CONFIGURER LE SITE WEB
echo ==========================================
echo.
echo Dans web/public/js/config.js, remplacez par :
echo window.DJS_API_BASE = 'https://VOTRE-URL-NGROK.ngrok-free.dev';
echo.
echo L'URL ngrok s'affiche dans la fenetre ngrok ci-dessus.
echo.
echo ==========================================
pause