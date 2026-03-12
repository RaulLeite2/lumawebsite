import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


WEB_ROOT = Path(__file__).parent.resolve()


class SPARequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def do_GET(self):
        request_path = urlparse(self.path).path

        if request_path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"ok")
            return

        if request_path == "/":
            self.path = "/index.html"
            return super().do_GET()

        absolute_path = (WEB_ROOT / request_path.lstrip("/")).resolve()
        is_under_root = str(absolute_path).startswith(str(WEB_ROOT))
        if is_under_root and absolute_path.exists() and absolute_path.is_file():
            return super().do_GET()

        # For extensionless routes, return index.html to support SPA navigation.
        if "." not in Path(request_path).name:
            self.path = "/index.html"
            return super().do_GET()

        return super().do_GET()


def main() -> None:
    port = int(os.getenv("PORT", "8080"))
    with ThreadingHTTPServer(("0.0.0.0", port), SPARequestHandler) as httpd:
        print(f"[site] Serving on 0.0.0.0:{port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()