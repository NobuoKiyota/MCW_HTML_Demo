@echo off
REM Fighter Gen addon: one-click reinstall to every detected Blender version.
REM After this finishes, just restart Blender -- no manual disable/enable needed.

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_addon.ps1"
pause
