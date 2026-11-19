@echo off
title Réinstallation des dépendances
cd /D "C:\Users\Djousse Uriel\Desktop\DJOUSSE TECH MD"

echo === 1. Suppression de l'ancien node_modules ===
echo.
if exist node_modules (
    echo ⏳ Suppression en cours...
    rmdir /S /Q node_modules >nul
    echo ✅ Supprimé.
) else (
    echo ⚠️ node_modules introuvable.
)

echo.
echo === 2. Nettoyage du cache npm ===
echo.
npm cache clean --force >nul 2>&1
echo ✅ Cache nettoyé.

echo.
echo === 3. Installation fraîche des dépendances ===
echo.
echo ⏳ Cela peut prendre 2-5 minutes selon votre connexion...
npm install >npm-install.log 2>&1

if errorlevel 0 (
    echo ✅ Installation terminée avec succès !
    echo.
    echo === 4. Vérification du module baileyS ===
    echo.
    node -e "require('@whiskeysockets/baileys')" >nul 2>&1 && echo ✅ '@whiskeysockets/baileys' OK || echo ⚠️ Module toujours introuvable.
    echo.
    echo === 5. Redémarrage recommandé ===
    echo.
    echo Exécutez maintenant : start.cmd
) else (
    echo ❌ Erreur durante l'installation.
    echo.
    echo Voir le fichier : npm-install.log
    echo.
    echo Si l'échec persiste, essayez :
    echo   npm install --legacy-peer-deps
)

pause