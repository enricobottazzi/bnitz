import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import serve


class FreshBuilderTests(unittest.TestCase):
    def test_running_server_uses_updated_validator_and_builder_on_next_export(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'reader'
            root.mkdir()
            shutil.copytree(ROOT / 'src', root / 'src')
            builder_path = Path(directory) / 'build.py'
            source = (ROOT / 'build.py').read_text()
            article = {'version': 1, 'title': 'Example', 'author': 'Writer', 'year': 2026, 'text': 'Article text.', 'canvas': {'width': 460, 'height': 680}, 'shapes': []}

            def write_builder(version):
                builder_path.write_text(source + f'''
original_validate = validate_article
def validate_article(value):
    article = original_validate(value)
    article['builderVersion'] = '{version}'
    return article
original_build = build
def build(root=ROOT):
    count = original_build(root)
    (root / 'dist/builder-version.txt').write_text('{version}')
    return count
''')

            write_builder('first')
            timestamp = builder_path.stat().st_mtime_ns
            with patch.object(serve, 'BUILD_SOURCE', builder_path):
                serve.save_article(root, {'article': article})
                self.assertEqual(json.loads((root / 'articles/example.bnitz').read_text())['builderVersion'], 'first')
                self.assertEqual((root / 'dist/builder-version.txt').read_text(), 'first')

                write_builder('later')
                os.utime(builder_path, ns=(timestamp, timestamp))
                serve.save_article(root, {'article': article, 'slug': 'example', 'overwrite': True})
                self.assertEqual(json.loads((root / 'articles/example.bnitz').read_text())['builderVersion'], 'later')
                self.assertEqual((root / 'dist/builder-version.txt').read_text(), 'later')
                self.assertIn('Article text.', (root / 'dist/index.html').read_text())


if __name__ == '__main__':
    unittest.main()
