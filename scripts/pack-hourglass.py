"""Pack generated RGBA art into registered sprite cells; no painted/generated pixels."""
from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'docs/design/matching/hourglass-sprites/generated-v2.png'
out = ROOT / 'assets/resources/art/matching/hourglass-sheet.png'
im = Image.open(source).convert('RGBA')
xs, ys = [0, 313, 626, 940, 1254], [0, 310, 610, 910, 1254]
sheet = Image.new('RGBA', (1280, 1280))
frames, manifest = [], []
for i in range(16):
    col, row = i % 4, i // 4
    rect = (xs[col], ys[row], xs[col+1], ys[row+1])
    tile = im.crop(rect)
    # Ignore near-transparent fringe when measuring the pivot, preserve all RGBA.
    bounds = tile.getchannel('A').point(lambda a: 255 if a >= 80 else 0).getbbox()
    cx, cy = (bounds[0]+bounds[2])/2, (bounds[1]+bounds[3])/2
    frame = Image.new('RGBA', (320, 320))
    offset = (round(160-cx), round(160-cy))
    frame.paste(tile, offset)
    sheet.paste(frame, (col*320, row*320))
    frames.append(frame)
    manifest.append({'sourceRect': rect, 'offset': offset, 'atlasRect': [col*320, row*320, 320, 320], 'durationMs': 500 if i < 8 else 100})
sheet.save(out, optimize=True)
(source.parent / 'frames.json').write_text(json.dumps(manifest, indent=2)+'\n')
# Review on light and dark backgrounds, and a sequence preview (not a game capture).
for name, color in [('dark', '#163c3a'), ('light', '#f4e9d4')]:
    bg = Image.new('RGBA', sheet.size, color)
    bg.alpha_composite(sheet)
    bg.convert('RGB').save(source.parent / (name+'.jpg'), quality=90)
preview = []
for frame in frames:
    bg = Image.new('RGBA', frame.size, '#163c3a'); bg.alpha_composite(frame)
    preview.append(bg.convert('RGB'))
palette = Image.new('RGB', (320*4, 320*4))
for i, frame in enumerate(preview): palette.paste(frame, (i%4*320, i//4*320))
palette = palette.quantize(colors=128)
preview = [f.quantize(palette=palette) for f in preview]
preview[0].save(source.parent / 'preview.gif', save_all=True, append_images=preview[1:], duration=[500]*8+[100]*8, loop=0, disposal=2)
print(out)
