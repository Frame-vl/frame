"""Live chat -> field API -> real Apply -> fresh IndexedDB -> document replay.
Uses production frontend bytes pinned to a commit, an isolated Edge profile,
and the isolated candidate passed by the field gate. Never opens owner storage.
"""
from __future__ import annotations
import json
import os
import secrets
import shutil
import socket
import struct
import base64
import urllib.parse
import subprocess
import tempfile
import threading
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

FRONTEND_REF = os.environ.get("GITHUB_SHA", "baebc9144d4b3e8491f2d4eaac7f8c603e552a37")
FILES = ["app.js", "ai-chat.js", "ai-guard.js", "ai-safety.js", "owner-reset.js"]
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ci import load_machine_env, assert_runner
URL = "http://127.0.0.1:8788"
TOKEN = load_machine_env("FRAME_AI_TOKEN")
NONCE = secrets.token_urlsafe(24)
RESULT = {}
DONE = threading.Event()
COST = 0.0
CALLS = 0
STATIC = {}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def reply(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "null")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def do_OPTIONS(self):
        self.reply(200, {})
    def do_GET(self):
        prefix="/"+NONCE+"/"
        name=self.path.removeprefix(prefix)
        if self.path.startswith(prefix) and name in STATIC:
            data=STATIC[name]
            self.send_response(200)
            self.send_header("Content-Type","text/html; charset=utf-8" if name.endswith(".html") else "application/javascript; charset=utf-8")
            self.send_header("Content-Length",str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.forward()
    def do_POST(self):
        global COST, CALLS
        if self.path in ("/"+NONCE+"/result", "/"+NONCE+"/progress"):
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            if self.path.endswith("/result"):
                RESULT.update(body)
                DONE.set()
            else:
                print("BROWSER_STEP "+str(body.get("step")), flush=True)
            self.reply(200, {"ok":True})
            return
        self.forward()
    def forward(self):
        global COST, CALLS
        print("BRIDGE_REQUEST "+self.command+" "+self.path.removeprefix("/"+NONCE),flush=True)
        prefix = "/frame-field"
        suffix = self.path.removeprefix(prefix)
        if not self.path.startswith(prefix) or suffix not in ("/health","/analyze") or self.headers.get("Authorization") != "Bearer "+NONCE:
            self.reply(403, {"ok":False})
            return
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0))) if self.command == "POST" else None
        if suffix == "/analyze":
            CALLS += 1
            if CALLS > 25:
                self.reply(429, {"ok":False, "message":"Browser replay call cap reached"})
                return
        try:
            req = urllib.request.Request(URL+suffix, data=raw, headers={"Authorization":"Bearer "+TOKEN,"Content-Type":"application/json"}, method=self.command)
            with urllib.request.urlopen(req, timeout=100) as response:
                body = json.load(response)
            COST += float(body.get("meta",{}).get("estimated_usd") or 0)
            self.reply(200, body)
        except Exception as exc:
            self.reply(502, {"ok":False,"message":type(exc).__name__+": "+str(exc)})


class BrowserConsole:
    """Small local CDP client; no browser credentials or external packages."""
    def __init__(self, port):
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=3) as r:
            pages=json.load(r)
        page=next(x for x in pages if x.get("type")=="page")
        target=urllib.parse.urlsplit(page["webSocketDebuggerUrl"])
        self.sock=socket.create_connection(("127.0.0.1",port),timeout=5)
        key=base64.b64encode(secrets.token_bytes(16)).decode()
        request=f"GET {target.path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        self.sock.sendall(request.encode())
        response=b""
        while not response.endswith(b"\r\n\r\n"):
            response+=self.sock.recv(1)
        if b" 101 " not in response.split(b"\r\n",1)[0]:
            raise RuntimeError("CDP handshake rejected")
        self.seq=0
    def read(self,n):
        result=b""
        while len(result)<n:
            chunk=self.sock.recv(n-len(result))
            if not chunk:
                raise RuntimeError("CDP connection closed")
            result+=chunk
        return result
    def call(self,method,params):
        self.seq+=1
        data=json.dumps({"id":self.seq,"method":method,"params":params}).encode()
        mask=secrets.token_bytes(4)
        length=len(data)
        header=bytes([0x81,0x80|length]) if length<126 else bytes([0x81,0x80|126])+struct.pack("!H",length)
        self.sock.sendall(header+mask+bytes(c^mask[i%4] for i,c in enumerate(data)))
        while True:
            first,second=self.read(2)
            length=second&127
            if length==126:length=struct.unpack("!H",self.read(2))[0]
            elif length==127:length=struct.unpack("!Q",self.read(8))[0]
            payload=self.read(length)
            if first&15==8:raise RuntimeError("CDP closed")
            if first&15!=1:continue
            message=json.loads(payload)
            if message.get("id")==self.seq:
                if message.get("error"):raise RuntimeError(str(message["error"]))
                return message.get("result",{})
    def evaluate(self,expression):
        return self.call("Runtime.evaluate",{"expression":expression,"returnByValue":True}).get("result",{}).get("value")
    def close(self):
        self.sock.close()


