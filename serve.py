"""Static web server for Permit or Pew.

Run it from anywhere:   py serve.py          (then open http://127.0.0.1:8000)
Another port:           py serve.py 8001

It is Python's built-in static server with one difference: it tells the browser never to reuse a cached copy
of a file. The plain `py -m http.server` sends no caching instructions, so a browser may keep serving an old
copy of some game files while downloading new copies of others. When the old and new files disagree, the game
silently fails to start. Any other static server also works, but may need a hard refresh (Ctrl+Shift+R) after
the game is updated.
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    os.chdir(os.path.dirname(os.path.abspath(__file__)))  # serve the game folder, wherever this is run from
    server = ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler)
    print(f"Permit or Pew is running at http://127.0.0.1:{port}  (press Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
