@echo off
title Réparation de l'installation Node.js
cd /D "C:\Users\Djousse Uriel\Desktop\DJOUSSE TECH MD"

echo ==========================================
echo  ===  RÉPARATION DE L'INSTALLATION  ===
echo ==========================================
echo.

echo 1. Suppression de l'ancien node_modules...
rmdir /S /Q node_modules >nul
echo   ✅ Supprimé.

echo.
echo 2. Suppression de package-lock.json...
del /F /Q package-lock.json >nul
echo   ✅ Supprimé.

echo.
echo 3. Nettoyage du cache npm...
npm cache clean --force >nul 2>&1
echo   ✅ Cache nettoyé.

echo.
echo 4. Réinstallation des dépendances...
npm install >install-log.txt 2>&1
echo.
if errorlevel 1 (
    echo ⚠️ Installation avec avertissements (vérifier install-log.txt)
) else (
    echo ✅ Installation terminée sans erreur.
)

echo.
echo 5. Vérification du module critique...
node -e "try { require('@whisockets/baileys'); console.log('✅ baileyS OK') } catch(e) { console.log('❌ Erreur baileyS:', e.message) }"

echo.
echo 6. Test démarrage du bot...
node index.js > bot-start.log 2>&1
if errorlevel 0 (
    echo ✅ Bot démarré avec succès !
) else (
    echo ⚠️ Vérifier bot-start.log pour détails.
)

echo.
echo ==========================================
echo  ===  RÉPARATION TERMINÉE  ===
echo ==========================================
echo.
pause