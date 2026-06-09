"""
Coco Puff POS - Print Server v4.0
- WebSocket based — works di Chrome versi berapapun
- Tidak butuh SSL, tidak butuh flag Chrome
- HTTP + WebSocket di port 7676

Setup:
  pip install flask flask-cors flask-sock pywin32 pystray Pillow
  python print_server_v4.py
"""

import sys, os, threading, time, json

if sys.platform == 'win32':
    import ctypes
    if '--debug' not in sys.argv:
        ctypes.windll.user32.ShowWindow(
            ctypes.windll.kernel32.GetConsoleWindow(), 0)

from flask import Flask, request, jsonify
from flask_cors import CORS

try:
    from flask_sock import Sock
    HAS_SOCK = True
except ImportError:
    HAS_SOCK = False

app  = Flask(__name__)
CORS(app, origins=['*'])
if HAS_SOCK:
    sock = Sock(app)

PORT     = 7676
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, 'print_server.log')

ESC      = b'\x1b'
ESC_INIT = ESC + b'@'

def log(msg):
    ts   = time.strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except: pass

def build_escpos(text: str) -> bytes:
    data = bytearray()
    data += ESC_INIT
    data += b'\x1b\x43\x00'
    data += b'\x1b\x4e\x00'
    data += text.encode('utf-8', errors='replace')
    data += b'\n' * 4
    return bytes(data)

def print_raw(text: str, printer_name: str = ""):
    try:
        import win32print
        pname = printer_name or win32print.GetDefaultPrinter()
        raw   = build_escpos(text)
        hp    = win32print.OpenPrinter(pname)
        try:
            win32print.StartDocPrinter(hp, 1, ("Struk", None, "RAW"))
            win32print.StartPagePrinter(hp)
            win32print.WritePrinter(hp, raw)
            win32print.EndPagePrinter(hp)
            win32print.EndDocPrinter(hp)
        finally:
            win32print.ClosePrinter(hp)
        log("Print OK")
        return True, "OK"
    except ImportError:
        return False, "pywin32 tidak terinstall"
    except Exception as e:
        log(f"Error: {e}")
        return False, str(e)

def get_printer_name():
    try:
        import win32print
        return win32print.GetDefaultPrinter()
    except:
        return "Unknown"

# ── REST endpoints (fallback) ─────────────────────────────────
@app.route('/health')
def health():
    return jsonify({"status": "ok", "printer": get_printer_name(), "port": PORT, "ws": HAS_SOCK})

@app.route('/print', methods=['POST', 'OPTIONS'])
def do_print():
    if request.method == 'OPTIONS':
        return '', 204
    try:
        d    = request.get_json(force=True)
        text = d.get('text', '')
        if not text:
            return jsonify({"ok": False, "error": "Empty"}), 400
        ok, msg = print_raw(text, d.get('printer', ''))
        return jsonify({"ok": ok, "message": msg})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

# ── WebSocket endpoint ────────────────────────────────────────
if HAS_SOCK:
    @sock.route('/ws')
    def ws_handler(ws):
        log("WebSocket client terhubung")
        try:
            while True:
                data = ws.receive(timeout=60)
                if data is None:
                    break
                try:
                    # Handle both str and bytes
                    if isinstance(data, bytes):
                        data = data.decode('utf-8')
                    msg = json.loads(data)
                    if msg.get('type') == 'health':
                        resp = json.dumps({
                            "type": "health",
                            "status": "ok",
                            "printer": get_printer_name(),
                            "port": PORT
                        })
                        ws.send(resp)
                    elif msg.get('type') == 'print':
                        text = msg.get('text', '')
                        printer = msg.get('printer', '')
                        ok, result = print_raw(text, printer)
                        resp = json.dumps({
                            "type": "print_result",
                            "ok": ok,
                            "message": result
                        })
                        ws.send(resp)
                    else:
                        ws.send(json.dumps({"type": "error", "message": "Unknown type"}))
                except json.JSONDecodeError as je:
                    log(f"JSON error: {je}, data: {repr(data[:100])}")
                    ws.send(json.dumps({"type": "error", "message": "Invalid JSON"}))
        except Exception as e:
            log(f"WebSocket error: {e}")
        log("WebSocket client disconnect")

def run_tray():
    try:
        import pystray
        from PIL import Image, ImageDraw
        img  = Image.new('RGB', (64, 64), (30, 30, 30))
        d    = ImageDraw.Draw(img)
        d.rectangle([8, 8, 56, 56], (255, 255, 255))
        d.text((18, 22), "CP", (30, 30, 30))
        menu = pystray.Menu(
            pystray.MenuItem("Coco Puff Print Server v4", None, enabled=False),
            pystray.MenuItem(f"port:{PORT}", None, enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Keluar", lambda i, item: (i.stop(), os._exit(0))),
        )
        pystray.Icon("CP", img, f"CP Print :{PORT}", menu).run()
    except:
        while True: time.sleep(60)

if __name__ == '__main__':
    log("=== Coco Puff Print Server v4.0 ===")
    log(f"HTTP + WebSocket: ws://localhost:{PORT}/ws")
    log(f"Health check: http://localhost:{PORT}/health")
    if not HAS_SOCK:
        log("WARNING: flask-sock tidak terinstall!")
        log("Jalankan: pip install flask-sock")

    if sys.platform == 'win32' and '--no-tray' not in sys.argv:
        threading.Thread(target=run_tray, daemon=True).start()

    app.run(
        host='0.0.0.0',
        port=PORT,
        debug='--debug' in sys.argv,
        use_reloader=False
    )
