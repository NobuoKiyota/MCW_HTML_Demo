@echo off
REM Fighter Generator: one-click launcher.
REM Starts the Vite dev server and opens the tool in the default browser.

cd /d "%~dp0"

if not exist "node_modules" (
    echo [fighter-generator] node_modules not found, running npm install...
    call npm install
)

start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"

echo [fighter-generator] Starting dev server on http://localhost:3000 ...
call npm run dev

pause
