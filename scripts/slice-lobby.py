"""Slice the generated alpha atlas using inspected pixel bounds; preserve alpha."""
from pathlib import Path
from PIL import Image
import json
root = Path(__file__).resolve().parents[1]
source = root / 'docs/design/lobby-layers/source-atlas.png'
im = Image.open(source).convert('RGBA')
regions = {'title': (0, 0, 800, 460), 'machine': (800, 0, 1536, 460),
           'primary': (0, 470, 770, 720), 'secondary': (775, 470, 1536, 720),
           'help': (150, 730, 800, 1010), 'utility': (1020, 730, 1330, 1010)}
manifest = {}
for name, rect in regions.items():
    tile = im.crop(rect)
    bounds = tile.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    tile = tile.crop(bounds)
    directory = 'assets/resources/art/lobby' if name in ('title','machine') else 'docs/design/retired-runtime/lobby'
    out = root / directory / (name + '.png'); out.parent.mkdir(parents=True,exist_ok=True)
    tile.save(out, optimize=True)
    manifest[name] = {'sourceRect': list(rect), 'trimRect': list(bounds), 'size': list(tile.size)}
    print(name, tile.size, 'alpha', tile.getchannel('A').getextrema())
(root / 'docs/design/lobby-layers/slices.json').write_text(json.dumps(manifest, indent=2) + '\n')
