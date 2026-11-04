"""Build the reader from articles exported by the visual composer. Python 3.9+."""
import copy
import html
import json
import math
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit

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
    if 'source' in article:
        source = article['source']
        if not isinstance(source, str):
            raise ValueError('Please enter a valid source link (http or https).')
        source = source.strip()
        try:
            url = urlsplit(source)
            valid = not source or (len(source) <= 4096 and url.scheme in ('http', 'https') and url.hostname and not re.search(r'[\s\\\x00-\x1f\x7f]', source))
            url.port
        except ValueError:
            valid = False
        if not valid:
            raise ValueError('Please enter a valid source link (http or https).')
        article['source'] = source
    boundaries = utf16_boundaries(article['text'])
    if 'citations' in article:
        citations = article['citations']
        if not isinstance(citations, list) or len(citations) > 1000:
            raise ValueError('Invalid article citations.')
        for citation in citations:
            if not isinstance(citation, dict):
                raise ValueError('Invalid article citation.')
            start, end = citation.get('start'), citation.get('end')
            if type(start) is not int or type(end) is not int or start >= end or start not in boundaries or end not in boundaries:
                raise ValueError('An article citation no longer matches the text. Select that text again.')
        citations.sort(key=lambda citation: citation['start'])
        if any(left['end'] > right['start'] for left, right in zip(citations, citations[1:])):
            raise ValueError('Article citations cannot overlap.')
    canvas = article.get('canvas')
    if not isinstance(canvas, dict):
        raise ValueError('The map needs a canvas size.')
    for key in ('width', 'height'):
        number(canvas.get(key), f'Canvas {key}', 1, 10000)
    shapes = article.get('shapes')
    if not isinstance(shapes, list) or len(shapes) > 1000:
        raise ValueError('The map must contain at most 1000 shapes.')
    shapes[:] = [shape for shape in shapes if not isinstance(shape, dict) or shape.get('type') != 'text']
    ids = set()
    for shape in shapes:
        if not isinstance(shape, dict):
            raise ValueError('Invalid map shape.')
        shape.pop('tag', None)
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
        if 'lineStyle' in shape and (shape['lineStyle'] not in ('zigzag', 'star-ends') or kind not in ('polyline', 'curve', 'freehand')):
            raise ValueError('Line styles are only available for open lines.')
        if 'preset' in shape and shape['preset'] not in ('triangle', 'right-triangle', 'wide-triangle', 'polygon', 'star'):
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


def line_samples(shape):
    points = shape['points']
    if shape['type'] != 'curve':
        return [point[:] for point in points]
    if all(point == points[0] for point in points):
        return [points[0][:] for _ in range(65)]
    result = []
    for index in range(65):
        t = index / 64
        u = 1 - t
        result.append([u ** 3 * points[0][axis] + 3 * u ** 2 * t * points[1][axis] + 3 * u * t ** 2 * points[2][axis] + t ** 3 * points[3][axis] for axis in (0, 1)])
    return result


def zigzag_points(shape):
    normalized = line_samples(shape)
    points = []
    for x, y in normalized:
        world = [x * shape['width'], y * shape['height']]
        if not points or world != points[-1]:
            points.append(world)
    lengths, cumulative = [], [0]
    for start, end in zip(points, points[1:]):
        length = math.hypot(end[0] - start[0], end[1] - start[1])
        lengths.append(length)
        cumulative.append(cumulative[-1] + length)
    total = cumulative[-1]
    if not total:
        return normalized
    count = min(512, 2 * max(1, math.floor(total / 24 + .5)))
    amplitude = min(6, total / 6)
    result, segment = [], 0
    for index in range(count + 1):
        # Endpoints have half the lateral change, so give their legs half the run.
        distance = 0 if index == 0 else total if index == count else total * (index - .5) / (count - 1)
        while segment < len(lengths) - 1 and distance > cumulative[segment + 1]:
            segment += 1
        start, end, length = points[segment], points[segment + 1], lengths[segment]
        dx, dy = end[0] - start[0], end[1] - start[1]
        fraction = (distance - cumulative[segment]) / length
        offset = 0 if index in (0, count) else amplitude * (1 if index % 2 else -1)
        result.append([(start[0] + dx * fraction - dy / length * offset) / shape['width'], (start[1] + dy * fraction + dx / length * offset) / shape['height']])
    result[0], result[-1] = shape['points'][0][:], shape['points'][-1][:]
    return result


def star_segments(shape):
    segments = []
    points = shape['points']
    for index, endpoint in enumerate((points[0], points[-1])):
        candidates = points[1:] if index == 0 else reversed(points[:-1])
        neighbor = next((point for point in candidates if point != endpoint), None)
        angle = math.atan2((endpoint[1] - neighbor[1]) * shape['height'], (endpoint[0] - neighbor[0]) * shape['width']) if neighbor else (math.pi if index == 0 else 0)
        radius = 5
        center = [endpoint[0] - radius * math.cos(angle) / shape['width'], endpoint[1] - radius * math.sin(angle) / shape['height']]
        for spoke in range(3):
            direction = angle + spoke * math.pi / 3
            dx, dy = radius * math.cos(direction) / shape['width'], radius * math.sin(direction) / shape['height']
            segments.append([[center[0] - dx, center[1] - dy], [center[0] + dx, center[1] + dy]])
    return segments


