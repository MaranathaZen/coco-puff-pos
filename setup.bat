@echo off
echo ====================================
echo  Coco Puff Print Server v2.0 Setup
echo ====================================
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python tidak ditemukan!
    echo Download: https://www.python.org/downloads/
    echo Centang "Add Python to PATH" saat install
    pause & exit /b 1
)
echo [OK] Python ditemukan

echo Menginstall dependencies...
pip install flask flask-cors pywin32 pyopenssl pystray Pillow --quiet
echo [OK] Dependencies terinstall

echo Membuat auto-start saat Windows nyala...
set SCRIPT_DIR=%~dp0
set VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\CocoPuffPrint.vbs
echo Set oShell = CreateObject("WScript.Shell") > "%VBS%"
echo oShell.Run "python ""%SCRIPT_DIR%print_server.py""", 0, False >> "%VBS%"
echo [OK] Auto-start dibuat

echo.
echo ====================================
echo  Setup selesai!
echo.
echo  LANGKAH SELANJUTNYA:
echo  1. Jalankan: python print_server.py --debug
echo  2. Buka browser: https://localhost:5000/health
echo  3. Klik "Advanced" lalu "Proceed to localhost (unsafe)"
echo     (hanya sekali untuk accept certificate)
echo  4. Di kasir app: klik printer icon, pilih Desktop/Windows
echo     URL: https://localhost:5000, klik Test
echo ====================================
pause
