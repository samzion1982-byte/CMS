@echo off
cd /d "%~dp0"

setlocal enabledelayedexpansion

echo.
echo =========================================
echo   Zion Solutions - Commit & Push Helper
echo =========================================
echo.

:: Determine current branch
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%b"
if not defined BRANCH (
  echo [ERROR] Unable to determine current git branch. Make sure this folder is a git repository.
  pause
  exit /b
)

echo Current branch: !BRANCH!

echo.

echo Staging all changes...
git add .

git status --short

echo.
set /p MSG=Enter commit message (required): 
if "%MSG%"=="" (
  echo.
  echo [ERROR] Commit message is required.
  pause
  exit /b
)

echo.
echo Committing changes...
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo [WARN] Commit did not succeed. If there are no staged changes, this may be OK.
) else (
  echo Commit created successfully.
)

echo.
echo Pulling remote updates for !BRANCH!...
git pull origin !BRANCH! --rebase
if errorlevel 1 (
  echo.
  echo [ERROR] Pull failed. Resolve any merge/rebase issues and run the script again.
  pause
  exit /b
)

echo.
echo Pushing to remote origin !BRANCH!...
git push origin !BRANCH!
if errorlevel 1 (
  echo.
  echo [ERROR] Push failed. Check your network or repository permissions.
  pause
  exit /b
)

echo.
echo =========================================
echo   Done! Changes pushed to origin/!BRANCH!.
echo =========================================
echo.
pause
