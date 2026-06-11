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
python -c "import websockets, win32print, OpenSSL" >nul 2>&1
if errorlevel 1 (
    echo Menginstall dependency...
    pip install flask flask-cors pywin32 pyopenssl websockets pystray Pillow
    echo.
)

:: Cek apakah print server sudah jalan di port 7677
curl -k -s https://localhost:7677/health >nul 2>&1
if not errorlevel 1 (
    echo Print server sudah berjalan.
    goto open_browser
)

:: Jalankan print server v6
echo Memulai print server...
start /B python print_server_v6.py

:: Tunggu server ready max 8 detik
set /a count=0
:wait_loop
timeout /t 1 /nobreak >nul
curl -k -s https://localhost:7677/health >nul 2>&1
if not errorlevel 1 goto server_ready
set /a count+=1
if %count% lss 8 goto wait_loop

:server_ready
echo Print server OK.

:open_browser
:: Buka kasir langsung
echo Membuka kasir...
:: Buka di Chrome (paksa)
"C:\Program Files\Google\Chrome\Application\chrome.exe" --app=https://coco-puff-pos.vercel.app/kasir >nul 2>&1
if errorlevel 1 (
    :: Fallback ke browser default
    start https://coco-puff-pos.vercel.app/kasir
)

echo.
echo ============================================
echo   Coco Puff POS aktif
echo   Print server WSS: wss://localhost:7676
echo   Health check: https://localhost:7677/health
echo   Setting printer URL: https://localhost:7676
echo ============================================
echo.
exit
