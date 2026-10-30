@echo off
rem ---- Jockey Quote Sheet launcher ----
rem Starts a tiny local web server (so the browser is allowed to store your
rem quotes and photos) and opens the sheet in your default browser.
rem Close the small server window when you are done.

setlocal
cd /d "%~dp0"
set PORT=8788

start "Quote Sheet server" /min cmd /c "python -m http.server %PORT% --bind 127.0.0.1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/"

endlocal
