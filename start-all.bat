@echo off
title Start Project

echo.
echo Starting server and client...
echo Do NOT close the two black windows.
echo.

start "Server" cmd /k "%~dp0start-server.bat"
timeout /t 5 /nobreak >nul
start "Client" cmd /k "%~dp0start-client.bat"

echo Done. Check two new windows.
echo Browser: http://localhost:5173
echo Login - then open Messenger
echo.
pause
