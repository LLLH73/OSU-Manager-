@echo off
chcp 65001 >nul
cd /d "%~dp0"

if exist "release\win-unpacked\osu-4k-downloader.exe" (
  start "" "%~dp0release\win-unpacked\osu-4k-downloader.exe"
  exit /b 0
)

if exist "node_modules\electron\dist\electron.exe" (
  if not exist "dist\index.html" call npm run build
  if not exist "dist-server\index.js" call npm run build
  if not exist "dist-electron\main.js" call npm run build
  start "" "%~dp0node_modules\.bin\electron.cmd" "%~dp0"
  exit /b 0
)

if not exist "node_modules" (
  echo [osu! 4K Downloader] Installing dependencies...
  call npm install
)

if not exist "dist\index.html" call npm run build
if not exist "dist-server\index.js" call npm run build

powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 3721 -State Listen -ErrorAction SilentlyContinue; if (-not $c) { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo [osu! 4K Downloader] Starting local server on http://127.0.0.1:3721 ...
  start "osu! 4K Downloader Backend" /MIN cmd /c "node dist-server\index.js"
  powershell -NoProfile -Command "for ($i=0; $i -lt 30; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3721/api/health' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 250 }"
)

set "URL=http://127.0.0.1:3721"

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=%URL%
  exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=%URL%
  exit /b 0
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=%URL%
  exit /b 0
)

start "" "%URL%"
