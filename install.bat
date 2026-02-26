@echo off
chcp 65001 >nul
title MindVault — Full Installer
setlocal EnableDelayedExpansion

cls
echo.
echo   ╔══════════════════════════════════════════╗
echo   ║       MindVault — Full Installer         ║
echo   ╚══════════════════════════════════════════╝
echo.
echo   Installiert automatisch alles was du brauchst:
echo   Node.js, yt-dlp, ffmpeg ^& MindVault
echo.
echo   ──────────────────────────────────────────
echo.

set "SCRIPT_DIR=%~dp0"

:: ═══════════════════════════════════════════════════════════
:: STEP 1: Check/Install winget
:: ═══════════════════════════════════════════════════════════
echo   [1/5] Paketmanager
echo.

where winget >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   [OK] winget gefunden
    set "HAS_WINGET=1"
) else (
    echo   [!]  winget nicht gefunden
    echo        Manuelles Installieren noetig fuer fehlende Tools
    set "HAS_WINGET=0"
)
echo.

:: ═══════════════════════════════════════════════════════════
:: STEP 2: Check/Install Node.js
:: ═══════════════════════════════════════════════════════════
echo   [2/5] Node.js
echo.

where node >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
    echo   [OK] Node.js !NODE_VERSION! gefunden
) else (
    echo   [→]  Node.js wird installiert...
    if "!HAS_WINGET!"=="1" (
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements -h
        echo   [OK] Node.js installiert
        echo.
        echo   WICHTIG: Bitte schliesse dieses Fenster und starte
        echo            install.bat erneut, damit Node.js erkannt wird.
        echo.
        pause
        exit /b 0
    ) else (
        echo   [X]  Node.js konnte nicht automatisch installiert werden
        echo        Bitte manuell installieren: https://nodejs.org
        echo.
        pause
        exit /b 1
    )
)

where npm >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
    echo   [OK] npm !NPM_VERSION!
) else (
    echo   [X]  npm nicht gefunden
    pause
    exit /b 1
)
echo.

:: ═══════════════════════════════════════════════════════════
:: STEP 3: Check/Install Media Tools
:: ═══════════════════════════════════════════════════════════
echo   [3/5] Media Tools (yt-dlp + ffmpeg)
echo.

:: ── yt-dlp ──
where yt-dlp >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   [OK] yt-dlp gefunden
) else (
    echo   [→]  yt-dlp wird installiert...
    if "!HAS_WINGET!"=="1" (
        winget install yt-dlp.yt-dlp --accept-source-agreements --accept-package-agreements -h >nul 2>&1
        where yt-dlp >nul 2>&1
        if !ERRORLEVEL! EQU 0 (
            echo   [OK] yt-dlp installiert
        ) else (
            echo   [!]  yt-dlp konnte nicht installiert werden
            echo        Manuell: https://github.com/yt-dlp/yt-dlp#installation
        )
    ) else (
        echo   [!]  yt-dlp nicht gefunden — winget nicht verfuegbar
        echo        Manuell: https://github.com/yt-dlp/yt-dlp#installation
    )
)

:: ── ffmpeg ──
where ffmpeg >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   [OK] ffmpeg gefunden
) else (
    echo   [→]  ffmpeg wird installiert...
    if "!HAS_WINGET!"=="1" (
        winget install Gyan.FFmpeg --accept-source-agreements --accept-package-agreements -h >nul 2>&1
        where ffmpeg >nul 2>&1
        if !ERRORLEVEL! EQU 0 (
            echo   [OK] ffmpeg installiert
        ) else (
            echo   [!]  ffmpeg konnte nicht installiert werden
            echo        Manuell: https://ffmpeg.org/download.html
        )
    ) else (
        echo   [!]  ffmpeg nicht gefunden — winget nicht verfuegbar
        echo        Manuell: https://ffmpeg.org/download.html
    )
)
echo.

:: ═══════════════════════════════════════════════════════════
:: STEP 4: MindVault Dependencies
:: ═══════════════════════════════════════════════════════════
echo   [4/5] MindVault einrichten
echo.

echo   [→]  Backend-Pakete installieren...
cd /d "%SCRIPT_DIR%backend"
call npm install --loglevel=error
echo   [OK] Backend bereit

echo.
echo   [→]  Frontend-Pakete installieren...
cd /d "%SCRIPT_DIR%frontend"
call npm install --loglevel=error
echo   [OK] Frontend bereit

echo.
echo   [→]  Frontend wird gebaut...
call npm run build
echo   [OK] Frontend gebaut
echo.

:: ═══════════════════════════════════════════════════════════
:: STEP 5: Summary
:: ═══════════════════════════════════════════════════════════
echo   [5/5] Zusammenfassung
echo.
echo   ══════════════════════════════════════
echo     MindVault ist bereit!
echo   ══════════════════════════════════════
echo.

echo   Installiert:
where node >nul 2>&1 && (for /f "tokens=*" %%i in ('node -v') do echo   [OK] Node.js %%i) || echo   [X] Node.js
where npm >nul 2>&1 && (for /f "tokens=*" %%i in ('npm -v') do echo   [OK] npm %%i) || echo   [X] npm
where yt-dlp >nul 2>&1 && echo   [OK] yt-dlp || echo   [!] yt-dlp (nicht installiert)
where ffmpeg >nul 2>&1 && echo   [OK] ffmpeg || echo   [!] ffmpeg (nicht installiert)
echo   [OK] MindVault Backend
echo   [OK] MindVault Frontend
echo.

echo   Naechste Schritte:
echo.
echo   1. MindVault starten:   start.bat
echo   2. Browser oeffnen:     http://localhost:3000
echo   3. Telegram + AI:       setup-guide.html oeffnen
echo.
echo   ──────────────────────────────────────────
echo.

set /p STARTNOW="  MindVault jetzt starten? (j/n) "
if /i "%STARTNOW%"=="j" (
    echo.
    echo   [→] MindVault wird gestartet...
    start "" "%SCRIPT_DIR%setup-guide.html"
    cd /d "%SCRIPT_DIR%"
    call start.bat
)

endlocal
