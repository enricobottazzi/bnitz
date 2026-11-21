"""Open a BNITZ file or folder in the local Reader."""

import argparse
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import urlopen
import webbrowser

READER = Path(__file__).resolve().parent
ROOT = READER.parent
ROUTES = {
    '/': (READER / 'index.html', 'text/html; charset=utf-8'),
    '/reader.css': (READER / 'style.css', 'text/css; charset=utf-8'),
    '/playground.js': (READER / 'playground.js', 'text/javascript; charset=utf-8'),
    '/reader.js': (READER / 'app.js', 'text/javascript; charset=utf-8'),
    '/about.bnitz': (READER / 'about.bnitz', 'application/json; charset=utf-8'),
    '/RULES.md': (ROOT / 'RULES.md', 'text/plain; charset=utf-8'),
    '/bnitz.css': (ROOT / 'bnitz.css', 'text/css; charset=utf-8'),
    '/lang/model.js': (ROOT / 'lang' / 'model.js', 'text/javascript; charset=utf-8'),
    '/lang/view.js': (ROOT / 'lang' / 'view.js', 'text/javascript; charset=utf-8'),
    '/vendor/katex.min.js': (ROOT / 'vendor' / 'katex.min.js', 'text/javascript; charset=utf-8'),
}


class CitationMeta(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields = {}
        self.authors = []

    def handle_starttag(self, tag, attrs):
        if tag != 'meta':
            return
        attrs = dict(attrs)
        name = attrs.get('name')
        value = (attrs.get('content') or '').strip()
        if name == 'citation_author' and value:
            family, _, given = value.partition(',')
            initial = given.strip()[:1]
            self.authors.append(f'{initial}. {family}' if initial else family)
        elif name in ('citation_title', 'citation_abstract', 'citation_date'):
            self.fields[name] = value


def import_arxiv(url):
    link = re.fullmatch(
        r'(?:https?://)?(?:www\.)?arxiv\.org/abs/'
        r'((?:[0-9]{4}\.[0-9]{4,5}|[a-z][a-z.-]*/[0-9]{7})(?:v[1-9][0-9]*)?)'
        r'/?(?:[?#][^\s]*)?', url.strip(), re.IGNORECASE | re.ASCII,
    )
    if not link:
        return 400, {'error': 'Enter an arXiv abstract link like https://arxiv.org/abs/1706.03762'}
    source = 'https://arxiv.org/abs/' + link[1]
    parser = CitationMeta()
    try:
        with urlopen(source, timeout=12) as response:
            parser.feed(response.read().decode('utf-8'))
        parser.close()
    except HTTPError as error:
        if error.code in (404, 410):
            return 404, {'error': 'Paper not found on arXiv.'}
        return 502, {'error': 'arXiv could not load this paper. Try again.'}
    except (URLError, OSError, UnicodeError):
        return 502, {'error': 'Could not read the arXiv page. Try again.'}

    title = parser.fields.get('citation_title')
    abstract = parser.fields.get('citation_abstract')
    year = parser.fields.get('citation_date', '')[:4]
    if not (title and abstract and parser.authors and re.fullmatch(r'[0-9]{4}', year)):
        return 502, {'error': 'The arXiv page is missing paper details.'}
    authors = parser.authors
    byline = ' and '.join(authors) if len(authors) <= 2 else authors[0] + ' et al.'
    return 200, {'title': title, 'text': abstract, 'author': byline, 'year': int(year), 'source': source}


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
            request = urlsplit(self.path)
            route = request.path
            status = 200
            if route == '/arxiv':
                url = parse_qs(request.query).get('url', [''])[0]
                status, paper = import_arxiv(url)
                content = json.dumps(paper).encode()
                content_type = 'application/json'
            elif route == '/library.json':
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
            self.send_response(status)
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
