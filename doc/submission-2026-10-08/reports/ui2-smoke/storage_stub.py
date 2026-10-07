"""Local stand-in for the Supabase Storage REST subset used by product uploads and
seller ID cards (UI1 API smoke only). In-memory, 127.0.0.1 only, no auth checks.
It proves app/API/DB interoperability, NOT private Storage acceptance.

Usage: python storage_stub.py <port>
"""
import json
import sys
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OBJECTS: dict[str, tuple[bytes, str]] = {}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):  # keep smoke output small
        return

    def _send(self, status: int, body: bytes = b"{}", content_type: str = "application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path.startswith("/storage/v1/bucket/"):
            return self._send(200, json.dumps({"id": path.rsplit("/", 1)[-1], "public": False}).encode())
        for prefix in ("/storage/v1/object/public/", "/storage/v1/object/sign/", "/storage/v1/object/"):
            if path.startswith(prefix):
                key = path[len(prefix):]
                if key in OBJECTS:
                    data, mime = OBJECTS[key]
                    return self._send(200, data, mime)
                return self._send(404, b'{"error":"not found"}')
        return self._send(404, b'{"error":"not found"}')

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else b""
        path = self.path.split("?", 1)[0]
        if path.startswith("/storage/v1/object/sign/"):
            key = path[len("/storage/v1/object/sign/"):]
            return self._send(200, json.dumps({"signedURL": f"/object/sign/{key}?token={uuid.uuid4().hex}"}).encode())
        if path.startswith("/storage/v1/object/"):
            key = path[len("/storage/v1/object/"):]
            OBJECTS[key] = (body, self.headers.get("Content-Type", "application/octet-stream"))
            return self._send(200, json.dumps({"Key": key}).encode())
        return self._send(404, b'{"error":"not found"}')

    def do_DELETE(self):
        return self._send(200, b"[]")


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
