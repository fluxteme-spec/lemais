#!/bin/sh
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Instale o Node.js 20 ou superior: https://nodejs.org"; exit 1; }
echo "Instalando dependências (só demora na primeira vez)..."
npm install --no-fund --no-audit || exit 1
echo "Preparando o LêMais..."
npm run build || exit 1
( sleep 3; (open http://localhost:3000 || xdg-open http://localhost:3000) >/dev/null 2>&1 ) &
echo "LêMais rodando em http://localhost:3000 (Ctrl+C para parar)"
npm start
