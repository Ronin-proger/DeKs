@echo off
title Server FastAPI
pushd "%~dp0server"
if errorlevel 1 goto :err

echo.
echo ========================================
echo   Server: http://0.0.0.0:3001  (LAN: http://YOUR_IP:3001)
echo ========================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install from https://www.python.org
    goto :end
)

for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo Stopping old process on port 3001...
    taskkill /F /PID %%p >nul 2>&1
)

python -m pip install -r requirements.txt -q
python -m uvicorn main:app --host 0.0.0.0 --port 3001 --reload
goto :end

:err
echo [ERROR] Cannot open folder: %~dp0server

:end
echo.
pause
