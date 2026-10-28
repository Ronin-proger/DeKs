@echo off
title Start Project

echo.
echo Preferred: docker compose up -d --build
echo This script starts a local non-Docker API and client.
echo Do NOT close the two black windows.
echo.

start "Server" cmd /k "%~dp0start-server.bat"
timeout /t 5 /nobreak >nul
start "Client" cmd /k "%~dp0start-client.bat"

echo Done. Check two new windows.
echo Browser: http://localhost:5173
echo.
pause
