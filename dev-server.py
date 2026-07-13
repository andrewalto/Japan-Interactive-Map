#!/usr/bin/env python3
"""Local dev server: python http.server but with caching disabled,
so edits always show up on reload. Usage: python3 dev-server.py [port]"""

import http.server
import os
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))  # always serve this repo


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8901
    http.server.ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
