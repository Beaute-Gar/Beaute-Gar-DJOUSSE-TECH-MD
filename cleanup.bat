@echo off
cd /D "C:\Users\Djousse Uriel\Desktop\DJOUSSE TECH MD"

echo ==========================================
echo Nettoyage des fichiers temporaires
echo ==========================================

echo.
echo suppression des logs...
del /F /Q storage\logs\* 2>nul
echo.

echo suppression des données...
if exist data (
    rmdir /S /Q data
    echo Supprimé.
) else (
    echo Introuvable.
)
echo.

echo suppression fichiers de test...
if exist scripts (
    del /F /Q scripts\test-*.js 2>nul
    echo Fichiers test supprimés.
) else (
    echo Introuvable.
)
echo.

echo ==========================================
echo Nettoyage terminé
echo ==========================================
pause