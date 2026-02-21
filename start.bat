@echo off
chcp 65001 >nul
title Rio Bravo - Preparar e subir projeto

echo.
echo ========================================
echo   Preparando projeto
echo ========================================
echo.

echo [1/3] Git pull...
git pull
if errorlevel 1 (
  echo Aviso: git pull falhou ou nao e um repositorio git.
)
echo.

echo [2/3] npm install...
call npm install
if errorlevel 1 (
  echo Erro no npm install.
  pause
  exit /b 1
)
echo.

echo [3/3] IP(s) na rede ^(use no celular/outro PC^):
echo ----------------------------------------
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
  set "addr=%%a"
  setlocal enabledelayedexpansion
  echo   !addr!
  endlocal
)
echo ----------------------------------------
echo URLs ^(substitua 192.168.x.x pelo seu IP acima^):
echo   App:        http://192.168.x.x:5173
echo   Admin:      http://192.168.x.x:5173/admin.html
echo   Dashboard:  http://192.168.x.x:5173/dashboard.html
echo   Estoque:    http://192.168.x.x:5173/estoque-manual.html
echo ========================================
echo.

echo Iniciando Vite + servidor (--host)...
echo.
call npm run dev:host

pause
