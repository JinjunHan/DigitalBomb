"""Reuse numeral artwork from existing join keypad; no new font rendering."""
from pathlib import Path
from PIL import Image,ImageDraw
import json,uuid
R=Path(__file__).resolve().parents[1];D=R/'docs/design/lobby-shuffle'
plan={'source':'assets/resources/art/join/key-{0..9}.png','output':'assets/resources/art/lobby/digits.png','cell':[64,80],'extraction':'Central glyph only; luminance matte excludes light paper, preserves dark glyph antialiasing. Fixed 56px glyph height; centered in each cell.','layers':['existing machine and blank paper slots','clipped current/next numeral sprites'],'animation':'Immediate first roll; four reels staggered; 5s hold after all stop; no new audio.'}
(D/'manifest.json').write_text(json.dumps(plan,indent=2)+'\n')
atlas=Image.new('RGBA',(640,80))
for n in range(10):
 im=Image.open(R/f'assets/resources/art/join/key-{n}.png').convert('RGBA');w,h=im.size
 glyph=im.crop((int(w*.35),int(h*.17),int(w*.65),int(h*.72)))
 a=glyph.convert('L').point(lambda v: max(0,min(255,round((180-v)*255/125))))
 glyph.putalpha(a);box=a.getbbox();glyph=glyph.crop(box)
 glyph=glyph.resize((round(glyph.width*56/glyph.height),56),Image.Resampling.LANCZOS)
 atlas.paste(glyph,(n*64+(64-glyph.width)//2,12))
out=R/plan['output'];atlas.save(out,optimize=True)
meta=out.with_suffix('.png.meta')
if not meta.exists():
 m=json.loads((R/'assets/resources/art/battle/guess.png.meta').read_text());old=m['uuid'];new=str(uuid.uuid4());s=json.dumps(m,indent=2).replace(old,new);meta.write_text(s+'\n')
for bg,name in [('#173e3c','dark'),('#eee3ce','light')]:
 canvas=Image.new('RGB',(660,100),bg);canvas.paste(atlas,(10,10),atlas);canvas.save(D/(name+'.png'))
