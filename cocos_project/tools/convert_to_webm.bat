@echo off
chcp 65001 >nul
title MP4 to WebM High-Quality Converter

if "%~1"=="" (
    echo ====================================================
    echo  MP4 to WebM High-Quality Converter
    echo ====================================================
    echo  MP4ファイルをこのバッチファイル (.bat) のアイコンへ
    echo  ドラッグ^&ドロップしてください。
    echo ====================================================
    pause
    exit /b
)

:process_loop
if "%~1"=="" (
    echo ====================================================
    echo すべての変換処理が完了しました。
    echo ====================================================
    pause
    exit /b
)

set "INPUT_FILE=%~1"
set "OUTPUT_FILE=%~dpn1.webm"

echo ----------------------------------------------------
echo [変換開始] %~nx1 -^> %~n1.webm
echo 高画質 VP9 エンコード中 (背景動画用に最適化)...
echo ----------------------------------------------------

ffmpeg -i "%INPUT_FILE%" -c:v libvpx-vp9 -crf 30 -b:v 0 -pix_fmt yuv420p -row-mt 1 -an -y "%OUTPUT_FILE%"

if %ERRORLEVEL% equ 0 (
    echo.
    echo [成功] 変換が完了しました: "%OUTPUT_FILE%"
) else (
    echo.
    echo [エラー] 変換に失敗しました。
)

echo.
shift
goto process_loop
