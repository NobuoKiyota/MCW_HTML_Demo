@'
@echo off
cd /d "%~dp0"
echo Launching Cloud Generator...
echo.
python cloud_generator_gui.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ====================================
    echo [ERROR] Application failed to start.
    echo ====================================
)
pause
'@ | Out-File -FilePath .\run_cloud_generator.bat -Encoding ascii