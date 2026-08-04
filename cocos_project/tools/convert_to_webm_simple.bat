@echo off
if "%~1"=="" (
    echo Drop MP4 file onto this bat file to convert to WebM.
    pause
    exit /b
)

:loop
if "%~1"=="" goto end
echo --------------------------------------------------
echo Converting: "%~1" -> "%~dpn1.webm"
echo --------------------------------------------------

ffmpeg -i "%~1" -c:v libvpx-vp9 -crf 30 -b:v 0 -pix_fmt yuv420p -row-mt 1 -an -y "%~dpn1.webm"

shift
goto loop

:end
echo --------------------------------------------------
echo Conversion Complete!
pause
