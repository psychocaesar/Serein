@echo off
setlocal enabledelayedexpansion

:: ═══════════════════════════════════════════════════════
:: SEREIN — DEPLOY ALL
:: Tout en une seule commande :
::   1. Git add + commit + push  → GitHub
::   2. Verification app/pwa
::   3. Cap sync Android + iOS
::   4. Notification Pi via SSH   → App web
::   5. (optionnel) Upload audio  → deploy.bat "msg" audio
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

:: ── ETAPE 5.5 : Sync audio vers Pi (optionnel — deploy.bat "msg" audio) ──
if /i "%~2"=="audio" (
  echo [4.5/5] Synchronisation audio vers le Pi...
  scp -r "app/pwa/assets/audio/masculin" pi-serein:/home/pi/sereinapp/app/pwa/assets/audio/
  if !errorlevel! neq 0 (
    echo [ATTENTION] scp masculin a echoue.
  )
  scp -r "app/pwa/assets/audio/feminin" pi-serein:/home/pi/sereinapp/app/pwa/assets/audio/
  if !errorlevel! neq 0 (
    echo [ATTENTION] scp feminin a echoue.
  )
  echo       OK
  echo.
) else (
  echo [4.5/5] Audio ignoree ^(ajouter "audio" pour uploader^).
  echo.
)

:: ── ETAPE 6/5 : Recap ──
echo [5/5] Deploiement termine !
echo.
echo   GitHub  : pushed
echo   Android : sync
echo   Pi web  : update-serein
echo.
if /i "%~2"=="audio" (
  echo   Audio   : uploade vers le Pi
) else (
  echo   Audio   : non uploade  ^<-- deploy.bat "msg" audio pour uploader
)
echo.
echo   iOS     : a faire manuellement sur Mac
echo.
pause
