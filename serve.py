import http.server, socketserver, functools, sys, os
D = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8741

class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # edits to project.js / rooms-materials.js must show up on reload
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

Handler = functools.partial(H, directory=D)
class S(socketserver.TCPServer): allow_reuse_address = True
print("serving %s on %d" % (D, PORT), flush=True)
S(("127.0.0.1", PORT), Handler).serve_forever()
