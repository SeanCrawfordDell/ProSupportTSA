import http.server
import socketserver

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

if __name__ == "__main__":
    # Loopback only, on the port the docs and the Devin companion preview expect.
    PORT = 4187
    # Allow an immediate restart while the previous socket is still in TIME_WAIT.
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
        print(f"Serving http://127.0.0.1:{PORT}/ with caching disabled")
        httpd.serve_forever()
