"""Build the static interface from the Markdown files in articles/. Python 3.9+."""
import html
import json
import math
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ID = re.compile(r"[a-z][a-z0-9-]*\Z")
NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)


def inline(text):
    """Small, escaped Markdown subset; ==text== is the strong highlight grade."""
    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)
    text = re.sub(r"==(.+?)==", r'</mark><mark class="highlight-primary">\1</mark><mark class="highlight-secondary">', text)
    return '<mark class="highlight-secondary">' + text + '</mark>'


def markdown(text):
    blocks = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = block.strip().splitlines()
        heading = re.fullmatch(r"(#{1,6})\s+(.+)", block.strip())
        if heading:
            level = max(2, len(heading[1]))
            blocks.append(f'<h{level}>{inline(heading[2])}</h{level}>')
        elif all(line.startswith('- ') for line in lines):
            blocks.append('<ul>' + ''.join('<li>' + inline(line[2:]) + '</li>' for line in lines) + '</ul>')
        elif all(line.startswith('> ') for line in lines):
            blocks.append('<blockquote>' + inline(' '.join(line[2:] for line in lines)) + '</blockquote>')
        else:
            blocks.append('<p>' + inline(' '.join(lines)) + '</p>')
    return '\n'.join(blocks)


def map_svg(source, slug, passages):
    svg = ET.fromstring(source)
    allowed = {
        'svg': {'viewBox', 'fill'},
        'g': {'id', 'aria-label', 'data-passages', 'data-outline', 'transform'},
        'polygon': {'points', 'stroke', 'stroke-width', 'stroke-linejoin', 'fill'},
        'polyline': {'points', 'stroke', 'stroke-width', 'stroke-linejoin', 'fill'},
        'circle': {'cx', 'cy', 'r', 'stroke', 'stroke-width', 'fill'},
        'path': {'d', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap', 'fill'},
        'line': {'x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width'},
        'rect': {'x', 'y', 'width', 'height', 'rx', 'stroke', 'stroke-width', 'fill'},
    }
    for node in svg.iter():
        tag = node.tag.removeprefix('{' + NS + '}')
        if tag not in allowed or set(node.attrib) - allowed[tag]:
            raise ValueError(f'Unsupported SVG element/attribute: {node.tag}, {node.attrib}')
    if svg.tag != '{' + NS + '}svg' or len(svg.get('viewBox', '').split()) != 4:
        raise ValueError('Map must be an SVG with xmlns and a four-number viewBox')
    bounds = [float(v) for v in svg.get('viewBox').split()]
    if not all(math.isfinite(v) for v in bounds) or bounds[2] <= 0 or bounds[3] <= 0:
        raise ValueError('Map viewBox width and height must be positive')
    svg.set('class', 'reading-map')
    svg.set('fill', 'none')
    svg.set('aria-label', 'Reading map')
    seen = set()
    if not len(svg):
        raise ValueError('Map needs at least one component')
    for group in svg:
        key = group.get('id', '')
        refs = group.get('data-passages', '').split()
        if group.tag != '{' + NS + '}g' or not ID.fullmatch(key) or key in seen:
            raise ValueError(f'Map components need unique IDs: {key}')
        if not refs or len(refs) != len(set(refs)) or set(refs) - passages:
            raise ValueError(f'Unknown, repeated or missing passage references on {key}: {refs}')
        if not group.get('aria-label') or not len(group):
            raise ValueError(f'Component {key} needs an aria-label and geometry')
        if group.get('data-outline', 'false') not in ('true', 'false'):
            raise ValueError(f'Invalid data-outline on {key}')
        seen.add(key)
        group.set('id', f'{slug}-{key}')
        group.set('data-passages', ' '.join(f'{slug}-{ref}' for ref in refs))
        group.set('aria-controls', group.get('data-passages'))
        group.set('class', 'map-element')
        group.set('role', 'button')
        group.set('tabindex', '0')
        group.set('aria-pressed', 'false')
        for shape in list(group):
            if shape.tag.removeprefix('{' + NS + '}') not in {'polygon', 'polyline', 'circle', 'path', 'line', 'rect'} or len(shape):
                raise ValueError('Use flat component groups containing geometry only')
            shape.set('class', 'map-ink')
            shape.set('stroke', 'currentColor')
            if 'stroke-width' not in shape.attrib:
                shape.set('stroke-width', '1.8')
            hit = ET.fromstring(ET.tostring(shape))
            hit.set('class', 'map-hit')
            hit.set('fill', 'transparent')
            hit.set('stroke', 'transparent')
            hit.set('stroke-width', '22')
            hit.set('pointer-events', 'stroke' if group.get('data-outline') == 'true' else 'all')
            group.insert(list(group).index(shape), hit)
    return ET.tostring(svg, encoding='unicode')


def article(path):
    slug = path.stem
    if not ID.fullmatch(slug):
        raise ValueError('Filename must use lowercase letters, numbers and hyphens, starting with a letter')
    source = path.read_text()
    match = re.fullmatch(r'\s*```bnitz\n(.*?)\n```\s*(.*?)\n```svg\n(.*?)\n```\s*', source, re.S)
    if not match:
        raise ValueError('Expected bnitz metadata, Markdown passages, then one svg block')
    meta = json.loads(match[1])
    if not isinstance(meta, dict):
        raise ValueError('bnitz metadata must be a JSON object')
    for field in ('title', 'author'):
        if not isinstance(meta.get(field), str) or not meta[field].strip():
            raise ValueError(f'Missing {field}')
    if type(meta.get('year')) is not int or not 1 <= meta['year'] <= 9999:
        raise ValueError('year must be an integer from 1 to 9999')
    chunks = re.split(r'<!--\s*passage:\s*([a-z][a-z0-9-]*)\s*-->', match[2])
    if chunks[0].strip() or len(chunks) == 1:
        raise ValueError('Text must start with a <!-- passage: name --> marker')
    ids, content = set(), []
    for key, body in zip(chunks[1::2], chunks[2::2]):
        if key in ids or not body.strip():
            raise ValueError(f'Duplicate or empty passage: {key}')
        ids.add(key)
        content.append(f'<div class="article-passage" id="{slug}-{key}">{markdown(body)}</div>')
    svg = map_svg(match[3], slug, ids)
    title, author, year = html.escape(meta['title']), html.escape(meta['author']), meta['year']
    row = f'<a class="reading" href="#readings/{slug}"><span>{title}</span><span>{author}</span><time datetime="{year}">{year}</time></a>'
    view = f'''<section class="article-reader" data-article="{slug}" aria-labelledby="{slug}-title" hidden>
      <header class="reader-heading"><h1 id="{slug}-title" tabindex="-1">{title}</h1><p>{author} · <time datetime="{year}">{year}</time></p></header>
      <div class="reader-grid"><article class="reader-text" tabindex="0" aria-label="{html.escape(meta['title'], quote=True)} article text">{''.join(content)}</article><div class="map-pane" aria-label="BNITZ language map">{svg}</div></div>
    </section>'''
    return row, view


def build(root=ROOT):
    rows, views = [], []
    # Validate every input before touching the current output.
    for path in sorted((root / 'articles').glob('*.md')):
        try:
            row, view = article(path)
        except (ValueError, ET.ParseError, KeyError, TypeError) as error:
            raise ValueError(f'{path.name}: {error}') from error
        rows.append(row)
        views.append(view)
    template = (root / 'src/index.html').read_text()
    output = template.replace('{{READINGS}}', '\n'.join(rows)).replace('{{ARTICLES}}', '\n'.join(views))
    (root / 'dist').mkdir(exist_ok=True)
    (root / 'dist/index.html').write_text(output)
    for asset in ('style.css', 'script.js'):
        shutil.copyfile(root / 'src' / asset, root / 'dist' / asset)
    return len(rows)


if __name__ == '__main__':
    try:
        print(f'Built {build()} article(s) into {ROOT / "dist"}')
    except ValueError as error:
        raise SystemExit(str(error))