def main():
    assert_runner()
    if not TOKEN:
        raise RuntimeError("FRAME token unavailable on browser runner")
    with urllib.request.urlopen(urllib.request.Request(URL+"/health", headers={"Authorization":"Bearer "+TOKEN}), timeout=15) as response:
        live_health=json.load(response)
    print("INSTALLED_HEALTH "+json.dumps({k:live_health.get(k) for k in ("ok","version","mode")}),flush=True)
    if not live_health.get("ok") or live_health.get("mode")!="field_safe":
        raise RuntimeError("Installed server is not healthy field_safe")
    edge = next((Path(p) for p in [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"] if Path(p).exists()), None)
    if not edge:
        raise RuntimeError("Edge is unavailable")
    server = ThreadingHTTPServer(("127.0.0.1",0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    process = None
    console = None
    try:
        with tempfile.TemporaryDirectory(prefix="frame-live-browser-", ignore_cleanup_errors=True) as folder:
            root=Path(folder)
            for name in FILES:
                with urllib.request.urlopen("https://raw.githubusercontent.com/Frame-vl/frame/"+FRONTEND_REF+"/"+name, timeout=30) as response:
                    pinned = response.read()
                for attempt in range(18):
                    with urllib.request.urlopen("https://frame-vl.github.io/frame/"+name+"?replay="+NONCE+str(attempt), timeout=30) as response:
                        deployed = response.read()
                    if pinned == deployed:break
                    if attempt == 17:raise RuntimeError("Published frontend differs from tested revision: "+name)
                    time.sleep(5)
                (root/name).write_bytes(pinned)
                STATIC[name]=pinned
            harness=root/"tests"/"ai"/"executor-harness.html"
            harness.parent.mkdir(parents=True)
            template=Path(__file__).with_suffix(".html").read_text(encoding="utf-8")
            base="http://127.0.0.1:"+str(server.server_port)+"/"+NONCE
            harness.write_text(template.replace("__BRIDGE__",json.dumps(base)).replace("__TOKEN__",json.dumps(NONCE)),encoding="utf-8")
            STATIC["tests/ai/executor-harness.html"]=harness.read_bytes()
            print("BROWSER_FRONTEND_REF="+FRONTEND_REF,flush=True)
            with (root/"edge.log").open("wb") as log:
                process=subprocess.Popen([str(edge),"--headless=new","--remote-debugging-port=0","--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-first-run","--no-default-browser-check","--allow-file-access-from-files","--disable-background-timer-throttling","--user-data-dir="+str(root/"profile"),base+"/tests/ai/executor-harness.html"],stdout=log,stderr=log)
                deadline=time.monotonic()+240
                last_step=""
                boot=time.monotonic()
                while not DONE.wait(1):
                    port_file=root/"profile"/"DevToolsActivePort"
                    if console is None and port_file.exists():
                        try:console=BrowserConsole(int(port_file.read_text().splitlines()[0]))
                        except (OSError, StopIteration):pass
                    if console is not None:
                        state=console.evaluate("({result:window.FRAME_REPLAY_RESULT||null,step:window.FRAME_REPLAY_STEP||document.readyState,click:window.FRAME_REPLAY_CLICK||null,url:location.href})") or {}
                        if state.get("step")!=last_step:
                            last_step=state.get("step");print("CDP_STEP "+str(last_step),flush=True)
                        if state.get("click"):
                            selector=json.dumps(state["click"])
                            point=console.evaluate("(()=>{const e=document.querySelector("+selector+");if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
                            if not point:raise RuntimeError("Trusted click target disappeared")
                            for event in ("mousePressed","mouseReleased"):
                                console.call("Input.dispatchMouseEvent",{"type":event,"x":point["x"],"y":point["y"],"button":"left","clickCount":1})
                            console.evaluate("window.FRAME_REPLAY_CLICK=null")
                        if state.get("result"):
                            RESULT.update(state["result"]);DONE.set();break
                    elif time.monotonic()-boot>30:
                        raise RuntimeError("Headless browser did not expose local debugging port")
                    if time.monotonic()>deadline:
                        raise RuntimeError("Browser replay timed out")
                    if process.poll() is not None:
                        log.flush()
                        print((root/"edge.log").read_text(encoding="utf-8",errors="replace")[-4000:],flush=True)
                        raise RuntimeError("Edge exited before reporting: "+str(process.returncode))
                print("BROWSER_RESULT "+json.dumps(RESULT,ensure_ascii=False),flush=True)
                if not RESULT.get("ok"):
                    raise RuntimeError("Browser replay failed: "+str(RESULT.get("error")))
                print("FRAME_OWNER_BROWSER_REPLAY_PASS checks="+str(RESULT.get("checks"))+" calls="+str(CALLS),flush=True)
                process.terminate()
                process.wait(timeout=10)
                process=None
    finally:
        if console is not None:
            console.close()
        if process is not None and process.poll() is None:
            process.kill()
            process.wait(timeout=10)
        server.shutdown()
        server.server_close()
        print(f"FRAME_COMPANION_EVAL_ESTIMATED_USD={COST:.7f}",flush=True)

if __name__ == "__main__":
    main()
