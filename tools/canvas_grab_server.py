# ヘッドレス検証用: ブラウザのcanvasをdataURLでPOSTさせてJPEG保存する受け口。
# プレビューが非表示(document.hidden)でscreenshotが撮れない時に使う。
# 使い方: python tools/canvas_grab_server.py [出力ディレクトリ] [ポート]
#   ブラウザ側: fetch('http://127.0.0.1:8129/', {method:'POST', headers:{'Content-Type':'application/json'},
#                body: JSON.stringify({ 名前: canvas.toDataURL('image/jpeg', 0.7) })})
import base64, json, os, re, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'shots')
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8129
os.makedirs(OUT, exist_ok=True)

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        data = json.loads(self.rfile.read(n))
        saved = []
        for name, durl in data.items():
            safe = re.sub(r'[^A-Za-z0-9_-]', '', name)
            with open(os.path.join(OUT, safe + '.jpg'), 'wb') as f:
                f.write(base64.b64decode(durl.split(',', 1)[1]))
            saved.append(safe + '.jpg')
        self.send_response(200); self._cors()
        self.send_header('Content-Type', 'application/json'); self.end_headers()
        self.wfile.write(json.dumps({'saved': saved, 'dir': OUT}).encode())

    def log_message(self, *a):
        pass

print(f'canvas grab server on 127.0.0.1:{PORT} -> {OUT}')
HTTPServer(('127.0.0.1', PORT), H).serve_forever()
