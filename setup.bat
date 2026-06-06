@echo off
echo ====================================
echo  Coco Puff Print Server - Setup
echo ====================================
echo.

:: Cek Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python tidak ditemukan!
    echo Download di: https://www.python.org/downloads/
    echo Pastikan centang "Add Python to PATH" saat install
    pause
    exit /b 1
)

echo [OK] Python ditemukan
echo.
echo Menginstall dependencies...
pip install flask flask-cors pywin32 pystray Pillow --quiet
if %errorlevel% neq 0 (
    echo [ERROR] Gagal install dependencies
    pause
    exit /b 1
)

echo [OK] Dependencies terinstall
echo.
echo Membuat shortcut startup...

:: Buat file VBS untuk jalankan tanpa terminal window
set SCRIPT_DIR=%~dp0
set VBS_FILE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\CocoPuffPrint.vbs

echo Set oShell = CreateObject("WScript.Shell") > "%VBS_FILE%"
echo oShell.Run "python %SCRIPT_DIR%print_server.py", 0, False >> "%VBS_FILE%"

echo [OK] Shortcut dibuat di Startup folder
echo.
echo ====================================
echo  Setup selesai!
echo  Print server akan auto-start saat Windows menyala
echo  
echo  Untuk test sekarang, jalankan:
echo    python print_server.py --debug
echo ====================================
pause
