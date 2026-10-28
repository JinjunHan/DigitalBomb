"""Deterministic source crops and explicitly recorded texture repairs for friend room."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import json
ROOT = Path(__file__).resolve().parents[1]
src = Image.open(ROOT/'docs/design/03-friend-room.png').convert('RGBA')
out = ROOT/'assets/resources/art/friend'
out.mkdir(parents=True, exist_ok=True)
manifest = {}
def cut(name, rect, polygon=None, rounded=None, ellipse=None, repair=None):
    tile = src.crop(rect)
    if repair: repair(tile, rect)
    w,h = tile.size
    mask = Image.new('L',(w*4,h*4)); d=ImageDraw.Draw(mask)
    if polygon: d.polygon([((x-rect[0])*4,(y-rect[1])*4) for x,y in polygon],fill=255)
    if rounded is not None: d.rounded_rectangle((0,0,w*4-1,h*4-1),radius=rounded*4,fill=255)
    if ellipse: d.ellipse(tuple((v-rect[i%2])*4 for i,v in enumerate(ellipse)),fill=255)
    tile.putalpha(mask.resize((w,h),Image.Resampling.LANCZOS))
    tile.save(out/(name+'.png'),optimize=True)
    manifest[name]={'rect':rect,'polygon':polygon,'radius':rounded,'ellipse':ellipse,'repair':repair.__name__ if repair else None}
def patch(tile, rect, target, sample):
    l,t,r,b=target
    texture=src.crop(sample).resize((r-l,b-t),Image.Resampling.BICUBIC)
    mask=Image.new('L',texture.size); ImageDraw.Draw(mask).rectangle((3,3,r-l-4,b-t-4),fill=255)
    mask=mask.filter(ImageFilter.GaussianBlur(2))
    tile.paste(texture,(l-rect[0],t-rect[1]),mask)
def paper_repair(tile, rect):
    # Preserve each ornamental border, replacing only the glyph interiors.
    for l,r in [(216,304),(355,446),(497,591),(641,730)]:
        patch(tile,rect,(l,675,r,771),(l,665,r,676))
    patch(tile,rect,(268,817,675,927),(270,800,675,816))
    patch(tile,rect,(526,1007,612,1040),(526,1040,612,1045))
    # Occluded lower-left silhouette is rebuilt from the clean opposite edge.
    edge=tile.crop((700-rect[0],0,882-rect[0],561)).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    mask=Image.new('L',edge.size,255)
    for x in range(140,182): ImageDraw.Draw(mask).line((x,0,x,561),fill=round(255*(181-x)/41))
    tile.paste(edge,(59-rect[0],0),mask)
def count_repair(tile,rect): patch(tile,rect,(457,468,521,506),(526,475,533,500))
def name_repair(tile,rect): patch(tile,rect,(399,1260,551,1296),(389,1268,402,1288))
cut('back',(34,39,233,123),[(35,63),(49,43),(208,41),(230,59),(231,103),(214,120),(51,120),(35,105)])
cut('heading',(311,32,631,128),[(312,76),(338,38),(356,33),(588,34),(608,48),(628,78),(610,112),(589,126),(348,125),(329,105)])
cut('waiting',(392,254,550,402),rounded=22,ellipse=(411,255,531,375))
# Only the ellipse and the lower rounded name plaque: remove rectangular background around silhouette.
p=out/'waiting.png'; im=Image.open(p); m=Image.new('L',(632,592));d=ImageDraw.Draw(m); d.ellipse((76,4,556,484),fill=255);d.rounded_rectangle((8,404,624,576),radius=80,fill=255);im.putalpha(m.resize(im.size,Image.Resampling.LANCZOS));im.save(p,optimize=True)
manifest['waiting']['maskOverride'] = {'ellipseLocal': [19,1,139,121], 'roundedRectLocal': [2,101,156,144], 'radius': 20}
cut('count',(378,450,565,526),[(379,486),(403,454),(532,453),(562,483),(544,519),(402,523)],repair=count_repair)
cut('paper',(75,534,882,1095),[(174,537),(767,536),(879,1071),(870,1089),(82,1088),(76,1069)],repair=paper_repair)
cut('copy',(272,820,669,925),rounded=37)
cut('nameplate',(366,1253,576,1304),rounded=24,repair=name_repair)
cut('seated',(390,1300,553,1336),rounded=18)
cut('close',(247,1384,694,1495),rounded=52)
(ROOT/'docs/design/friend-room/slices.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
# Both backgrounds expose edge and alpha defects before integration.
canvas=Image.new('RGB',(1100,1250),'#213936')
x=y=15
for i,(name,_) in enumerate(manifest.items()):
    im=Image.open(out/(name+'.png')); im.thumbnail((530,440))
    if x+im.width>1090: x=15;y+=460
    canvas.paste(im,(x,y),im); x+=im.width+20
canvas.save(ROOT/'docs/design/friend-room/contact-sheet.jpg')
