@echo off
rem ---- Jockey Quote Sheet, reachable from your phone on the same wifi ----
rem Opens the sheet on this PC AND prints the address to type on your phone.
rem Windows may ask once to allow Python through the firewall - say Yes.

setlocal
cd /d "%~dp0"
set PORT=8788

start "Quote Sheet server (LAN)" /min cmd /c "python -m http.server %PORT% --bind 0.0.0.0"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/"

echo.
echo  On your phone, open:  http://YOUR-PC-IP:%PORT%/
echo.
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  for /f "tokens=* delims= " %%B in ("%%A") do echo    http://%%B:%PORT%/
)
echo.
pause
endlocal
