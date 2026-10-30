"""Reproducible v2 source cuts. Never touches previous art directories.
Rectangles are left/top/right/bottom in the 941x1672 source, masks 4x AA.
Reconstructed surfaces are explicitly recorded separately from original cuts.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import json, uuid, subprocess

root = Path(__file__).resolve().parents[1]
source = root / 'docs/design/new-pages-v2'
out = root / 'assets/resources/art/learning-v2'
out.mkdir(parents=True, exist_ok=True)
cuts = {}

def cut(name, file, rect, radius=0, ellipse=False):
    im = Image.open(source / file).convert('RGBA').crop(rect)
    if radius or ellipse:
        mask = Image.new('L', (im.width*4, im.height*4))
        d = ImageDraw.Draw(mask)
        box = (2, 2, im.width*4-3, im.height*4-3)
        if ellipse: d.ellipse(box, fill=255)
        else: d.rounded_rectangle(box, radius=radius*4, fill=255)
        im.putalpha(mask.resize(im.size, Image.Resampling.LANCZOS))
    if name.startswith('bg-'):
        im = im.resize((750,1333), Image.Resampling.LANCZOS).convert('RGB')
        im.save(out / (name+'.jpg'), quality=55, optimize=True)
    else:
        im = im.resize((round(im.width*.8),round(im.height*.8)), Image.Resampling.LANCZOS)
        im.save(out / (name+'.png'), optimize=True)
        subprocess.run(['pngquant', '--force', '--speed', '1', '--quality', '40-65', '--nofs', '--output', str(out/(name+'.png')), str(out/(name+'.png'))], check=True)
    cuts[name] = {'source': file, 'rect': rect, 'mask': 'ellipse' if ellipse else f'rounded:{radius}', 'bakedText': not file.startswith('reconstruction/'), 'output': str((out/(name+('.jpg' if name.startswith('bg-') else '.png'))).relative_to(root))}

for name in ['mode', 'hub', 'practice', 'notebook']:
    cut('bg-'+name, 'reconstruction/'+name+'-clean.png', (0,0,941,1672))
cut('back', '01-online-mode.png', (39,64,138,163), ellipse=True)
for name,file in [('online','01-online-mode.png'),('friend','02-friend-mode.png'),('hub','03-learning-hub.png'),('tutorial','04-interactive-tutorial.png')]:
    cut('title-'+name,file,(218,240,731,330) if name=='friend' else (218,222,731,330),18)
cut('mode-2','01-online-mode.png',(124,419,827,623),24)
cut('mode-3','01-online-mode.png',(113,635,832,847),26)
cut('mode-4','02-friend-mode.png',(101,861,846,1081),28)
cut('check','01-online-mode.png',(748,939,814,1006),ellipse=True)
cut('match','01-online-mode.png',(177,1278,770,1447),46)
cut('create','02-friend-mode.png',(176,1318,772,1485),44)
cut('start','03-learning-hub.png',(206,882,738,1020),38)
for size,rect in [(2,(103,1197,344,1420)),(3,(350,1197,593,1420)),(4,(599,1197,846,1420))]:
    cut('practice-'+str(size),'03-learning-hub.png',rect,24)
cut('rules','03-learning-hub.png',(140,1464,451,1561),25)
cut('home','03-learning-hub.png',(492,1464,805,1561),25)
cut('hint','05-free-practice.png',(621,919,853,1027),25)
for i in range(9):
    x=[162,370,580][i%3]; y=[1105,1198,1292][i//3]
    cut('key-'+str(i+1),'05-free-practice.png',(x,y,x+201,y+91),24)
cut('key-0','05-free-practice.png',(372,1386,574,1501),24)
cut('key-delete','05-free-practice.png',(148,1390,365,1507),25)
cut('key-submit','05-free-practice.png',(580,1385,809,1508),30)
cut('tab-positions','06-position-deduction.png',(143,268,500,357),28)
cut('tab-history','07-history-comparison.png',(489,335,807,415),24)
cut('baseline','07-history-comparison.png',(92,1320,467,1446),30)
cut('copy','07-history-comparison.png',(472,1320,875,1446),30)
cut('return','06-position-deduction.png',(215,1435,733,1568),33)
# Clean generated surfaces: no sample text/numbers survive into runtime.
if (source/'reconstruction/controls-clean.png').exists():
    cut('card','reconstruction/controls-clean.png',(272,583,367,713),12)
    cut('answer','reconstruction/controls-clean.png',(110,1135,340,1283),25)
    cut('panel','reconstruction/controls-clean.png',(110,416,832,1014),30)
    cut('banner','reconstruction/controls-clean.png',(587,602,804,700),23)
    cut('subtitle','reconstruction/controls-clean.png',(304,330,640,391),22)

# Reuse importer shape, create stable metadata only for new files.
template=json.loads((root/'assets/resources/art/profile/paper.png.meta').read_text())
for path in list(out.glob('*.png')) + list(out.glob('*.jpg')):
    meta=Path(str(path)+'.meta')
    if meta.exists(): continue
    uid=str(uuid.uuid4()); data=json.loads(json.dumps(template).replace(template['uuid'],uid).replace('"paper"','"'+path.stem+'"'))
    if path.suffix == '.jpg': data['files'] = ['.json','.jpg']; data['userData']['hasAlpha'] = False
    data['subMetas']['6c48a']['userData'].update(wrapModeS='clamp-to-edge',wrapModeT='clamp-to-edge')
    meta.write_text(json.dumps(data,indent=2)+'\n')
folder=Path(str(out)+'.meta')
if not folder.exists(): folder.write_text(json.dumps({'ver':'1.2.0','importer':'directory','imported':True,'uuid':str(uuid.uuid4()),'files':[],'subMetas':{},'userData':{}},indent=2)+'\n')
(source/'reconstruction/cuts.json').write_text(json.dumps(cuts,ensure_ascii=False,indent=2)+'\n')
# Inspection sheets use contrasting backgrounds to expose mask problems.
names=[n for n in cuts if not n.startswith('bg-')]
sheet=Image.new('RGB',(1000,((len(names)+3)//4)*180),'#192c30');d=ImageDraw.Draw(sheet)
for i,name in enumerate(names):
    tile=Image.open(out/(name+'.png')).convert('RGBA');tile.thumbnail((235,145))
    x=(i%4)*250;y=(i//4)*180
    if i%2: d.rectangle((x,y,x+249,y+179),fill='#f5eddb')
    sheet.paste(tile,(x+(250-tile.width)//2,y),tile);d.text((x+6,y+152),name,fill='#b87530')
sheet.save(source/'reconstruction/contact-sheet.png')
print(f'Wrote {len(cuts)} isolated assets')
