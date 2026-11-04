import copy
import html
import importlib.util
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import build as builder
import serve


def example():
    return {
        'version': 1, 'title': 'An example', 'author': 'A writer', 'year': 2026,
        'text': 'A 🌍 idea.\n\nA conclusion.', 'canvas': {'width': 460, 'height': 680},
        'shapes': [{
            'id': 'circle', 'name': 'First idea', 'type': 'ellipse', 'x': 100, 'y': 100,
            'width': 100, 'height': 100, 'rotation': 0, 'stroke': '#333333',
            'strokeWidth': 2, 'fill': 'none', 'opacity': 1, 'outline': False,
            'ranges': [{'start': 0, 'end': 10, 'grade': 'secondary'}, {'start': 2, 'end': 4, 'grade': 'primary'}],
        }],
    }


class ArticleBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / 'src', self.root / 'src')
        (self.root / 'articles').mkdir()
        self.data = example()
        self.path = self.root / 'articles/an-example.bnitz'
        self.path.write_text(json.dumps(self.data))

    def test_unicode_ranges_round_trip_without_splitting_characters(self):
        self.assertEqual(builder.build(self.root), 1)
        output = (self.root / 'dist/index.html').read_text()
        self.assertIn('data-start="2" data-end="4">🌍</mark>', output)
        self.assertIn('data-start="4" data-end="10"> idea.</mark>', output)
        self.assertIn('aria-controls="an-example-text"', output)
        self.assertIn('data-ranges=', output)

    def test_source_link_round_trips_and_renders_beside_author_and_year(self):
        self.data['source'] = ' https://en.wikisource.org/wiki/Moral_letters_to_Lucilius/Letter_2?x=1&y=2 '
        serve.save_article(self.root, {'article': self.data, 'slug': 'an-example', 'overwrite': True})
        saved = json.loads(self.path.read_text())
        self.assertEqual(saved['source'], self.data['source'].strip())
        output = (self.root / 'dist/index.html').read_text()
        heading = re.search(r'<header class="reader-heading">.*?</header>', output, re.S).group(0)
        self.assertIn('A writer · <time datetime="2026">2026</time> · <a ', heading)
        self.assertIn('href="https://en.wikisource.org/wiki/Moral_letters_to_Lucilius/Letter_2?x=1&amp;y=2"', heading)
        self.assertIn('target="_blank" rel="noopener noreferrer">source</a>', heading)

    def test_missing_and_empty_sources_keep_legacy_metadata(self):
        for source in (None, '', '  '):
            with self.subTest(source=source):
                data = example()
                if source is not None:
                    data['source'] = source
                valid = builder.validate_article(data)
                _, view = builder.render_article(valid, 'an-example')
                self.assertIn('A writer · <time datetime="2026">2026</time></p>', view)
                self.assertNotIn('>source</a>', view)

    def test_source_rejects_unsafe_or_invalid_urls(self):
        invalid = [None, 42, True, 'javascript:alert(1)', 'data:text/html,test', '//example.com', '/article', 'https://', 'https:///example.com', 'https://[invalid', 'https://example.com:bad', 'https://example.com/a\\b', 'https://example.com/a\nb', 'https://example.com/a b', 'https://example.com/\x00', 'https://example.com/' + 'a' * 4096]
        for source in invalid:
            with self.subTest(source=source):
                data = example()
                data['source'] = source
                with self.assertRaisesRegex(ValueError, 'source link'):
                    builder.validate_article(data)

    def test_range_cannot_split_unicode_surrogate_or_leave_text(self):
        for start, end in [(2, 3), (3, 4), (-1, 2), (0, 999), (4, 4)]:
            with self.subTest(start=start, end=end):
                data = example()
                data['shapes'][0]['ranges'] = [{'start': start, 'end': end, 'grade': 'primary'}]
                with self.assertRaisesRegex(ValueError, 'text connection'):
                    builder.validate_article(data)

    def test_overlapping_connections_create_shared_boundaries(self):
        data = example()
        second = copy.deepcopy(data['shapes'][0])
        second['id'] = 'another-circle'
        second['ranges'] = [{'start': 4, 'end': 9, 'grade': 'primary'}]
        data['shapes'].append(second)
        output = builder.render_text(builder.validate_article(data))
        self.assertIn('data-start="4" data-end="9"> idea</mark>', output)
        self.assertIn('data-start="9" data-end="10">.</mark>', output)

    def test_multiple_articles_have_distinct_routes_and_ids(self):
        (self.root / 'articles/second.bnitz').write_text(json.dumps(self.data))
        self.assertEqual(builder.build(self.root), 2)
        output = (self.root / 'dist/index.html').read_text()
        ids = re.findall(r'\bid="([^"]+)"', output)
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIn('#readings/second', output)
        (self.root / 'articles/second.bnitz').unlink()
        builder.build(self.root)
        self.assertNotIn('#readings/second', (self.root / 'dist/index.html').read_text())

    def test_broken_input_preserves_previous_build(self):
        builder.build(self.root)
        previous = (self.root / 'dist/index.html').read_bytes()
        self.data['shapes'][0]['ranges'][0]['end'] = 999
        self.path.write_text(json.dumps(self.data))
        with self.assertRaisesRegex(ValueError, 'an-example.bnitz'):
            builder.build(self.root)
        self.assertEqual(previous, (self.root / 'dist/index.html').read_bytes())

    def test_styles_and_presets_survive_export(self):
        self.data['shapes'][0].update(stroke='#aa33ff', fill='#eeeeee', opacity=.4, dash='6 4')
        valid = builder.validate_article(self.data)
        svg = builder.map_svg(valid, 'an-example')
        self.assertIn('stroke="#aa33ff"', svg)
        self.assertIn('stroke-dasharray="6 4"', svg)
        self.assertIn('opacity="0.4"', svg)
        self.assertIn('fill="#eeeeee"', svg)

    def test_right_triangle_export_preserves_geometry_and_connections(self):
        shape = self.data['shapes'][0]
        shape.update(type='polygon', preset='right-triangle', points=[[0, 0], [0, 1], [1, 1]], width=133.7, height=84.25, rotation=45)
        serve.save_article(self.root, {'article': self.data, 'slug': 'an-example', 'overwrite': True})
        saved = json.loads(self.path.read_text())
        self.assertEqual(saved['shapes'][0], shape)
        output = (self.root / 'dist/index.html').read_text()
        svg = ET.fromstring(re.search(r'<svg .*?</svg>', output, re.S).group(0))
        owner = svg.find('{*}g')
        polygon = owner.find('{*}polygon[@class="map-ink"]')
        points = [[float(value) for value in point.split(',')] for point in polygon.get('points').split()]
        self.assertEqual(points, [[0, 0], [0, 1], [1, 1]])
        self.assertIn('rotate(45 66.85 42.125) scale(133.7 84.25)', owner.get('transform'))
        self.assertEqual(json.loads(owner.get('data-ranges')), shape['ranges'])

    def test_wide_triangle_export_preserves_ratio_and_connections(self):
        shape = self.data['shapes'][0]
        shape.update(type='polygon', preset='wide-triangle', points=[[.5, 0], [1, 1], [0, 1]], width=224, height=112)
        serve.save_article(self.root, {'article': self.data, 'slug': 'an-example', 'overwrite': True})
        saved = json.loads(self.path.read_text())
        self.assertEqual(saved['shapes'][0], shape)
        group = ET.fromstring(builder.map_svg(saved, 'an-example')).find('{*}g')
        self.assertIn('scale(224 112)', group.get('transform'))
        self.assertEqual(group.find('{*}polygon[@class="map-ink"]').get('points'), '0.5,0 1,1 0,1')
        self.assertEqual(json.loads(group.get('data-ranges')), shape['ranges'])

    def test_line_styles_validate_only_supported_open_shapes(self):
        for kind in ('polyline', 'curve', 'freehand'):
            for style in ('zigzag', 'star-ends'):
                data = example()
                data['shapes'][0].update(type=kind, points=[[0, 0], [.3, .2], [.6, .8], [1, 1]], lineStyle=style)
                builder.validate_article(data)
        for kind, style in [('ellipse', 'zigzag'), ('polygon', 'star-ends'), ('path', 'zigzag'), ('polyline', 'unknown'), ('polyline', None), ('polyline', True)]:
            with self.subTest(kind=kind, style=style):
                data = example()
                data['shapes'][0].update(type=kind, lineStyle=style)
                with self.assertRaisesRegex(ValueError, 'Line styles'):
                    builder.validate_article(data)

    def test_zigzag_respects_world_spacing_amplitude_exact_ends_and_limits(self):
        shape = {'type': 'polyline', 'width': 120, 'height': 60, 'points': [[0, .5], [0, .5], [1, .5]]}
        original = copy.deepcopy(shape)
        points = builder.zigzag_points(shape)
        self.assertEqual(len(points), 11)
        self.assertEqual((points[0], points[-1]), (shape['points'][0], shape['points'][-1]))
        for index, point in enumerate(points[1:-1], 1):
            self.assertAlmostEqual(point[0], (index - .5) / 9)
            self.assertAlmostEqual(point[1], .5 + (.1 if index % 2 else -.1))
        self.assertEqual(shape, original)
        short = builder.zigzag_points(dict(shape, width=6))
        self.assertEqual(len(short), 3)
        self.assertAlmostEqual((short[1][1] - .5) * shape['height'], 1)
        self.assertEqual(len(builder.zigzag_points(dict(shape, width=98000))), 513)
        stationary = {'type': 'curve', 'width': 180, 'height': 90, 'points': [[.2, .3]] * 4}
        self.assertEqual(builder.zigzag_points(stationary), [[.2, .3]] * 65)

    def test_zigzag_terminal_legs_match_interior_angles_in_any_direction(self):
        shapes = [
            {'width': 96, 'height': 48, 'points': [[0, .5], [1, .5]]},
            {'width': 48, 'height': 96, 'points': [[.5, 1], [.5, 0]]},
            {'width': 280, 'height': 280, 'points': [[0, 0], [1, 1]]},
            {'width': 127, 'height': 53, 'points': [[.9, .1], [.1, .8]]},
        ]
        for shape in shapes:
            with self.subTest(shape=shape):
                shape = dict(shape, type='polyline')
                points = [[x * shape['width'], y * shape['height']] for x, y in builder.zigzag_points(shape)]
                dx, dy = points[-1][0] - points[0][0], points[-1][1] - points[0][1]
                length = math.hypot(dx, dy)
                runs, slopes = [], []
                for start, end in zip(points, points[1:]):
                    sx, sy = end[0] - start[0], end[1] - start[1]
                    run = (sx * dx + sy * dy) / length
                    rise = (sy * dx - sx * dy) / length
                    self.assertGreater(run, 0)
                    runs.append(run)
                    slopes.append(abs(rise / run))
                for slope in slopes:
                    self.assertAlmostEqual(slope, slopes[1])
                self.assertAlmostEqual(runs[0] * 2, runs[1])
                self.assertAlmostEqual(runs[-1] * 2, runs[-2])

    def test_asterisks_align_with_curve_tangents_without_extending_past_endpoints(self):
        shape = {'type': 'curve', 'width': 200, 'height': 80, 'points': [[0, .5], [.2, .1], [.7, .9], [1, .25]]}
        segments = builder.star_segments(shape)
        self.assertEqual(len(segments), 6)
        for index, (start, end) in enumerate(segments):
            endpoint = shape['points'][0 if index < 3 else -1]
            neighbor = shape['points'][1 if index < 3 else -2]
            tangent = [(endpoint[0] - neighbor[0]) * shape['width'], (endpoint[1] - neighbor[1]) * shape['height']]
            magnitude = math.hypot(*tangent)
            outward = [value / magnitude for value in tangent]
            center = [(start[axis] + end[axis]) / 2 for axis in (0, 1)]
            self.assertAlmostEqual(center[0], endpoint[0] - 5 * outward[0] / shape['width'])
            self.assertAlmostEqual(center[1], endpoint[1] - 5 * outward[1] / shape['height'])
            for point in (start, end):
                self.assertAlmostEqual(math.hypot((point[0] - center[0]) * shape['width'], (point[1] - center[1]) * shape['height']), 5)
                projection = (point[0] - endpoint[0]) * shape['width'] * outward[0] + (point[1] - endpoint[1]) * shape['height'] * outward[1]
                self.assertLessEqual(projection, 1e-10)
            if index % 3 == 0:
                for axis in (0, 1):
                    self.assertAlmostEqual(end[axis], endpoint[axis])
                spoke = [(end[0] - start[0]) * shape['width'], (end[1] - start[1]) * shape['height']]
                self.assertAlmostEqual(spoke[0] * tangent[1] - spoke[1] * tangent[0], 0)
                self.assertGreater(spoke[0] * tangent[0] + spoke[1] * tangent[1], 0)

    def test_star_alignment_skips_duplicate_neighbors_and_handles_stationary_lines(self):
        shape = {'type': 'polyline', 'width': 200, 'height': 80, 'points': [[0, 0], [0, 0], [0, 1], [0, 1]]}
        segments = builder.star_segments(shape)
        start, end = segments[0][0], segments[3][0]
        self.assertAlmostEqual(start[0], 0)
        self.assertAlmostEqual(start[1], 10 / 80)
        self.assertAlmostEqual(end[0], 0)
        self.assertAlmostEqual(end[1], 1 - 10 / 80)
        shape['points'] = [[.2, .3]] * 4
        segments = builder.star_segments(shape)
        start, end = segments[0][0], segments[3][0]
        self.assertAlmostEqual(start[0], .2 + 10 / 200)
        self.assertAlmostEqual(end[0], .2 - 10 / 200)
        self.assertAlmostEqual(start[1], .3)
        self.assertAlmostEqual(end[1], .3)

    def test_line_styles_export_solid_strokes_and_endcaps_share_owner_selection(self):
        for style in ('zigzag', 'star-ends'):
            with self.subTest(style=style):
                shape = self.data['shapes'][0]
                shape.update(type='curve', lineStyle=style, points=[[.1, .2], [.2, 1], [.8, 0], [.9, .8]], width=200, height=80, rotation=45, outline=False, dash='6 4', fill='#eeeeee', stroke='#123456', opacity=.4)
                serve.save_article(self.root, {'article': self.data, 'slug': 'an-example', 'overwrite': True})
                saved = builder.validate_article(json.loads(self.path.read_text()))
                self.assertEqual(saved['shapes'][0], shape)
                svg_text = builder.map_svg(saved, 'an-example')
                svg = ET.fromstring(svg_text)
                group = svg.find('{*}g')
                ink = group.find('{*}*[@class="map-ink"]')
                self.assertEqual(ink.get('fill'), 'none')
                self.assertEqual(group.get('data-outline'), 'true')
                self.assertEqual(group.get('data-connector'), 'true')
                self.assertEqual(json.loads(group.get('data-ranges')), shape['ranges'])
                self.assertNotIn('stroke-dasharray', svg_text)
                self.assertEqual(len(svg.findall('.//*[@role="button"]')), 1)
                self.assertIn('rotate(45 100 40)', group.get('transform'))
                if style == 'zigzag':
                    points = [[float(value) for value in point.split(',')] for point in ink.get('points').split()]
                    self.assertEqual((points[0], points[-1]), (shape['points'][0], shape['points'][-1]))
                else:
                    cap = group.find('{*}path[@class="map-endcap"]')
                    hit = group.find('{*}path[@class="map-endcap-hit"]')
                    self.assertEqual(cap.get('d'), hit.get('d'))
                    self.assertEqual(cap.get('d').count('M'), 6)
                    self.assertEqual(cap.get('d').count('L'), 6)
                    self.assertNotIn('Z', cap.get('d'))
                    self.assertEqual(cap.get('stroke'), '#123456')
                    self.assertEqual(cap.get('stroke-width'), '2')
                    self.assertEqual(cap.get('opacity'), '0.4')
                    self.assertEqual(cap.get('fill'), 'none')
                    self.assertEqual(cap.get('vector-effect'), 'non-scaling-stroke')
                    self.assertEqual(cap.get('stroke-linecap'), 'round')
                    self.assertEqual(hit.get('stroke'), 'transparent')
                    self.assertEqual(hit.get('fill'), 'none')
                    self.assertEqual(hit.get('pointer-events'), 'stroke')
                    self.assertIn('class="map-endcap"', (self.root / 'dist/index.html').read_text())

    @unittest.skipUnless(shutil.which('node'), 'Node is needed to compare Composer geometry')
    def test_line_geometry_matches_composer(self):
        shapes = [
            {'type': 'polyline', 'width': 120, 'height': 60, 'points': [[0, .5], [0, .5], [1, .5]]},
            {'type': 'freehand', 'width': 173, 'height': 219, 'points': [[.1, .3], [.2, .6], [.9, .8], [.3, .1]]},
            {'type': 'curve', 'width': 190, 'height': 84, 'points': [[0, 0], [.3, .9], [.6, .1], [1, 1]]},
            {'type': 'curve', 'width': 180, 'height': 90, 'points': [[.2, .3]] * 4},
        ]
        script = "const fs=require('node:fs'), styles=require(process.argv[1]); process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync(0,'utf8')).map(shape=>({zigzag:styles.zigzag(shape),stars:styles.starSegments(shape)}))));"
        result = subprocess.run([shutil.which('node'), '-e', script, str(ROOT.parent / 'composer/line-style.js')], input=json.dumps(shapes), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for shape, rendered in zip(shapes, json.loads(result.stdout)):
            python_points = builder.zigzag_points(shape)
            self.assertEqual(len(python_points), len(rendered['zigzag']))
            for point, expected in zip(python_points, rendered['zigzag']):
                for value, target in zip(point, expected):
                    self.assertAlmostEqual(value, target, places=10)
            for segment, expected in zip(builder.star_segments(shape), rendered['stars']):
                self.assertEqual(len(segment), len(expected))
                for point, target in zip(segment, expected):
                    for value, coordinate in zip(point, target):
                        self.assertAlmostEqual(value, coordinate, places=10)

    def test_legacy_export_drops_labels_and_tags_without_changing_geometric_shapes(self):
        geometry = copy.deepcopy(self.data['shapes'][0])
        self.data['shapes'][0]['tag'] = 'Abandoned attached tag'
        label = copy.deepcopy(geometry)
        label.update(id='legacy-label', type='text', text='Abandoned standalone label')
        self.data['shapes'].append(label)
        original = copy.deepcopy(self.data)
        self.path.write_text(json.dumps(self.data))
        source = self.path.read_bytes()

        normalized = builder.validate_article(self.data)
        self.assertEqual(normalized['shapes'], [geometry])
        self.assertEqual(self.data, original)
        self.assertEqual(builder.build(self.root), 1)
        self.assertEqual(self.path.read_bytes(), source)
        output = (self.root / 'dist/index.html').read_text()
        self.assertNotIn('Abandoned attached tag', output)
        self.assertNotIn('Abandoned standalone label', output)
        svg = ET.fromstring(builder.map_svg(normalized, 'an-example'))
        self.assertEqual(len(svg.findall('{*}g')), 1)
        self.assertIsNone(svg.find('.//{*}text'))
        self.assertEqual(json.loads(svg.find('{*}g').get('data-ranges')), geometry['ranges'])

        serve.save_article(self.root, {'article': self.data, 'slug': 'an-example', 'overwrite': True})
        self.assertEqual(json.loads(self.path.read_text())['shapes'], [geometry])
        self.assertEqual(self.data, original)

    def test_connector_classification_preserves_interactive_shape_ranges(self):
        cases = [('ellipse', False, False), ('ellipse', True, False), ('polygon', False, False), ('polyline', False, True), ('curve', False, True), ('freehand', False, True), ('path', False, False), ('path', True, True)]
        for kind, outline, connector in cases:
            with self.subTest(kind=kind, outline=outline):
                data = example()
                shape = data['shapes'][0]
                shape.update(type=kind, outline=outline, points=[[0, 0], [.3, .2], [.6, .8], [1, 1]], path='M0 0 L1 1')
                group = ET.fromstring(builder.map_svg(builder.validate_article(data), 'an-example')).find('{*}g')
                self.assertEqual(group.get('data-connector'), str(connector).lower())
                self.assertEqual(group.get('class'), 'map-element')
                self.assertEqual(group.get('role'), 'button')
                self.assertEqual(json.loads(group.get('data-ranges')), shape['ranges'])

    def test_open_shapes_render_outline_highlighting_without_rewriting_saved_choice(self):
        for kind in ('polyline', 'curve', 'freehand'):
            with self.subTest(kind=kind):
                data = example()
                data['shapes'][0].update(type=kind, outline=False, points=[[0, 0], [.3, .2], [.6, .8], [1, 1]])
                valid = builder.validate_article(data)
                group = ET.fromstring(builder.map_svg(valid, 'an-example')).find('{*}g')
                self.assertEqual(group.get('data-outline'), 'true')
                self.assertEqual(group.find('{*}*[@class="map-hit"]').get('pointer-events'), 'stroke')
                self.assertIs(valid['shapes'][0]['outline'], False)
                self.assertIs(data['shapes'][0]['outline'], False)

    def test_outline_closed_shapes_accept_interior_clicks_while_connectors_keep_stroke_hits(self):
        cases = [('ellipse', None, 'all'), ('polygon', None, 'all'), ('path', 'M0 0 L1 0 L1 1 Z', 'all'), ('path', 'M0 0 L1 0 L1 1 z ', 'all'), ('path', 'M0 0 L1 1', 'stroke'), ('polyline', None, 'stroke'), ('curve', None, 'stroke'), ('freehand', None, 'stroke')]
        for kind, path, events in cases:
            with self.subTest(kind=kind, path=path):
                data = example()
                shape = data['shapes'][0]
                shape.update(type=kind, outline=True, points=[[0, 0], [.3, .2], [.6, .8], [1, 1]])
                if path is not None:
                    shape['path'] = path
                group = ET.fromstring(builder.map_svg(builder.validate_article(data), 'an-example')).find('{*}g')
                hit = group.find('{*}*[@class="map-hit"]')
                self.assertEqual(hit.get('pointer-events'), events)
                self.assertEqual(hit.get('fill'), 'transparent')
                self.assertEqual(group.get('data-outline'), 'true')
                self.assertEqual(group.get('data-connector'), str(events == 'stroke').lower())

    @unittest.skipUnless(shutil.which('node'), 'Node is needed to test reader pointer selection')
    def test_reader_picks_shapes_under_connectors_within_the_same_map(self):
        script = r'''
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const listeners = {}, svg = {}, otherSvg = {};
let hits = [], selected = null;
const context = {
  document: {
    querySelector: () => ({hidden: false}), querySelectorAll: () => [],
    addEventListener: (type, listener) => { listeners[type] = listener; },
    elementsFromPoint: (x, y) => { assert.equal(x, 12); assert.equal(y, 24); return hits; },
  },
  window: {addEventListener() {}, scrollTo() {}}, location: {hash: ''},
};
vm.runInNewContext(fs.readFileSync(process.argv[1], 'utf8'), context);
context.selectElement = element => { selected = element; };
const group = (connector, owner = svg) => ({dataset: {connector}, closest: selector => selector === 'svg' ? owner : null});
const node = element => ({closest: () => element});
const circle = group('false'), line = group('true'), foreignCircle = group('false', otherSvg);
const event = {target: {closest: () => svg}, clientX: 12, clientY: 24};
hits = [node(line), node(foreignCircle), node(circle), node(line)];
listeners.click(event); assert.equal(selected, circle);
hits = [node(line), node(foreignCircle)]; selected = null;
listeners.click(event); assert.equal(selected, line);
hits = [node(null)]; selected = null;
listeners.click(event); assert.equal(selected, null);
listeners.keydown({target: {closest: () => line}, key: 'Enter', preventDefault() {}});
assert.equal(selected, line);
'''
        result = subprocess.run([shutil.which('node'), '-e', script, str(ROOT / 'src/script.js')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('node'), 'Node is needed to test reader pointer selection')
    def test_reader_full_highlight_covers_inner_profiles_without_changing_hit_order(self):
        script = r'''
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
class Node {
  constructor(attrs = {}, children = []) {
    this.attrs = {...attrs}; this.children = []; this.parent = null;
    const classes = new Set((attrs.class || '').split(' ').filter(Boolean));
    this.classList = {contains: value => classes.has(value), add: value => classes.add(value), remove: (...values) => values.forEach(value => classes.delete(value))};
    children.forEach(child => this.append(child));
  }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  removeAttribute(key) { delete this.attrs[key]; }
  append(child) { child.parent = this; this.children.push(child); }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  cloneNode(deep) { return new Node(this.attrs, deep ? this.children.map(child => child.cloneNode(true)) : []); }
}
const svg = new Node(), reader = {querySelectorAll: () => []}, article = {querySelector: () => reader};
const group = (id, outline = false, opacity = 1) => {
  const hit = new Node({class: 'map-hit'});
  const ink = new Node({id: id + '-ink', class: 'map-ink', fill: 'none', stroke: '#123456', 'stroke-width': '2', opacity: String(opacity), 'vector-effect': 'non-scaling-stroke'});
  const node = new Node({id, class: 'map-element', transform: 'translate(10 20) rotate(180 50 50) scale(100 100)', role: 'button', tabindex: '0'}, [hit, ink]);
  node.dataset = {outline: String(outline), ranges: '[]'};
  node.querySelector = selector => selector === '.map-ink' ? ink : hit;
  node.closest = selector => selector === 'svg' ? svg : selector === '[data-article]' ? article : null;
  svg.append(node);
  return node;
};
const outer = group('outer', false, .4), inner = group('inner'), ring = group('ring', true);
const groups = [...svg.children], listeners = {};
const context = {
  document: {
    querySelector: () => ({hidden: false}),
    querySelectorAll: selector => selector === '.map-element' ? groups : [],
    addEventListener: (type, listener) => { listeners[type] = listener; },
    createElementNS: () => new Node(),
  },
  window: {addEventListener() {}, scrollTo() {}}, location: {hash: ''},
};
vm.runInNewContext(fs.readFileSync(process.argv[1], 'utf8'), context);
const assertHitOrder = () => assert.deepEqual(svg.children.filter(node => node.getAttribute('class') === 'map-element'), groups);
context.selectElement(outer);
let overlay = svg.children.at(-1), copy = overlay.children[0];
assertHitOrder();
assert.equal(overlay.getAttribute('pointer-events'), 'none', 'the visual cover does not intercept clicks on the inner shape');
assert.equal(overlay.getAttribute('aria-hidden'), 'true');
for (const attr of ['id', 'role', 'tabindex']) assert.equal(overlay.getAttribute(attr), null);
assert.equal(copy.getAttribute('id'), null, 'cloning ink does not duplicate an identifier');
assert.equal(overlay.getAttribute('transform'), outer.getAttribute('transform'));
assert.equal(copy.getAttribute('fill'), '#deff00');
assert.equal(copy.getAttribute('opacity'), '1', 'the highlight fully covers profiles even for translucent shapes');
assert.equal(copy.getAttribute('stroke'), '#123456');
assert.equal(copy.getAttribute('stroke-width'), '2');
assert.equal(outer.querySelector('.map-ink').getAttribute('visibility'), 'hidden');
assert.equal(outer.querySelector('.map-ink').getAttribute('opacity'), '0.4', 'ordinary ink appearance stays intact');
assert.equal(outer.querySelector('.map-hit').getAttribute('visibility'), null, 'original hit geometry stays available');
context.selectElement(inner);
assert.equal(overlay.parent, null, 'switching selection removes the old cover');
assert.equal(outer.querySelector('.map-ink').getAttribute('visibility'), null);
assert.equal(inner.getAttribute('aria-pressed'), 'true');
assert.equal(svg.children.length, groups.length + 1);
assertHitOrder();
listeners.keydown({target: {closest: () => null}, key: 'Escape'});
assert.deepEqual(svg.children, groups, 'Escape removes visual covers');
assert.equal(inner.querySelector('.map-ink').getAttribute('visibility'), null);
assert.ok(groups.every(node => node.getAttribute('aria-pressed') === 'false'));
context.selectElement(ring);
assert.deepEqual(svg.children, groups, 'outline-only highlights do not receive a solid cover');
assert.equal(ring.querySelector('.map-ink').getAttribute('visibility'), null);
outer.querySelector('.map-ink').setAttribute('visibility', 'visible');
context.selectElement(outer);
context.selectElement(outer);
assert.deepEqual(svg.children, groups, 'clicking the selected shape again removes its cover');
assert.equal(outer.querySelector('.map-ink').getAttribute('visibility'), 'visible', 'prior visibility is restored exactly');
'''
        result = subprocess.run([shutil.which('node'), '-e', script, str(ROOT / 'src/script.js')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('node'), 'Node is needed to test reader pointer selection')
    def test_reader_prefers_triangle_surface_over_another_shapes_padded_border(self):
        script = r'''
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const svg = {};
let hits = [];
const context = {
  document: {
    querySelector: () => ({hidden: false}), querySelectorAll: () => [],
    addEventListener() {}, elementsFromPoint: () => hits,
  },
  window: {addEventListener() {}, scrollTo() {}}, location: {hash: ''},
  DOMPoint: class {
    constructor(x, y) { this.x = x; this.y = y; }
    matrixTransform(m) { return {x: m.a * this.x + m.c * this.y + m.e, y: m.b * this.x + m.d * this.y + m.f}; }
  },
};
vm.runInNewContext(fs.readFileSync(process.argv[1], 'utf8'), context);
const triangle = (left, top, width, height) => {
  const hit = {
    getScreenCTM: () => ({inverse: () => ({a: 1 / width, b: 0, c: 0, d: 1 / height, e: -left / width, f: -top / height})}),
    isPointInFill: p => p.y >= 0 && p.y <= 1 && p.x >= p.y / 2 && p.x <= 1 - p.y / 2,
  };
  return {dataset: {connector: 'false', outline: 'false'}, closest: () => svg, querySelector: () => hit};
};
const outer = triangle(10, 20, 100, 100), inner = triangle(35, 20, 50, 50);
const pick = (x, y, ...elements) => {
  hits = elements.map(element => ({closest: () => element}));
  return context.pickMapElement({target: {closest: () => svg}, clientX: x, clientY: y});
};
assert.equal(pick(60, 75, inner, outer), outer, 'the larger triangle surface wins over the smaller triangle padded stroke');
assert.equal(pick(60, 45, inner, outer), inner, 'the smaller triangle remains selectable inside its own surface');
assert.equal(pick(60, 15, inner, outer), inner, 'border padding stays clickable when neither surface contains the point');
const hidden = {dataset: {connector: 'false'}, closest: () => svg, querySelector: () => ({isPointInFill() { throw Error('hidden geometry'); }, getScreenCTM: () => null})};
assert.equal(pick(60, 75, hidden, outer), outer, 'unavailable screen geometry is safely skipped');
context.DOMPoint = undefined;
assert.equal(pick(60, 75, inner, outer), inner, 'missing native geometry support preserves the existing hit fallback');
'''
        result = subprocess.run([shutil.which('node'), '-e', script, str(ROOT / 'src/script.js')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('node'), 'Node is needed to test reader pointer selection')
    def test_reader_small_shapes_crossing_outlines_remain_clickable(self):
        script = r'''
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const svg = {};
let hits = [];
const context = {
  document: {
    querySelector: () => ({hidden: false}), querySelectorAll: () => [],
    addEventListener() {}, elementsFromPoint: () => hits,
  },
  window: {addEventListener() {}, scrollTo() {}}, location: {hash: ''},
};
vm.runInNewContext(fs.readFileSync(process.argv[1], 'utf8'), context);
const group = (left, top, width, height, outline = true, fill = 'none', connector = false) => ({
  dataset: {outline: String(outline), connector: String(connector)},
  closest: () => svg,
  querySelector: () => ({getAttribute: () => fill}),
  getBoundingClientRect: () => ({left, top, width, height, right: left + width, bottom: top + height}),
});
const node = element => ({closest: () => element});
const event = {target: {closest: () => svg}, clientX: 50, clientY: 50};
const pick = (...elements) => { hits = elements.map(node); return context.pickMapElement(event); };
const outer = group(0, 0, 100, 100), middle = group(20, 20, 60, 60), inner = group(40, 40, 20, 20);
assert.equal(pick(outer, outer, inner), inner, 'an enclosing outline does not cover an inner circle');
assert.equal(pick(outer, middle, inner), inner, 'nested outlines are skipped recursively');
const left = group(-10, 40, 20, 20), right = group(90, 40, 20, 20), top = group(40, -10, 20, 20);
assert.equal(pick(outer, left), left, 'a small circle crossing the left border remains clickable');
assert.equal(pick(outer, right), right, 'a small circle crossing the right border remains clickable');
assert.equal(pick(outer, top), top, 'a small circle crossing the top border remains clickable');
assert.equal(pick(outer, outer), outer, 'the large outline remains clickable in its empty interior');
const filled = group(0, 0, 100, 100, true, '#ffffff');
assert.equal(pick(filled, inner), filled, 'a filled foreground shape retains priority');
assert.equal(pick(filled, right), filled, 'a filled foreground shape retains priority at its border');
const fullHighlight = group(0, 0, 100, 100, false);
assert.equal(pick(fullHighlight, inner), fullHighlight, 'normal shape layer order is unchanged');
const overlap = group(40, 40, 80, 80);
assert.equal(pick(outer, overlap), overlap, 'a smaller shape partially overlapping an outline remains clickable');
const larger = group(-10, -10, 140, 140);
assert.equal(pick(outer, larger), outer, 'a larger overlapping shape does not replace foreground priority');
const equal = group(0, 0, 100, 100);
assert.equal(pick(outer, equal), outer, 'equal bounds retain foreground priority');
const line = group(0, 0, 100, 100, true, 'none', true);
assert.equal(pick(line, outer, inner), inner, 'connectors do not cover nested closed shapes');
assert.equal(pick(line, line), line, 'a connector alone remains clickable');
'''
        result = subprocess.run([shutil.which('node'), '-e', script, str(ROOT / 'src/script.js')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_unsupported_shapes_and_unsafe_values_are_rejected(self):
        changes = [('type', 'rect'), ('type', 'arrow'), ('stroke', 'url(https://example.com)'), ('width', float('nan')), ('ranges', [{'start': 0, 'end': 1, 'grade': 'unknown'}])]
        for key, value in changes:
            with self.subTest(key=key, value=value):
                data = example()
                data['shapes'][0][key] = value
                with self.assertRaises(ValueError):
                    builder.validate_article(data)

    def test_plain_article_text_is_escaped(self):
        self.data['text'] = '<script>alert(1)</script>'
        self.data['shapes'] = []
        output = builder.render_text(builder.validate_article(self.data))
        self.assertIn('&lt;script&gt;', output)
        self.assertNotIn('<script>', output)

    def test_legacy_article_without_citations_keeps_plain_paragraphs(self):
        data = builder.validate_article(example())
        self.assertNotIn('citations', data)
        output = builder.render_text(data)
        self.assertNotIn('<blockquote', output)
        self.assertEqual(output.count('<p>'), 2)

    def test_citations_round_trip_through_save_and_build(self):
        self.data['citations'] = [{'start': 12, 'end': 25}, {'start': 2, 'end': 4}]
        serve.save_article(self.root, {'article': self.data, 'slug': 'an-example', 'overwrite': True})
        saved = json.loads(self.path.read_text())
        self.assertEqual(saved['citations'], [{'start': 2, 'end': 4}, {'start': 12, 'end': 25}])
        self.assertEqual(saved['text'], self.data['text'])
        output = (self.root / 'dist/index.html').read_text()
        self.assertEqual(output.count('<blockquote class="article-citation">'), 2)
        self.assertIn('data-start="2" data-end="4">🌍</mark>', output)

    def test_citation_spans_multiple_paragraphs_and_escapes_text(self):
        data = example()
        data['text'] = 'Before.\n\n<script>one</script>\n\nTwo & three.\n\nAfter.'
        data['shapes'] = []
        data['citations'] = [{'start': 9, 'end': data['text'].index('\n\nAfter.')}]
        output = builder.render_text(builder.validate_article(data))
        blocks = re.findall(r'<blockquote class="article-citation">(.*?)</blockquote>', output, re.S)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0].count('<p>'), 2)
        self.assertIn('&lt;script&gt;one&lt;/script&gt;', blocks[0])
        self.assertIn('Two &amp; three.', blocks[0])
        self.assertNotIn('<script>', output)
        self.assertEqual(output.count('<p>'), 4)

    def test_citation_boundaries_preserve_crossing_map_fragments(self):
        data = example()
        data['text'] = 'Before quoted words after'
        data['citations'] = [{'start': 7, 'end': 19}]
        data['shapes'][0]['ranges'] = [
            {'start': 0, 'end': 13, 'grade': 'primary'},
            {'start': 9, 'end': 25, 'grade': 'secondary'},
        ]
        valid = builder.validate_article(data)
        output = builder.render_text(valid)
        fragments = re.findall(r'data-start="(\d+)" data-end="(\d+)">(.*?)</mark>', output, re.S)
        self.assertEqual([(int(start), int(end)) for start, end, _ in fragments], [(0, 7), (7, 9), (9, 13), (13, 19), (19, 25)])
        self.assertEqual(''.join(html.unescape(content) for _, _, content in fragments), data['text'])
        for start, end, content in fragments:
            self.assertEqual(html.unescape(content), data['text'][int(start):int(end)])
        quoted = re.search(r'<blockquote class="article-citation">(.*?)</blockquote>', output).group(1)
        self.assertIn('data-start="7"', quoted)
        self.assertIn('data-end="19"', quoted)
        self.assertEqual(valid['shapes'][0]['ranges'], data['shapes'][0]['ranges'])

    def test_invalid_citations_are_rejected(self):
        invalid = [
            None, {}, [None], [{'start': True, 'end': 2}], [{'start': 0.0, 'end': 2}],
            [{'start': 2, 'end': 3}], [{'start': 3, 'end': 4}],
            [{'start': -1, 'end': 2}], [{'start': 0, 'end': 999}],
            [{'start': 4, 'end': 4}], [{'start': 4, 'end': 2}],
            [{'start': 0, 'end': 4}, {'start': 2, 'end': 10}],
        ]
        for citations in invalid:
            with self.subTest(citations=citations):
                data = example()
                data['citations'] = citations
                with self.assertRaisesRegex(ValueError, '[Cc]itation'):
                    builder.validate_article(data)

    def test_touching_citations_are_valid_and_preserve_unicode(self):
        data = example()
        data['citations'] = [{'start': 0, 'end': 2}, {'start': 2, 'end': 4}]
        output = builder.render_text(builder.validate_article(data))
        self.assertEqual(output.count('<blockquote class="article-citation">'), 2)
        self.assertIn('data-start="2" data-end="4">🌍</mark>', output)

    def test_save_conflict_and_explicit_replacement(self):
        with self.assertRaises(serve.ConflictError):
            serve.save_article(self.root, {'article': self.data})
        self.data['title'] = 'Revised title'
        result = serve.save_article(self.root, {'article': self.data, 'slug': 'an-example', 'overwrite': True})
        self.assertEqual(result['slug'], 'an-example')
        self.assertIn('Revised title', (self.root / 'dist/index.html').read_text())
        self.assertEqual(json.loads(self.path.read_text())['title'], 'Revised title')

    def test_destination_cannot_escape_article_directory(self):
        for slug in ('../escape', '/tmp/escape', 'sub/folder', '..', 'a.b'):
            with self.subTest(slug=slug), self.assertRaisesRegex(ValueError, 'destination'):
                serve.save_article(self.root, {'article': self.data, 'slug': slug})

    def test_failed_build_rolls_back_saved_source(self):
        previous = self.path.read_bytes()
        (self.root / 'articles/broken.bnitz').write_text('{broken')
        self.data['title'] = 'New title'
        with self.assertRaises(ValueError):
            serve.save_article(self.root, {'article': self.data, 'slug': 'an-example', 'overwrite': True})
        self.assertEqual(previous, self.path.read_bytes())

    def test_saved_library_remains_readable_and_builds(self):
        self.path.unlink()
        sources = sorted((ROOT / 'articles').glob('*.bnitz'))
        for path in sources:
            shutil.copyfile(path, self.root / 'articles' / path.name)
        self.assertEqual(builder.build(self.root), len(sources))
        output = (self.root / 'dist/index.html').read_text(encoding='utf-8')
        for path in sources:
            with self.subTest(article=path.name):
                data = builder.validate_article(json.loads(path.read_text(encoding='utf-8')))
                self.assertIn(f'href="#readings/{path.stem}"', output)
                self.assertIn(f'data-article="{path.stem}"', output)
                self.assertIn(html.escape(data['title']), output)
                for shape in data['shapes']:
                    self.assertIn(f'id="{path.stem}-{shape["id"]}"', output)


if __name__ == '__main__':
    unittest.main()
