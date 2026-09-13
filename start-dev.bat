@echo off
start "Degrader Backend" cmd /k "cd /d %~dp0backend && cargo run"
timeout /t 1 >nul
start "Degrader Frontend" cmd /k "cd /d %~dp0frontend && npm install && npm run dev"
