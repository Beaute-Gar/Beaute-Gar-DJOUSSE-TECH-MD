# Nettoyage des logs, données et tests
Write-Host "=== Nettoyage des fichiers temporaires ===" -ForegroundColor Green

# 1. Supprimer les logs
Write-Host "Suppression des logs..." -ForegroundColor Yellow
$logsPath = "C:\Users\Djousse Uriel\Desktop\DJOUSSE TECH MD\storage\logs"
if (Test-Path $logsPath) {
    Get-ChildItem -Path $logsPath | Remove-Item -Force
    Write-Host "✅ Logs supprimés" -ForegroundColor Green
} else {
    Write-Host "⚠️ Dossier logs introuvable" -ForegroundColor Yellow
}

# 2. Supprimer les données
Write-Host "Suppression des données..." -ForegroundColor Yellow
$dataPath = "C:\Users\Djousse Uriel\Desktop\DJOUSSE TECH MD\storage\data"
if (Test-Path $dataPath) {
    Remove-Item -Path $dataPath -Recurse -Force
    Write-Host "✅ Données supprimées" -ForegroundColor Green
} else {
    Write-Host "⚠️ Dossier data introuvable" -ForegroundColor Yellow
}

# 3. Supprimer les fichiers de test
Write-Host "Suppression des fichiers de test..." -ForegroundColor Yellow
$scriptsPath = "C:\Users\Djousse Uriel\Desktop\DJOUSSE TECH MD\scripts"
if (Test-Path $scriptsPath) {
    $testFiles = Get-ChildItem -Path $scriptsPath -Filter "test-*.js"
    if ($testFiles) {
        $testFiles | Remove-Item -Force
        Write-Host "✅ Fichiers de test supprimés" -ForegroundColor Green
    } else {
        Write-Host "Aucun fichier de test trouvé" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️ Dossier scripts introuvable" -ForegroundColor Yellow
}

Write-Host "=== Nettoyage terminé ===" -ForegroundColor Green