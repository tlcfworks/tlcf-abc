@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0bin\abc.js" %*
  if errorlevel 1 pause
  exit /b
)
node --version >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 or later, then run this launcher again.
  pause
  exit /b 1
)
if not exist "%~dp0dist\src\server.js" (
  echo From this folder, run npm ci and npm run build once. Then start ABC again.
  pause
  exit /b 1
)
node "%~dp0bin\abc.js" %*
if errorlevel 1 pause
