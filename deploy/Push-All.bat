@echo off
setlocal
cd /d "%~dp0.."

echo.
echo  CMS Multi-Church Deploy
echo  -----------------------
echo   1^) Push all remotes + Vercel prod ^(clients with vercelDeploy^)
echo   2^) Push all remotes only ^(skip Vercel CLI^)
echo   3^) Dry run ^(show what would happen^)
echo   4^) St Pauls only ^(push + Vercel^)
echo   5^) Exit
echo.

choice /C 12345 /N /M "Select [1-5]: "
set "OPT=%ERRORLEVEL%"

if "%OPT%"=="5" goto :eof
if "%OPT%"=="4" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Push-All.ps1" -Only stpauls
  goto :end
)
if "%OPT%"=="3" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Push-All.ps1" -DryRun
  goto :end
)
if "%OPT%"=="2" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Push-All.ps1" -SkipVercel
  goto :end
)
if "%OPT%"=="1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Push-All.ps1"
  goto :end
)

:end
echo.
pause
