@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer from https://nodejs.org and try again.
  pause
  exit /b 1
)
if not exist "node_modules\express\package.json" (
  echo Installing game packages. Internet is needed for this first setup only.
  call npm install
  if errorlevel 1 (
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo Keep this window open while playing.
node server.js --open
pause
