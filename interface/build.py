"""Build the reader from articles exported by the visual composer. Python 3.9+."""
import copy
import html
import json
import math
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ID = re.compile(r"[a-zA-Z][a-zA-Z0-9_-]{0,99}\Z")
SLUG = re.compile(r"[a-z][a-z0-9-]{0,99}\Z")
COLOR = re.compile(r"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\Z")
TYPES = {'ellipse', 'polygon', 'polyline', 'curve', 'freehand', 'path'}


def utf16_boundaries(text):
    result = {0: 0}
    offset = 0
    for index, char in enumerate(text):
        if 0xD800 <= ord(char) <= 0xDFFF:
            raise ValueError('Text contains an invalid Unicode character')
        offset += 2 if ord(char) > 0xFFFF else 1
        result[offset] = index + 1
    return result


def number(value, name, low=-100000, high=100000):
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'{name} must be a number between {low} and {high}')
    return value


def validate_article(value):
    if not isinstance(value, dict) or value.get('version') != 1:
        raise ValueError('This article file is not supported. Export it again from Composer.')
    article = copy.deepcopy(value)
    for field in ('title', 'author', 'text'):
        if not isinstance(article.get(field), str) or not article[field].strip():
            raise ValueError(f'Please enter the article {field}.')
    if len(article['text']) > 2_000_000 or len(article['title']) > 500 or len(article['author']) > 500:
        raise ValueError('The article is too large.')
    if type(article.get('year')) is not int or not 1 <= article['year'] <= 9999:
        raise ValueError('Please enter a valid year.')
    boundaries = utf16_boundaries(article['text'])
    canvas = article.get('canvas')
    if not isinstance(canvas, dict):
        raise ValueError('The map needs a canvas size.')
    for key in ('width', 'height'):
        number(canvas.get(key), f'Canvas {key}', 1, 10000)
    shapes = article.get('shapes')
    if not isinstance(shapes, list) or len(shapes) > 1000:
        raise ValueError('The map must contain at most 1000 shapes.')
    ids = set()
    for shape in shapes:
        if not isinstance(shape, dict):
            raise ValueError('Invalid map shape.')
        key = shape.get('id')
        if not isinstance(key, str) or not ID.fullmatch(key) or key in ids:
            raise ValueError('Map shapes need distinct valid identifiers.')
        ids.add(key)
        kind = shape.get('type')
        if kind not in TYPES:
            raise ValueError(f'Unsupported shape: {kind}')
        for key in ('x', 'y'):
            number(shape.get(key), f'Shape {key}')
        for key in ('width', 'height'):
            number(shape.get(key), f'Shape {key}', 0.001, 100000)
        shape.setdefault('rotation', 0)
        number(shape['rotation'], 'Rotation', -36000, 36000)
        shape.setdefault('strokeWidth', 1.8)
        number(shape['strokeWidth'], 'Stroke width', 0.1, 100)
        shape.setdefault('opacity', 1)
        number(shape['opacity'], 'Opacity', 0, 1)
        shape.setdefault('stroke', '#333333')
        shape.setdefault('fill', 'none')
        for key in ('stroke', 'fill'):
            if not isinstance(shape[key], str) or not (COLOR.fullmatch(shape[key]) or shape[key] == 'none'):
                raise ValueError('Choose a valid shape color.')
        shape.setdefault('outline', False)
        if type(shape['outline']) is not bool:
            raise ValueError('Invalid outline setting.')
        if 'name' in shape and (not isinstance(shape['name'], str) or len(shape['name']) > 500):
            raise ValueError('Invalid shape name.')
        if 'dash' in shape and (not isinstance(shape['dash'], str) or not re.fullmatch(r'(?:\d+(?:\.\d+)?(?:[ ,]+\d+(?:\.\d+)?)*)?', shape['dash'])):
            raise ValueError('Invalid stroke dash pattern.')
        if 'preset' in shape and shape['preset'] not in ('triangle', 'polygon', 'star'):
            raise ValueError('Invalid shape preset.')
        if 'sides' in shape:
            if type(shape['sides']) is not int or not 3 <= shape['sides'] <= 24:
                raise ValueError('A polygon or star needs 3 to 24 points.')
        if 'innerRatio' in shape:
            number(shape['innerRatio'], 'Star inner radius', .05, .95)
        if kind in ('polygon', 'polyline', 'curve', 'freehand'):
            points = shape.get('points')
            minimum = 3 if kind == 'polygon' else 2
            if not isinstance(points, list) or not minimum <= len(points) <= 10000 or (kind == 'curve' and len(points) != 4):
                raise ValueError(f'Invalid points for {kind}.')
            for point in points:
                if not isinstance(point, list) or len(point) != 2:
                    raise ValueError('Invalid map point.')
                for value in point:
                    number(value, 'Point', -10000, 10000)
        if kind == 'path':
            path = shape.get('path')
            if not isinstance(path, str) or not path.strip() or len(path) > 200000 or not re.fullmatch(r'[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+', path):
                raise ValueError('Invalid map path.')
        ranges = shape.get('ranges', [])
        if not isinstance(ranges, list) or len(ranges) > 1000:
            raise ValueError('Invalid text connections.')
        for connection in ranges:
            if not isinstance(connection, dict) or connection.get('grade') not in ('primary', 'secondary'):
                raise ValueError('Choose a highlight strength.')
            start, end = connection.get('start'), connection.get('end')
            if type(start) is not int or type(end) is not int or start >= end or start not in boundaries or end not in boundaries:
                raise ValueError('A text connection no longer matches the article. Select that text again.')
        shape['ranges'] = ranges
    return article


