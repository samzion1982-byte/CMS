@echo off
cd /d "%~dp0"

echo.
echo =========================================
echo   Church CMS - Push to GitHub
echo =========================================
echo.

git status

echo.
set /p MSG=Enter commit message:

if "%MSG%"=="" (
    echo No message entered. Aborting.
    pause
    exit /b
)

echo.
echo Adding all changes...
git add .

echo Committing...
git commit -m "%MSG%"

echo Pushing to GitHub...
git push

echo.
echo =========================================
echo   Done! GitHub is up to date.
echo =========================================
echo.
pause
