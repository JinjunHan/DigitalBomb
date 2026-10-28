"""Pack generated reconstruction layers without changing their RGB or transparency."""
from pathlib import Path
from PIL import Image
import json
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/resources/art/battle';DOC=ROOT/'docs/design/battle'
packing={}
for source,name,width in [('keypad-tray','tray',1000),('card-paper','card-paper',240),('gameplay-tray','play-tray',1000)]:
 path=DOC/'generated'/f'{source}.png'
 if not path.exists():continue
 im=Image.open(path).convert('RGBA');box=im.getchannel('A').getbbox();im=im.crop(box)
 size=(width,round(width*im.height/im.width));im=im.resize(size,Image.Resampling.LANCZOS)
 im.save(OUT/f'{name}.png',optimize=True)
 packing[name]={'source':str(path.relative_to(ROOT)),'alphaCrop':box,'size':size}
(DOC/'generated'/'packing.json').write_text(json.dumps(packing,indent=2)+'\n')
spec=json.loads((DOC/'slices.json').read_text())['assets']
rects={k:v['rect'] for k,v in spec.items()}
rects.update({'card-selected':[0,0,190,260],'card-paper':[0,0,190,260],'tray':[-45,900,986,1660],'play-tray':[-20,1190,961,1650]})
(ROOT/'assets/scripts/shared/battle-art.ts').write_text('/** Source rectangles: docs/design/battle/slices.json; generated layers: generated/packing.json. */\nexport const BATTLE_RECTS: Record<string, readonly number[]> = '+json.dumps(rects,indent=2)+';\n')

# Review all packed layers together on both dark and light backgrounds.
from PIL import ImageDraw
for bg,label in [('#173E3C','dark'),('#eee3ce','light')]:
 sheet=Image.new('RGB',(1200,2100),bg);x=y=12;row=0
 for path in sorted(OUT.glob('*.png')):
  im=Image.open(path).convert('RGBA');im.thumbnail((350,180))
  if x+im.width>1190:x=12;y+=row+30;row=0
  sheet.paste(im,(x,y),im);ImageDraw.Draw(sheet).text((x,y+im.height),path.stem,fill='#b98134');x+=im.width+16;row=max(row,im.height)
 sheet.save(DOC/f'{label}.jpg',quality=90)
