"""Local composer and reader servers. Run from any working directory."""
import argparse
import json
import re
import runpy
import threading
import unicodedata
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from build import ROOT, SLUG

SAVE_LOCK = threading.Lock()
BUILD_SOURCE = ROOT / 'build.py'


def current_builder():
    return runpy.run_path(str(BUILD_SOURCE))


class ConflictError(ValueError):
    pass


def slugify(title):
    ascii_title = unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode()
    slug = re.sub(r'[^a-z0-9]+', '-', ascii_title.lower()).strip('-')[:95].rstrip('-')
    if not slug or not slug[0].isalpha():
        slug = 'article-' + slug
    return slug.rstrip('-')


def save_article(root, payload):
    if not isinstance(payload, dict) or 'article' not in payload:
        raise ValueError('Choose an article to export.')
    builder = current_builder()
    article = builder['validate_article'](payload['article'])
    slug = payload.get('slug') or slugify(article['title'])
    if not isinstance(slug, str) or not SLUG.fullmatch(slug):
        raise ValueError('Invalid article destination.')
    folder = root / 'articles'
    folder.mkdir(exist_ok=True)
    target = folder / (slug + '.bnitz')
    with SAVE_LOCK:
        existed = target.exists()
        if existed and payload.get('overwrite') is not True:
            raise ConflictError('An article with this name already exists. Replace it or change the title.')
        previous = target.read_bytes() if existed else None
        temporary = folder / ('.' + slug + '.tmp')
        try:
            temporary.write_text(json.dumps(article, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            temporary.replace(target)
            builder['build'](root)
        except Exception:
            if previous is not None:
                target.write_bytes(previous)
            elif target.exists():
                target.unlink()
            raise
        finally:
            temporary.unlink(missing_ok=True)
    return {'slug': slug, 'url': f'http://127.0.0.1:4173/#readings/{slug}'}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, root=ROOT, mode='composer', **kwargs):
        self.root, self.mode = root, mode
        directory = root.parent / 'composer' if mode == 'composer' else root / 'dist'
        super().__init__(*args, directory=str(directory), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if self.mode != 'composer' or not path.startswith('/api/'):
            return super().do_GET()
        try:
            validate_article = current_builder()['validate_article']
            if path == '/api/articles':
                articles = []
                for file in sorted((self.root / 'articles').glob('*.bnitz')):
                    data = validate_article(json.loads(file.read_text(encoding='utf-8')))
                    articles.append({'slug': file.stem, **{key: data[key] for key in ('title', 'author', 'year')}})
                return self.reply(200, {'articles': articles})
            slug = path.removeprefix('/api/articles/')
            if path.startswith('/api/articles/') and SLUG.fullmatch(slug):
                file = self.root / 'articles' / (slug + '.bnitz')
                if file.is_file():
                    return self.reply(200, {'slug': slug, 'article': validate_article(json.loads(file.read_text(encoding='utf-8')))})
            return self.reply(404, {'error': 'Article not found.'})
        except (OSError, ValueError) as error:
            return self.reply(400, {'error': str(error)})

    def do_POST(self):
        if self.mode != 'composer' or urlsplit(self.path).path != '/api/articles':
            return self.reply(404, {'error': 'Not found.'})
        port = self.server.server_port
        hosts = {f'127.0.0.1:{port}', f'localhost:{port}'}
        if self.headers.get('Host') not in hosts or (self.headers.get('Origin') and self.headers['Origin'] not in {f'http://{host}' for host in hosts}):
            return self.reply(403, {'error': 'Save from the local composer page.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 10_000_000:
                return self.reply(413, {'error': 'The article is too large.'})
            payload = json.loads(self.rfile.read(size).decode('utf-8'))
            return self.reply(200, save_article(self.root, payload))
        except ConflictError as error:
            return self.reply(409, {'error': str(error)})
        except (ValueError, TypeError, KeyError, UnicodeError) as error:
            return self.reply(400, {'error': str(error)})
        except OSError:
            return self.reply(500, {'error': 'Could not write the article. Check the folder permissions.'})


def main():
    parser = argparse.ArgumentParser(description='Run BNITZ locally.')
    parser.add_argument('mode', choices=('composer', 'reader'))
    parser.add_argument('--port', type=int)
    args = parser.parse_args()
    if args.mode == 'reader':
        current_builder()['build']()
    port = args.port or (4174 if args.mode == 'composer' else 4173)
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, mode=args.mode))
    print(f'BNITZ {args.mode}: http://127.0.0.1:{port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
