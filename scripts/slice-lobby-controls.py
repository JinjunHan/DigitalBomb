"""Cut complete controls directly from the approved v3 mockup (no regeneration).
Masks describe the visible silhouettes in source pixels. Original RGB is preserved.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import json
root = Path(__file__).resolve().parents[1]
im = Image.open(root/'docs/design/01-lobby-v3.png').convert('RGBA')
out = root/'assets/resources/art/lobby'
manifest = {}
def cut(name, rect, polygon=None, ellipse=None, hole=None):
    x,y,r,b = rect
    mask = Image.new('L', ((r-x)*4,(b-y)*4))
    d = ImageDraw.Draw(mask)
    if polygon: d.polygon([((a-x)*4,(b-y)*4) for a,b in polygon], fill=255)
    if ellipse: d.ellipse(tuple((v-(x if i%2==0 else y))*4 for i,v in enumerate(ellipse)), fill=255)
    if hole: d.ellipse(tuple((v-(x if i%2==0 else y))*4 for i,v in enumerate(hole)), fill=0)
    if name == 'nickname-frame': d.rectangle(((199-x)*4,(113-y)*4,(344-x)*4,(150-y)*4),fill=0)
    tile=im.crop(rect);tile.putalpha(mask.resize(tile.size,Image.Resampling.LANCZOS))
    tile.save(out/(name+'.png'),optimize=True)
    manifest[name]={'source':'docs/design/01-lobby-v3.png','rect':rect,'polygon':polygon,'ellipse':ellipse,'hole':hole}
cut('match-full',(128,960,818,1158),[(199,961),(735,962),(787,992),(817,1108),(781,1145),(177,1155),(130,1111),(151,998)])
cut('friend-full',(115,1173,827,1380),[(174,1175),(747,1176),(797,1212),(825,1329),(783,1369),(161,1378),(116,1336),(141,1215)])
cut('help-full',(303,1406,644,1551),[(345,1408),(613,1410),(629,1426),(643,1526),(626,1547),(330,1549),(308,1536),(304,1510),(315,1495),(304,1480),(308,1465),(320,1457),(309,1442),(316,1425),(337,1424)])
cut('settings-full',(180,1421,278,1523),ellipse=(180,1421,278,1523))
cut('sound-full',(785,1424,886,1522),ellipse=(785,1424,886,1522))
cut('avatar-frame',(31,45,187,199),ellipse=(32,46,186,198),hole=(43,57,174,187))
cut('nickname-frame',(151,97,380,164),[(152,98),(358,98),(375,108),(379,144),(362,160),(151,163)])
(root/'docs/design/lobby-layers/control-slices.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
