"""
Coco Puff POS - Print Server v2.0
- HTTPS dengan self-signed certificate (fix mixed content block)
- ESC/P commands untuk font dot matrix yang bagus
- Jalan di background Windows tanpa terminal

Setup:
  pip install flask flask-cors pywin32 pyopenssl pystray Pillow
  python print_server.py

PENTING - pertama kali:
  Buka https://localhost:5000/health di browser
  Klik Advanced -> Proceed to localhost (unsafe)
  Ini hanya sekali untuk accept self-signed cert
"""

import sys, os, json, threading, time, ssl

if sys.platform == 'win32':
    import ctypes
    if '--debug' not in sys.argv:
        ctypes.windll.user32.ShowWindow(ctypes.windll.kernel32.GetConsoleWindow(), 0)

from flask import Flask, request, jsonify
from flask_cors import CORS

app  = Flask(__name__)
CORS(app, origins=['*'])

PORT      = 5000
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
LOG_FILE  = os.path.join(BASE_DIR, 'print_server.log')
CERT_FILE = os.path.join(BASE_DIR, 'cert.pem')
KEY_FILE  = os.path.join(BASE_DIR, 'key.pem')

# ESC/P commands EPSON dot matrix
ESC          = b'\x1b'
ESC_INIT     = ESC + b'@'
ESC_BOLD_ON  = ESC + b'E\x01'
ESC_BOLD_OFF = ESC + b'E\x00'
GS_CUT       = b'\x1d' + b'V\x41\x00'

def log(msg):
    ts   = time.strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except: pass

def generate_cert():
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        return True
    try:
        from OpenSSL import crypto
        k = crypto.PKey()
        k.generate_key(crypto.TYPE_RSA, 2048)
        c = crypto.X509()
        c.get_subject().CN = "localhost"
        c.set_serial_number(1000)
        c.gmtime_adj_notBefore(0)
        c.gmtime_adj_notAfter(10*365*24*3600)
        c.set_issuer(c.get_subject())
        c.set_pubkey(k)
        c.sign(k, 'sha256')
        open(CERT_FILE,'wb').write(crypto.dump_certificate(crypto.FILETYPE_PEM, c))
        open(KEY_FILE,'wb').write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
        log("SSL cert dibuat")
        return True
    except Exception as e:
        log(f"Gagal buat cert: {e} — fallback HTTP")
        return False

def build_escpos(text: str) -> bytes:
    """Plain UTF-8 tanpa ESC commands — persis seperti AppSheet"""
    # AppSheet hanya encode utf-8, tidak ada ESC/P sama sekali
    data = bytearray()
    data += text.encode('utf-8', errors='replace')
    data += b'\n' * 7
    return bytes(data)

def print_raw(text: str, printer_name: str = ""):
    try:
        import win32print
        pname = printer_name or win32print.GetDefaultPrinter()
        raw   = build_escpos(text)
        
        # Log 200 bytes pertama untuk debug
        log(f"Raw bytes (first 200): {raw[:200]}")
        log(f"Text sample: {repr(text[:100])}")
        
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
        return False, "pywin32 tidak terinstall: pip install pywin32"
    except Exception as e:
        log(f"Error: {e}")
        return False, str(e)

@app.route('/health')
def health():
    try:
        import win32print
        p = win32print.GetDefaultPrinter()
        return jsonify({"status":"ok","printer":p,"port":PORT})
    except Exception as e:
        return jsonify({"status":"ok","printer":str(e),"port":PORT})

@app.route('/printers')
def printers():
    try:
        import win32print
        ps = [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL|win32print.PRINTER_ENUM_CONNECTIONS)]
        return jsonify({"printers":ps,"default":win32print.GetDefaultPrinter()})
    except Exception as e:
        return jsonify({"printers":[],"error":str(e)})

@app.route('/print', methods=['POST','OPTIONS'])
def do_print():
    if request.method == 'OPTIONS': return '',204
    try:
        d    = request.get_json(force=True)
        text = d.get('text','')
        if not text: return jsonify({"ok":False,"error":"Empty"}),400
        ok, msg = print_raw(text, d.get('printer',''))
        return jsonify({"ok":ok,"message":msg})
    except Exception as e:
        return jsonify({"ok":False,"error":str(e)}),500

def run_tray():
    try:
        import pystray
        from PIL import Image, ImageDraw
        img  = Image.new('RGB',(64,64),(30,30,30))
        d    = ImageDraw.Draw(img)
        d.rectangle([8,8,56,56],(255,255,255))
        d.text((18,22),"CP",(30,30,30))
        menu = pystray.Menu(
            pystray.MenuItem("Coco Puff Print Server",None,enabled=False),
            pystray.MenuItem(f"port:{PORT}",None,enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Keluar",lambda i,item:(i.stop(),os._exit(0))),
        )
        pystray.Icon("CP",img,f"CP Print :{PORT}",menu).run()
    except: 
        while True: time.sleep(60)

if __name__ == '__main__':
    log("=== Coco Puff Print Server v2.0 ===")
    if sys.platform=='win32' and '--no-tray' not in sys.argv:
        threading.Thread(target=run_tray,daemon=True).start()
    use_https = generate_cert()
    if use_https:
        log("HTTPS mode: https://localhost:5000")
        log("Buka https://localhost:5000/health di browser, klik Advanced > Proceed to localhost")
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(CERT_FILE, KEY_FILE)
        app.run(host='0.0.0.0',port=PORT,ssl_context=ctx,debug='--debug' in sys.argv,use_reloader=False)
    else:
        log("HTTP mode: http://localhost:5000")
        app.run(host='0.0.0.0',port=PORT,debug='--debug' in sys.argv,use_reloader=False)
