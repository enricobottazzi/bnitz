"""Open a BNITZ file or folder in the local Reader."""

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import urlsplit
import webbrowser

READER = Path(__file__).resolve().parent
ROOT = READER.parent
ROUTES = {
    '/': (READER / 'index.html', 'text/html; charset=utf-8'),
    '/reader.css': (READER / 'style.css', 'text/css; charset=utf-8'),
    '/reader.js': (READER / 'app.js', 'text/javascript; charset=utf-8'),
    '/bnitz.css': (ROOT / 'bnitz.css', 'text/css; charset=utf-8'),
    '/bnitz.js': (ROOT / 'bnitz.js', 'text/javascript; charset=utf-8'),
}


def read_library(path, from_folder):
    files = sorted(path.rglob('*')) if from_folder else [path]
    return [
        {
            'name': file.relative_to(path).as_posix() if from_folder else file.name,
            'text': file.read_text(encoding='utf-8-sig'),
        }
        for file in files
        if file.suffix.lower() == '.bnitz' and file.is_file()
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', type=Path, help='a .bnitz file or a folder of .bnitz files')
    parser.add_argument('--port', type=int, default=4173)
    args = parser.parse_args()
    path = args.path.expanduser()
    from_folder = path.is_dir()
    try:
        if not read_library(path, from_folder):
            parser.error(f'No .bnitz files found at {path}')
    except (OSError, UnicodeError) as error:
        parser.exit(1, f'Could not read the library at {path}: {error}\n')

    class ReaderHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            route = urlsplit(self.path).path
            if route == '/library.json':
                try:
                    library = read_library(path, from_folder)
                except (OSError, UnicodeError):
                    self.send_error(500, 'Could not read the library')
                    return
                content = json.dumps({'fromFolder': from_folder, 'files': library}).encode()
                content_type = 'application/json'
            else:
                resource = ROUTES.get(route)
                if route.startswith('/assets/') and route.count('/') == 2 and route.endswith('.svg'):
                    resource = (ROOT / route[1:], 'image/svg+xml')
                if resource is None:
                    self.send_error(404)
                    return
                asset, content_type = resource
                try:
                    content = asset.read_bytes()
                except (FileNotFoundError, IsADirectoryError):
                    self.send_error(404)
                    return
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def log_message(self, format, *args):
            pass

    try:
        with ThreadingHTTPServer(('127.0.0.1', args.port), ReaderHandler) as server:
            url = f'http://127.0.0.1:{server.server_port}/'
            print(url, flush=True)
            webbrowser.open(url)
            server.serve_forever()
    except KeyboardInterrupt:
        pass
    except OSError as error:
        parser.exit(1, f'Could not launch the Reader: {error}\n')


if __name__ == '__main__':
    main()
