@echo off
cd /d "%~dp0"
echo Building Pixel Art Editor...
call pnpm run tauri:build
if %errorlevel% neq 0 (
  echo.
  echo Build failed. Check the errors above.
  pause
  exit /b %errorlevel%
)
echo.
echo Build complete! Executable at src-tauri\target\release\app.exe
pause
