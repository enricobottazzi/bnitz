import copy
import importlib.util
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
import unittest

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

    def test_migrated_article_has_original_geometry_and_connections(self):
        data = builder.validate_article(json.loads((ROOT / 'articles/the-bitter-lesson.bnitz').read_text()))
        self.assertEqual(len(data['shapes']), 17)
        self.assertEqual(len(data['text'].split('\n\n')), 8)
        self.assertEqual(data['title'], 'The Bitter Lesson')
        top = next(shape for shape in data['shapes'] if shape['id'] == 'map-top')
        bottom = next(shape for shape in data['shapes'] if shape['id'] == 'map-bottom-left')
        self.assertEqual((top['x'], top['y'], top['width'], top['height']), (143, 33, 174, 106))
        self.assertEqual((bottom['x'], bottom['y'], bottom['height']), (143, 541, 106))
        self.assertTrue(all({r['grade'] for r in shape['ranges']} == {'primary', 'secondary'} for shape in data['shapes']))


if __name__ == '__main__':
    unittest.main()
