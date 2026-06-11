"""
Coco Puff POS - Print Server v6.0
- Pakai library 'websockets' yang dedicated (bukan flask-sock)
- WSS di port 7676, HTTP health di port 7677
- Self-signed cert otomatis dibuat

Setup:
  pip install websockets pywin32 pyopenssl pystray Pillow
  python print_server_v6.py
"""

import sys, os, threading, time, json, ssl, asyncio

if sys.platform == 'win32':
    import ctypes
    if '--debug' not in sys.argv:
        ctypes.windll.user32.ShowWindow(
            ctypes.windll.kernel32.GetConsoleWindow(), 0)

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
LOG_FILE  = os.path.join(BASE_DIR, 'print_server.log')
CERT_FILE = os.path.join(BASE_DIR, 'cert.pem')
KEY_FILE  = os.path.join(BASE_DIR, 'key.pem')
WS_PORT   = 7676
HTTP_PORT = 7677

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

def make_cert():
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        return True
    try:
        from OpenSSL import crypto
        k = crypto.PKey()
        k.generate_key(crypto.TYPE_RSA, 2048)
        cert = crypto.X509()
        cert.get_subject().CN = "localhost"
        cert.set_serial_number(1000)
        cert.gmtime_adj_notBefore(0)
        cert.gmtime_adj_notAfter(365 * 24 * 60 * 60 * 10)
        cert.set_issuer(cert.get_subject())
        cert.set_pubkey(k)
        try:
            cert.add_extensions([
                crypto.X509Extension(b"subjectAltName", False, b"DNS:localhost,IP:127.0.0.1"),
            ])
        except: pass
        cert.sign(k, 'sha256')
        with open(CERT_FILE, 'wb') as f:
            f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
        with open(KEY_FILE, 'wb') as f:
            f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
        log("SSL cert dibuat")
        return True
    except Exception as e:
        log(f"Gagal buat cert: {e}")
        return False

def build_escpos(text: str, printer_name: str = "") -> bytes:
    data = bytearray()
    data += ESC_INIT
    data += b'\x1b\x43\x00'
    data += b'\x1b\x4e\x00'
    # TM-T82 (thermal 80mm) — tambah margin kiri 2 spasi
    is_t82 = 'T82' in printer_name.upper() or 'TM-T' in printer_name.upper()
    if is_t82:
        lines = text.split('\n')
        text = '\n'.join('  ' + line for line in lines)
    data += text.encode('utf-8', errors='replace')
    data += b'\n' * 4
    return bytes(data)

def print_raw(text: str, printer_name: str = ""):
    try:
        import win32print
        pname = printer_name or win32print.GetDefaultPrinter()
        raw   = build_escpos(text, pname)
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
        log(f"Error print: {e}")
        return False, str(e)

def get_printer_name():
    try:
        import win32print
        return win32print.GetDefaultPrinter()
    except:
        return "Unknown"

# ── HTTP health server (port 7677) ────────────────────────────
def run_http_server():
    import http.server, socketserver
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps({
                "status": "ok",
                "printer": get_printer_name(),
                "port": WS_PORT,
                "ws": True
            }).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', len(body))
            self.end_headers()
            self.wfile.write(body)
        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
        def log_message(self, *args): pass

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(CERT_FILE, KEY_FILE)
    with socketserver.TCPServer(('0.0.0.0', HTTP_PORT), Handler) as httpd:
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        log(f"HTTP health: https://localhost:{HTTP_PORT}/health")
        httpd.serve_forever()

# ── WSS WebSocket server (port 7676) ─────────────────────────
async def ws_handler(websocket):
    log(f"WSS client terhubung: {websocket.remote_address}")
    try:
        async for message in websocket:
            try:
                if isinstance(message, bytes):
                    message = message.decode('utf-8')
                msg = json.loads(message)
                if msg.get('type') == 'health':
                    await websocket.send(json.dumps({
                        "type": "health",
                        "status": "ok",
                        "printer": get_printer_name(),
                        "port": WS_PORT
                    }))
                elif msg.get('type') == 'print':
                    ok, result = print_raw(msg.get('text', ''), msg.get('printer', ''))
                    await websocket.send(json.dumps({
                        "type": "print_result",
                        "ok": ok,
                        "message": result
                    }))
                else:
                    await websocket.send(json.dumps({"type": "error", "message": "Unknown"}))
            except json.JSONDecodeError:
                await websocket.send(json.dumps({"type": "error", "message": "Invalid JSON"}))
    except Exception as e:
        log(f"WS error: {e}")
    log("WSS client disconnect")

async def run_ws_server():
    import websockets
    ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_ctx.load_cert_chain(CERT_FILE, KEY_FILE)
    async with websockets.serve(ws_handler, '0.0.0.0', WS_PORT, ssl=ssl_ctx):
        log(f"WSS server: wss://localhost:{WS_PORT}/ws")
        await asyncio.Future()  # run forever

def run_tray():
    try:
        import pystray
        from PIL import Image, ImageDraw
        img = Image.new('RGB', (64, 64), (30, 30, 30))
        d   = ImageDraw.Draw(img)
        d.rectangle([8, 8, 56, 56], (255, 255, 255))
        d.text((18, 22), "CP", (30, 30, 30))
        menu = pystray.Menu(
            pystray.MenuItem("Coco Puff Print Server v6", None, enabled=False),
            pystray.MenuItem(f"WSS:{WS_PORT}", None, enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Keluar", lambda i, item: (i.stop(), os._exit(0))),
        )
        pystray.Icon("CP", img, f"CP Print v6", menu).run()
    except:
        while True: time.sleep(60)

def open_browser_once():
    flag = os.path.join(BASE_DIR, '.cert_accepted_v6')
    if os.path.exists(flag): return
    time.sleep(2)
    import subprocess
    subprocess.Popen(['start', f'https://localhost:{HTTP_PORT}/health'], shell=True)
    with open(flag, 'w') as f: f.write('ok')

if __name__ == '__main__':
    log("=== Coco Puff Print Server v6.0 ===")

    if not make_cert():
        log("ERROR: Gagal buat SSL cert. Install pyopenssl: pip install pyopenssl")
        input("Tekan Enter untuk keluar...")
        sys.exit(1)

    log(f"WSS WebSocket : wss://localhost:{WS_PORT}")
    log(f"HTTPS Health  : https://localhost:{HTTP_PORT}/health")
    log("")
    log("PENTING - Lakukan SEKALI di Chrome:")
    log(f"Buka https://localhost:{HTTP_PORT}/health")
    log("Klik Advanced > Proceed to localhost")

    # Start HTTP health server di thread terpisah
    threading.Thread(target=run_http_server, daemon=True).start()

    # Auto buka browser untuk accept cert
    threading.Thread(target=open_browser_once, daemon=True).start()

    # Start system tray
    if sys.platform == 'win32' and '--no-tray' not in sys.argv:
        threading.Thread(target=run_tray, daemon=True).start()

    # Run WebSocket server (asyncio)
    asyncio.run(run_ws_server())
