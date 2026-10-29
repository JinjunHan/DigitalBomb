"""Package approved opaque background masters as JPEG; preserve pixels sizes and Cocos UUIDs."""
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
import json, math, shutil
ROOT=Path(__file__).resolve().parents[1]
SOURCES=[('art/lobby/background','lobby-background'),('art/scene/room','room'),('art/table','legacy-table')]
masters=ROOT/'docs/design/opaque-backgrounds';masters.mkdir(parents=True,exist_ok=True)
rows=[]
for resource,name in SOURCES:
 old=ROOT/'assets/resources'/f'{resource}.png';out=old.with_suffix('.jpg');master=masters/f'{name}.png'
 if not master.exists():shutil.copyfile(old,master)
 im=Image.open(master).convert('RGBA')
 if im.getchannel('A').getextrema()!=(255,255):raise ValueError(f'{master}: transparency must remain PNG')
 rgb=im.convert('RGB');rgb.save(out,quality=92,subsampling=0,optimize=True,progressive=False)
 decoded=Image.open(out);assert decoded.size==im.size
 mse=sum(x*x for x in ImageStat.Stat(ImageChops.difference(rgb,decoded)).rms)/3
 oldmeta=Path(str(old)+'.meta');newmeta=Path(str(out)+'.meta')
 if oldmeta.exists():
  if newmeta.exists():raise ValueError(f'{newmeta}: duplicate metadata')
  oldmeta.rename(newmeta)
 meta=json.loads(newmeta.read_text());uuid=meta['uuid']
 if old.exists():old.unlink()
 rows.append(dict(resource=resource,master=str(master.relative_to(ROOT)),output=str(out.relative_to(ROOT)),size=list(im.size),pngBytes=master.stat().st_size,jpegBytes=out.stat().st_size,quality=92,chromaSubsampling='4:4:4',psnrDB=round(10*math.log10(255**2/mse),2),uuid=uuid))
report=ROOT/'docs/verification/jpeg-backgrounds/conversion.json';report.parent.mkdir(parents=True,exist_ok=True);report.write_text(json.dumps(rows,indent=2)+'\n')
for r in rows:print(r['resource'],r['size'],round(r['pngBytes']/1024),'->',round(r['jpegBytes']/1024),'KB; PSNR',r['psnrDB'])
print('Saved KB:',round(sum(r['pngBytes']-r['jpegBytes'] for r in rows)/1024,1))
