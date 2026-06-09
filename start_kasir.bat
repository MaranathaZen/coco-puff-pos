@echo off
title Coco Puff POS - Kasir
cd /d C:\coco_puff_pos

:: Cek Python tersedia
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python tidak ditemukan!
    echo Install Python dari https://python.org
    echo Pastikan centang "Add Python to PATH" saat install
    pause
    exit /b
)

:: Cek dependency
python -c "import flask, flask_cors, win32print, flask_sock" >nul 2>&1
if errorlevel 1 (
    echo Menginstall dependency...
    pip install flask flask-cors pywin32 flask-sock pystray Pillow
    echo.
)

:: Cek apakah print server sudah jalan di port 7676
curl -s http://localhost:7676/health >nul 2>&1
if not errorlevel 1 (
    echo Print server sudah berjalan.
    goto open_browser
)

:: Jalankan print server v4
echo Memulai print server...
start /B python print_server_v4.py

:: Tunggu server ready max 8 detik
set /a count=0
:wait_loop
timeout /t 1 /nobreak >nul
curl -s http://localhost:7676/health >nul 2>&1
if not errorlevel 1 goto server_ready
set /a count+=1
if %count% lss 8 goto wait_loop

:server_ready
echo Print server OK di port 7676.

:open_browser
:: Buka aplikasi kasir langsung - tidak perlu accept cert lagi
echo Membuka kasir...
start https://coco-puff-pos.vercel.app/kasir

echo.
echo ============================================
echo   Coco Puff POS aktif
echo   Print server: http://localhost:7676
echo   Icon CP di system tray = print server aktif
echo   Setting printer: http://localhost:7676
echo ============================================
echo.
exit