def n(value):
    return format(value, '.10g')


def map_svg(article, slug):
    canvas = article['canvas']
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n(canvas["width"])} {n(canvas["height"])}" class="reading-map" fill="none" aria-label="Reading map">']
    for shape in article['shapes']:
        kind = shape['type']
        name = shape.get('name') or kind.capitalize()
        transform = f'translate({n(shape["x"])} {n(shape["y"])}) rotate({n(shape["rotation"])} {n(shape["width"]/2)} {n(shape["height"]/2)}) scale({n(shape["width"])} {n(shape["height"])})'
        attributes = {'id': f'{slug}-{shape["id"]}', 'class': 'map-element', 'role': 'button', 'tabindex': '0', 'aria-label': name, 'aria-pressed': 'false', 'aria-controls': f'{slug}-text', 'data-ranges': json.dumps(shape['ranges'], separators=(',', ':')), 'data-outline': str(shape['outline']).lower(), 'transform': transform}
        parts.append('<g ' + ' '.join(f'{key}="{html.escape(value, quote=True)}"' for key, value in attributes.items()) + '>')
        if kind == 'ellipse':
            tag, geometry = 'ellipse', 'cx="0.5" cy="0.5" rx="0.5" ry="0.5"'
        elif kind in ('polygon', 'polyline', 'freehand'):
            tag = 'polygon' if kind == 'polygon' else 'polyline'
            geometry = 'points="' + ' '.join(f'{n(x)},{n(y)}' for x, y in shape['points']) + '"'
        else:
            tag = 'path'
            if kind == 'curve':
                points = shape['points']
                path = f'M{n(points[0][0])} {n(points[0][1])} C' + ' '.join(f'{n(x)} {n(y)}' for x, y in points[1:])
            else:
                path = shape['path']
            geometry = f'd="{html.escape(path, quote=True)}"'
        parts.append(f'<{tag} class="map-hit" {geometry} fill="transparent" stroke="transparent" stroke-width="22" vector-effect="non-scaling-stroke" pointer-events="{"stroke" if shape["outline"] or kind in ("polyline", "freehand", "curve") else "all"}"/>')
        dash = f' stroke-dasharray="{shape["dash"]}"' if shape.get('dash') else ''
        parts.append(f'<{tag} class="map-ink" {geometry} fill="{shape["fill"]}" stroke="{shape["stroke"]}" stroke-width="{n(shape["strokeWidth"])}" opacity="{n(shape["opacity"])}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"{dash}/></g>')
    parts.append('</svg>')
    return ''.join(parts)


def render_text(article):
    text = article['text']
    boundaries = utf16_boundaries(text)
    reverse = {index: offset for offset, index in boundaries.items()}
    cuts = {connection[key] for shape in article['shapes'] for connection in shape['ranges'] for key in ('start', 'end')}
    paragraphs = []
    start = 0
    for delimiter in list(re.finditer(r'(?:\r?\n)[ \t]*(?:\r?\n)+', text)) + [None]:
        end = delimiter.start() if delimiter else len(text)
        if text[start:end].strip():
            edges = sorted({reverse[start], reverse[end]} | {value for value in cuts if reverse[start] < value < reverse[end]})
            fragments = []
            for left, right in zip(edges, edges[1:]):
                content = html.escape(text[boundaries[left]:boundaries[right]])
                fragments.append(f'<mark class="article-fragment" data-start="{left}" data-end="{right}">{content}</mark>')
            paragraphs.append('<p>' + ''.join(fragments) + '</p>')
        if delimiter:
            start = delimiter.end()
    return ''.join(paragraphs)


def render_article(article, slug):
    if not SLUG.fullmatch(slug):
        raise ValueError('Invalid article filename.')
    title, author, year = html.escape(article['title']), html.escape(article['author']), article['year']
    row = f'<a class="reading" href="#readings/{slug}"><span>{title}</span><span>{author}</span><time datetime="{year}">{year}</time></a>'
    view = f'''<section class="article-reader" data-article="{slug}" aria-labelledby="{slug}-title" hidden>
      <header class="reader-heading"><h1 id="{slug}-title" tabindex="-1">{title}</h1><p>{author} · <time datetime="{year}">{year}</time></p></header>
      <div class="reader-grid"><article class="reader-text" id="{slug}-text" tabindex="0" aria-label="{html.escape(article['title'], quote=True)} article text">{render_text(article)}</article><div class="map-pane" aria-label="BNITZ language map">{map_svg(article, slug)}</div></div>
    </section>'''
    return row, view


def article(path):
    return render_article(validate_article(json.loads(path.read_text(encoding='utf-8'))), path.stem)


def build(root=ROOT):
    rows, views = [], []
    for path in sorted((root / 'articles').glob('*.bnitz')):
        try:
            row, view = article(path)
        except (ValueError, TypeError, KeyError) as error:
            raise ValueError(f'{path.name}: {error}') from error
        rows.append(row)
        views.append(view)
    template = (root / 'src/index.html').read_text(encoding='utf-8')
    output = template.replace('{{READINGS}}', '\n'.join(rows)).replace('{{ARTICLES}}', '\n'.join(views))
    (root / 'dist').mkdir(exist_ok=True)
    (root / 'dist/index.html').write_text(output, encoding='utf-8')
    for asset in ('style.css', 'script.js'):
        shutil.copyfile(root / 'src' / asset, root / 'dist' / asset)
    return len(rows)


if __name__ == '__main__':
    try:
        print(f'Built {build()} article(s) into {ROOT / "dist"}')
    except ValueError as error:
        raise SystemExit(str(error))
