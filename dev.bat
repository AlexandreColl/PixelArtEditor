@echo off
cd /d "%~dp0"
echo Starting Pixel Art Editor in development mode...
call pnpm run tauri:dev
if %errorlevel% neq 0 (
  echo.
  echo Dev server failed. Check the errors above.
  pause
  exit /b %errorlevel%
)
