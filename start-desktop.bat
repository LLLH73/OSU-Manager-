@echo off
chcp 65001 >nul
cd /d "%~dp0"

if exist "release\win-unpacked\osu-manager.exe" (
  start "" "%~dp0release\win-unpacked\osu-manager.exe"
  exit /b 0
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [OSU!Manager!] Installing dependencies / Electron binary...
  call npm install
  if not exist "node_modules\electron\dist\electron.exe" (
    node node_modules\electron\install.js
  )
)

if not exist "dist\index.html" call npm run build
if not exist "dist-server\index.js" call npm run build
if not exist "dist-electron\main.js" call npm run build

start "" "%~dp0node_modules\.bin\electron.cmd" "%~dp0"
