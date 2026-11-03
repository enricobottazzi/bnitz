import importlib.util
from pathlib import Path
import re
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('interface_build', ROOT / 'build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ArticleBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / 'src', self.root / 'src')
        (self.root / 'articles').mkdir()
        self.source = (ROOT / 'articles/the-bitter-lesson.md').read_text()
        self.path = self.root / 'articles/the-bitter-lesson.md'
        self.path.write_text(self.source)

    def test_build_multiple_articles_with_distinct_routes_and_ids(self):
        (self.root / 'articles/second-article.md').write_text(self.source.replace('The Bitter Lesson', 'Another article'))
        self.assertEqual(builder.build(self.root), 2)
        output = (self.root / 'dist/index.html').read_text()
        self.assertIn('#readings/second-article', output)
        self.assertIn('#readings/the-bitter-lesson', output)
        ids = re.findall(r'\bid="([^"]+)"', output)
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(output.count('class="map-element"'), 34)
        (self.root / 'articles/second-article.md').unlink()
        self.assertEqual(builder.build(self.root), 1)
        self.assertNotIn('second-article', (self.root / 'dist/index.html').read_text())

    def test_broken_mapping_preserves_previous_output(self):
        builder.build(self.root)
        previous = (self.root / 'dist/index.html').read_bytes()
        self.path.write_text(self.source.replace('data-passages="passage-1"', 'data-passages="missing"', 1))
        with self.assertRaisesRegex(ValueError, 'the-bitter-lesson.md.*passage'):
            builder.build(self.root)
        self.assertEqual(previous, (self.root / 'dist/index.html').read_bytes())

    def test_multiple_passages_per_shape(self):
        self.path.write_text(self.source.replace('data-passages="passage-1"', 'data-passages="passage-1 passage-2"', 1))
        builder.build(self.root)
        self.assertIn('data-passages="the-bitter-lesson-passage-1 the-bitter-lesson-passage-2"', (self.root / 'dist/index.html').read_text())

    def test_invalid_year_and_unsafe_svg_rejected(self):
        for source in (self.source.replace('2019', '"2019"', 1), self.source.replace('<circle ', '<circle onclick="alert(1)" ', 1)):
            with self.subTest(source=source[:60]):
                self.path.write_text(source)
                with self.assertRaises(ValueError):
                    builder.build(self.root)

    def test_duplicate_passage_rejected(self):
        self.path.write_text(self.source.replace('<!-- passage: passage-2 -->', '<!-- passage: passage-1 -->'))
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            builder.build(self.root)


if __name__ == '__main__':
    unittest.main()
