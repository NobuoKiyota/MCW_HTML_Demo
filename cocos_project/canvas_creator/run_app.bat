@echo off
cd /d "%~dp0"
echo ===================================================
echo   White-Black Frame Generator - Initializing...
echo ===================================================

if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo Failed to create virtual environment. Please check if Python is installed and in your PATH.
        pause
        exit /b 1
    )
)

echo Activating virtual environment...
call venv\Scripts\activate

echo Checking/Installing dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
)

echo Starting White-Black Frame Generator...
python main.py
if errorlevel 1 (
    echo App exited with an error.
    pause
)
deactivate
