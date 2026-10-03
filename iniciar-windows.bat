@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Instale o Node.js 20 ou superior: https://nodejs.org & pause & exit /b 1)
echo Instalando dependencias (so demora na primeira vez)...
call npm install --no-fund --no-audit || (pause & exit /b 1)
echo Preparando o LeMais...
call npm run build || (pause & exit /b 1)
start "" http://localhost:3000
echo LeMais rodando em http://localhost:3000  (feche esta janela para parar)
call npm start
