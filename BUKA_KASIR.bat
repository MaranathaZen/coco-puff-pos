@echo off
:: Buka kasir dengan izin akses localhost HTTPS
:: Simpan file ini di Desktop, klik 2x untuk buka kasir

:: Cari Chrome
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% (
    :: Coba di user profile
    set CHROME="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
)

:: Buka kasir dengan flag allow localhost
start "" %CHROME% ^
  --allow-insecure-localhost ^
  --unsafely-treat-insecure-origin-as-secure=https://localhost:5000 ^
  --app=https://coco-puff-pos.vercel.app/kasir

:: Tunggu 2 detik lalu jalankan print server (kalau belum jalan)
timeout /t 2 /nobreak >nul
cd /d "%~dp0"
python print_server.py 2>nul
