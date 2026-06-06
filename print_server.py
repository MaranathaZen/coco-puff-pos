"""
Coco Puff POS - Print Server v1.0
Jalan di background Windows, listen localhost:5000
Terima data struk dari browser, print RAW ke printer dot matrix

Cara pakai:
  1. Install: pip install flask pywin32
  2. Jalankan: python print_server.py
  3. Browser otomatis kirim ke http://localhost:5000/print
"""

import sys
import os
import json
import threading
import time

# ── Sembunyikan console window di Windows ──────────────────────
if sys.platform == 'win32':
    import ctypes
    # Sembunyikan window kalau bukan debug mode
    if '--debug' not in sys.argv:
        ctypes.windll.user32.ShowWindow(ctypes.windll.kernel32.GetConsoleWindow(), 0)

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=['https://coco-puff-pos.vercel.app', 'http://localhost:*', 'http://127.0.0.1:*'])

# ── Konfigurasi ────────────────────────────────────────────────
PORT       = 5000
LOG_FILE   = os.path.join(os.path.dirname(__file__), 'print_server.log')
CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'config.json')

def log(msg: str):
    ts = time.strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except:
        pass

def load_config():
    default = {
        "printer_name": "",   # kosong = default printer
        "paper_width":  38,   # karakter per baris (76mm = 38, 58mm = 32)
        "cut_paper":    True, # auto cut setelah print
    }
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f:
                return {**default, **json.load(f)}
    except:
        pass
    return default

# ── Print RAW ke printer dot matrix ───────────────────────────
def print_raw(text: str, printer_name: str = "") -> tuple[bool, str]:
    try:
        import win32print
        import win32con

        # Pilih printer
        if printer_name:
            pname = printer_name
        else:
            pname = win32print.GetDefaultPrinter()

        log(f"Printing to: {pname}")
        log(f"Content ({len(text)} chars):\n{text[:200]}...")

        # Encode ke bytes (printer dot matrix pakai CP437 atau UTF-8)
        try:
            raw_bytes = text.encode('cp437', errors='replace')
        except:
            raw_bytes = text.encode('utf-8', errors='replace')

        # Buka printer dan kirim RAW
        hPrinter = win32print.OpenPrinter(pname)
        try:
            hJob = win32print.StartDocPrinter(hPrinter, 1, ("Struk Coco Puff", None, "RAW"))
            try:
                win32print.StartPagePrinter(hPrinter)
                win32print.WritePrinter(hPrinter, raw_bytes)
                win32print.EndPagePrinter(hPrinter)
            finally:
                win32print.EndDocPrinter(hPrinter)
        finally:
            win32print.ClosePrinter(hPrinter)

        log("Print berhasil")
        return True, "OK"

    except ImportError:
        # Fallback: pakai subprocess lp (Linux/Mac) atau notepad (Windows)
        log("win32print tidak tersedia, coba fallback...")
        try:
            import subprocess
            tmp_file = os.path.join(os.path.dirname(__file__), '_print_tmp.txt')
            with open(tmp_file, 'w', encoding='utf-8') as f:
                f.write(text)
            if sys.platform == 'win32':
                subprocess.Popen(['notepad', '/p', tmp_file], shell=True)
            else:
                subprocess.run(['lp', tmp_file])
            return True, "Fallback print"
        except Exception as e:
            return False, str(e)
    except Exception as e:
        log(f"Print error: {e}")
        return False, str(e)

# ── Endpoints ──────────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health():
    """Cek apakah print server aktif"""
    try:
        import win32print
        printer = win32print.GetDefaultPrinter()
        return jsonify({ "status": "ok", "printer": printer, "port": PORT })
    except ImportError:
        return jsonify({ "status": "ok", "printer": "unknown (win32print not installed)", "port": PORT })
    except Exception as e:
        return jsonify({ "status": "ok", "printer": f"error: {e}", "port": PORT })

@app.route('/printers', methods=['GET'])
def list_printers():
    """Daftar printer yang tersedia"""
    try:
        import win32print
        printers = [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
        default  = win32print.GetDefaultPrinter()
        return jsonify({ "printers": printers, "default": default })
    except Exception as e:
        return jsonify({ "printers": [], "error": str(e) })

@app.route('/print', methods=['POST', 'OPTIONS'])
def do_print():
    """Terima data struk dan print"""
    if request.method == 'OPTIONS':
        return '', 204

    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({"ok": False, "error": "No data"}), 400

        text         = data.get('text', '')
        printer_name = data.get('printer', '')

        if not text:
            return jsonify({"ok": False, "error": "Empty text"}), 400

        cfg = load_config()
        if not printer_name:
            printer_name = cfg.get('printer_name', '')

        ok, msg = print_raw(text, printer_name)
        return jsonify({"ok": ok, "message": msg})

    except Exception as e:
        log(f"Error: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route('/config', methods=['GET', 'POST'])
def config():
    """Baca atau update konfigurasi"""
    if request.method == 'GET':
        return jsonify(load_config())
    else:
        try:
            new_cfg = request.get_json(force=True)
            cfg = {**load_config(), **new_cfg}
            with open(CONFIG_FILE, 'w') as f:
                json.dump(cfg, f, indent=2)
            return jsonify({"ok": True, "config": cfg})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 500

# ── System tray icon (opsional) ────────────────────────────────
def run_tray():
    """Jalankan icon di system tray Windows"""
    try:
        import pystray
        from PIL import Image, ImageDraw

        # Buat icon sederhana (kotak hitam)
        img = Image.new('RGB', (64, 64), color=(30, 30, 30))
        draw = ImageDraw.Draw(img)
        draw.rectangle([16, 16, 48, 48], fill=(255, 255, 255))
        draw.text((20, 22), "CP", fill=(30, 30, 30))

        def on_quit(icon, item):
            icon.stop()
            os._exit(0)

        def on_status(icon, item):
            pass  # bisa tambah popup status

        menu = pystray.Menu(
            pystray.MenuItem("Coco Puff Print Server", on_status, enabled=False),
            pystray.MenuItem(f"Port: {PORT}", on_status, enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Keluar", on_quit),
        )
        icon = pystray.Icon("CocoPuffPrint", img, "Coco Puff Print Server", menu)
        icon.run()
    except ImportError:
        # pystray tidak tersedia — jalan tanpa tray icon
        log("pystray tidak tersedia, jalan tanpa tray icon")
        # Keep process alive
        while True:
            time.sleep(60)

# ── Main ───────────────────────────────────────────────────────
if __name__ == '__main__':
    log(f"=== Coco Puff Print Server v1.0 ===")
    log(f"Port: {PORT}")
    log(f"Config: {CONFIG_FILE}")

    # Jalankan tray icon di thread terpisah
    if sys.platform == 'win32' and '--no-tray' not in sys.argv:
        tray_thread = threading.Thread(target=run_tray, daemon=True)
        tray_thread.start()

    # Jalankan Flask server
    app.run(
        host='127.0.0.1',
        port=PORT,
        debug='--debug' in sys.argv,
        use_reloader=False,
    )
