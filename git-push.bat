@echo off
cd /d "%~dp0"

echo.
echo =========================================
echo   Zion Solutions - Sync & Push
echo =========================================
echo.

:: Stage everything first to prevent "unstaged changes" errors during pull
git add .

git status

echo.
set /p MSG=Enter commit message (Required): 

if "%MSG%"=="" (
    echo.
    echo [ERROR] Commit message is required.
    pause
    exit /b
)

echo Committing...
git commit -m "%MSG%"

echo Syncing with GitHub (Pulling remote changes)...
echo.
echo Syncing with GitHub...
git pull origin main --rebase

echo.
echo Pushing to GitHub...
git push origin main

echo.
echo =========================================
echo   Done! Your website is being updated.
echo =========================================
echo.
pause
