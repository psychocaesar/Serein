@echo off
setlocal enabledelayedexpansion

:: ═══════════════════════════════════════════════════════
:: SEREIN — DEPLOY ALL
:: Tout en une seule commande :
::   1. Git add + commit + push  → GitHub
::   2. Copie vers www/           → Android
::   3. Copie vers iOS            → quand vous serez sur Mac
::   4. Cap sync Android
::   5. Notification Pi via SSH   → App web
:: ═══════════════════════════════════════════════════════

:: Message de commit en argument, ou demandé sinon
set "MSG=%~1"
if "%MSG%"=="" (
  set /p MSG="Message de commit : "
)
if "!MSG!"=="" (
  set "MSG=Update"
)

echo.
echo ═══════════════════════════════════════════
echo  Serein — Deploy : !MSG!
echo ═══════════════════════════════════════════
echo.

:: ── ETAPE 1/5 : Verifier qu'il y a des changements ──
git diff --quiet
if !errorlevel! equ 0 (
  git diff --cached --quiet
  if !errorlevel! equ 0 (
    echo [INFO] Aucun changement detecte. Sync uniquement.
    goto :sync_only
  )
)

:: ── ETAPE 2/5 : Git push ──
echo [1/5] Git push vers GitHub...
git add -A
git commit -m "!MSG!"
git push origin main
if !errorlevel! neq 0 (
  echo [ERREUR] git push a echoue. Verifiez votre connexion ou les conflits.
  pause
  exit /b 1
)
echo       OK
echo.

:sync_only

:: ── ETAPE 3/5 : Verifier que app/pwa est intact ──
echo [2/5] Verification app/pwa...
if not exist app\pwa\app.js (
  echo [ERREUR] app\pwa\app.js manquant.
  pause
  exit /b 1
)
echo       OK
echo.

:: ── ETAPE 4/5 : Capacitor sync Android ──
echo [3/5] Synchronisation Android (cap sync)...
call npx cap sync
if !errorlevel! neq 0 (
  echo [ATTENTION] cap sync a renvoye une erreur, mais on continue.
)
echo       OK
echo.

:: ── ETAPE 5/5 : Trigger Pi via SSH ──
echo [4/5] Mise a jour du Pi — code (SSH)...
ssh pi-serein "update-serein" 2>nul
if !errorlevel! neq 0 (
  echo [ATTENTION] SSH vers le Pi a echoue. Lancez manuellement :
  echo              ssh pi-serein "update-serein"
) else (
  echo       OK
)
echo.

:: ── ETAPE 5.5 : Sync audio vers Pi via rsync ──
echo [4.5/5] Synchronisation audio vers le Pi...
rsync -avz --checksum "app/pwa/assets/audio/masculin/" pi-serein:/home/pi/sereinapp/www/assets/audio/masculin/
if !errorlevel! neq 0 (
  echo [ATTENTION] rsync masculin a echoue.
)
rsync -avz --checksum "app/pwa/assets/audio/feminin/" pi-serein:/home/pi/sereinapp/www/assets/audio/feminin/
if !errorlevel! neq 0 (
  echo [ATTENTION] rsync feminin a echoue.
)
echo       OK
echo.

:: ── ETAPE 6/5 : Recap ──
echo [5/5] Deploiement termine !
echo.
echo   GitHub  : pushed
echo   Android : sync
echo   Pi web  : update-serein + audio sync
echo.
echo   iOS     : a faire manuellement sur Mac (copier app.js dans le dossier iOS)
echo.
pause
