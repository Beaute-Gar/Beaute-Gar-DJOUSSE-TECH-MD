@echo off
title DJOUSSE TECH Bot Launcher
cd /D "C:\Users\Djousse Uriel\Desktop\DJOUSSE TECH MD"

echo.
echo === DJOUSSE TECH - Bot WhatsApp ===
echo.

:: Vérifier si node_modules existe
if exist node_modules (
    echo ✅ Dépendances déjà installées
) else (
    echo ⏳ Installation des dépendances npm...
    call npm install
    if errorlevel 1 (
        echo ❌ Erreur lors de l'installation
        echo Essayez : npm install manuellement
        pause
        exit /b
    )
    echo ✅ Installation terminée
)

echo.
echo === DÉMARRAGE DU BOT ===
echo.
node index.js
echo.
echo Le bot s'est arrêté.
pause