@echo off
title Client React
pushd "%~dp0client"
if errorlevel 1 goto :err

echo.
echo ========================================
echo   Open in browser the link below
echo   Usually: http://localhost:5173  (LAN: http://YOUR_IP:5173)
echo ========================================
echo.

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    goto :end
)

if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
)

call npm run dev
goto :end

:err
echo [ERROR] Cannot open folder: %~dp0client

:end
echo.
pause
