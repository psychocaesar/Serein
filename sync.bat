
@echo off
echo === Serein — Sync Android ===
 
:: 1. Récupérer les dernières modifs du repo
git pull origin main
 
:: 2. Créer le dossier www s'il n'existe pas
if not exist www mkdir www
 
:: 3. Copier les fichiers web dans www/
copy app.js www\app.js /Y
copy index.html www\index.html /Y
copy sw.js www\sw.js /Y
copy manifest.json www\manifest.json /Y 2>nul
 
:: NB : les assets (audio, illustrations) vivent dans www\assets\
:: et ne sont pas écrasés par ce script.
 
:: 4. Vérification rapide
if not exist www\app.js (
  echo ERREUR : www\app.js manquant. Sync annule.
  pause
  exit /b 1
)
 
:: 5. Synchroniser avec Android
npx cap sync android
 
echo.
echo Sync termine avec succes !
pause
 