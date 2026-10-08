@echo off
cd /d "%~dp0"
echo.
echo Starting Doubao phone tool...
echo Open on this computer: http://127.0.0.1:8790
echo Open on phone with same Wi-Fi: http://YOUR_COMPUTER_IP:8790
echo.
node server.js