def map_svg(article, slug):
    canvas = article['canvas']
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n(canvas["width"])} {n(canvas["height"])}" class="reading-map" fill="none" aria-label="Reading map">']
    for shape in article['shapes']:
        kind = shape['type']
        name = shape.get('name') or kind.capitalize()
        transform = f'translate({n(shape["x"])} {n(shape["y"])}) rotate({n(shape["rotation"])} {n(shape["width"]/2)} {n(shape["height"]/2)}) scale({n(shape["width"])} {n(shape["height"])})'
        outline = shape['outline'] or kind in ('polyline', 'curve', 'freehand')
        closed_path = kind == 'path' and shape['path'].rstrip().endswith(('Z', 'z'))
        connector = kind in ('polyline', 'curve', 'freehand') or (kind == 'path' and shape['outline'] and not closed_path)
        attributes = {'id': f'{slug}-{shape["id"]}', 'class': 'map-element', 'aria-label': name, 'transform': transform, 'role': 'button', 'tabindex': '0', 'aria-pressed': 'false', 'aria-controls': f'{slug}-text', 'data-ranges': json.dumps(shape['ranges'], separators=(',', ':')), 'data-outline': str(outline).lower(), 'data-connector': str(connector).lower()}
        parts.append('<g ' + ' '.join(f'{key}="{html.escape(value, quote=True)}"' for key, value in attributes.items()) + '>')
        line_style = shape.get('lineStyle')
        if line_style == 'zigzag':
            tag = 'polyline'
            geometry = 'points="' + ' '.join(f'{n(x)},{n(y)}' for x, y in zigzag_points(shape)) + '"'
        elif kind == 'ellipse':
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
        parts.append(f'<{tag} class="map-hit" {geometry} fill="transparent" stroke="transparent" stroke-width="22" vector-effect="non-scaling-stroke" pointer-events="{"stroke" if connector else "all"}"/>')
        dash = f' stroke-dasharray="{shape["dash"]}"' if shape.get('dash') and not line_style else ''
        fill = 'none' if line_style else shape['fill']
        parts.append(f'<{tag} class="map-ink" {geometry} fill="{fill}" stroke="{shape["stroke"]}" stroke-width="{n(shape["strokeWidth"])}" opacity="{n(shape["opacity"])}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"{dash}/>')
        if line_style == 'star-ends':
            path = ' '.join(f'M{n(start[0])} {n(start[1])} L{n(end[0])} {n(end[1])}' for start, end in star_segments(shape))
            parts.append(f'<path class="map-endcap-hit" d="{path}" fill="none" stroke="transparent" stroke-width="22" vector-effect="non-scaling-stroke" pointer-events="stroke"/>')
            parts.append(f'<path class="map-endcap" d="{path}" fill="none" stroke="{shape["stroke"]}" stroke-width="{n(shape["strokeWidth"])}" opacity="{n(shape["opacity"])}" vector-effect="non-scaling-stroke" stroke-linecap="round"/>')
        parts.append('</g>')
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
            paragraphs.append((reverse[start], reverse[end]))
        if delimiter:
            start = delimiter.end()

    regions = []
    start = 0
    for citation in article.get('citations', []):
        if start < citation['start']:
            regions.append((start, citation['start'], False))
        regions.append((citation['start'], citation['end'], True))
        start = citation['end']
    if start < reverse[len(text)]:
        regions.append((start, reverse[len(text)], False))

    output = []
    paragraph_index = 0
    for region_start, region_end, cited in regions:
        rendered = []
        while paragraph_index < len(paragraphs):
            paragraph_start, paragraph_end = paragraphs[paragraph_index]
            if paragraph_end <= region_start:
                paragraph_index += 1
                continue
            if paragraph_start >= region_end:
                break
            start, end = max(paragraph_start, region_start), min(paragraph_end, region_end)
            edges = sorted({start, end} | {value for value in cuts if start < value < end})
            fragments = []
            for left, right in zip(edges, edges[1:]):
                content = html.escape(text[boundaries[left]:boundaries[right]])
                fragments.append(f'<mark class="article-fragment" data-start="{left}" data-end="{right}">{content}</mark>')
            rendered.append('<p>' + ''.join(fragments) + '</p>')
            if paragraph_end > region_end:
                break
            paragraph_index += 1
        if rendered:
            content = ''.join(rendered)
            output.append(f'<blockquote class="article-citation">{content}</blockquote>' if cited else content)
    return ''.join(output)


def render_article(article, slug):
    if not SLUG.fullmatch(slug):
        raise ValueError('Invalid article filename.')
    title, author, year = html.escape(article['title']), html.escape(article['author']), article['year']
    source = f' · <a href="{html.escape(article["source"], quote=True)}" target="_blank" rel="noopener noreferrer">source</a>' if article.get('source') else ''
    row = f'<a class="reading" href="#readings/{slug}"><span>{title}</span><span>{author}</span><time datetime="{year}">{year}</time></a>'
    view = f'''<section class="article-reader" data-article="{slug}" aria-labelledby="{slug}-title" hidden>
      <header class="reader-heading"><h1 id="{slug}-title" tabindex="-1">{title}</h1><p>{author} · <time datetime="{year}">{year}</time>{source}</p></header>
      <div class="reader-grid"><article class="reader-text" id="{slug}-text" tabindex="0" aria-label="{html.escape(article['title'], quote=True)} article text">{render_text(article)}</article><div class="map-pane" aria-label="BNITZ language map">{map_svg(article, slug)}</div></div>
    </section>'''
    return row, view


def article(path):
    data = validate_article(json.loads(path.read_text(encoding='utf-8')))
    row, view = render_article(data, path.stem)
    return data['year'], row, view


def build(root=ROOT):
    articles, rows, views = [], [], []
    for path in sorted((root / 'articles').glob('*.bnitz')):
        try:
            year, row, view = article(path)
        except (ValueError, TypeError, KeyError) as error:
            raise ValueError(f'{path.name}: {error}') from error
        articles.append((year, path.stem, row, view))
    for _, _, row, view in sorted(articles):
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
