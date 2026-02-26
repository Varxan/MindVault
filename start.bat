@echo off
chcp 65001 >nul
title MindVault

cls
echo.
echo   MindVault
echo   Starting services...
echo.

set "SCRIPT_DIR=%~dp0"

:: Start backend
echo   → Starting backend...
start "MindVault Backend" /min cmd /c "cd /d "%SCRIPT_DIR%backend" && node src/index.js"
echo   [OK] Backend running on port 3001

:: Start frontend
echo   → Starting frontend...
start "MindVault Frontend" /min cmd /c "cd /d "%SCRIPT_DIR%frontend" && npm run start"
echo   [OK] Frontend running on port 3000

echo.
echo   Open: http://localhost:3000
echo.
echo   Close this window to stop MindVault.
echo.
pause
taskkill /fi "WINDOWTITLE eq MindVault Backend" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq MindVault Frontend" /f >nul 2>&1
echo   MindVault stopped.
