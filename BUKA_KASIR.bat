@echo off
title Coco Puff POS - Kasir
cd /d C:\CocoPuff

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
python -c "import flask, flask_cors, win32print, pystray, PIL, OpenSSL" >nul 2>&1
if errorlevel 1 (
    echo Menginstall dependency...
    pip install flask flask-cors pywin32 pyopenssl pystray Pillow
    echo.
)

:: Cek apakah print server sudah jalan
curl -k -s https://localhost:5000/health >nul 2>&1
if not errorlevel 1 (
    echo Print server sudah berjalan.
    goto open_browser
)

:: Jalankan print server
echo Memulai print server...
start /B python print_server.py

:: Tunggu server ready max 6 detik
set /a count=0
:wait_loop
timeout /t 1 /nobreak >nul
curl -k -s https://localhost:5000/health >nul 2>&1
if not errorlevel 1 goto server_ready
set /a count+=1
if %count% lss 6 goto wait_loop

:server_ready
echo Print server OK.

:open_browser
:: Buka health page dulu (accept cert), lalu kasir
echo Membuka kasir...
start https://localhost:5000/health
timeout /t 2 /nobreak >nul
start https://coco-puff-pos.vercel.app/kasir

echo.
echo ============================================
echo   Coco Puff POS aktif
echo   1. Di tab health: klik Advanced ^> Proceed
echo   2. Kembali ke tab kasir
echo   Icon CP di system tray = print server aktif
echo ============================================
echo.
exit
