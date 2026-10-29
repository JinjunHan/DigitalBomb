"""Targeted high-quality palette encoding; dimensions and atlas frame coordinates are unchanged."""
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
import imagequant,json,shutil,math,io
root=Path(__file__).resolve().parents[1];rows=[]
for name,resource in [('profile-paper','art/profile/paper.png'),('hourglass-sheet','art/matching/hourglass-sheet.png')]:
 target=root/'assets/resources'/resource;master=root/'docs/design/package-masters'/f'{name}.png'
 master.parent.mkdir(parents=True,exist_ok=True)
 if not master.exists():shutil.copyfile(target,master)
 original=Image.open(master).convert('RGBA')
 packed=imagequant.quantize_pil_image(original,min_quality=85 if name=='profile-paper' else 0,max_quality=95,max_colors=255,dithering_level=.5)
 # Reserve one transparent palette entry; never introduce haze outside the original silhouette.
 palette=packed.getpalette('RGBA');palette += [0]*(1024-len(palette));palette[1020:1024]=[0,0,0,0]
 pixels=bytearray(packed.tobytes());alpha=original.getchannel('A').tobytes()
 for i,a in enumerate(alpha):
  if a==0:pixels[i]=255
 packed=Image.frombytes('P',original.size,bytes(pixels));packed.putpalette(palette,rawmode='RGBA');buffer=io.BytesIO();packed.save(buffer,format='PNG',optimize=True);candidate=buffer.getvalue()
 decoded=Image.open(io.BytesIO(candidate)).convert('RGBA');assert decoded.size==original.size
 # Fully transparent exterior must stay transparent; palette alpha is retained for antialiasing.
 oa=original.getchannel('A');na=decoded.getchannel('A')
 assert all(b==0 for a,b in zip(oa.tobytes(),na.tobytes()) if a==0)
 scores=[]
 for bg in ['#173E3C','#fff4df']:
  base=Image.new('RGBA',original.size,bg)
  a=Image.alpha_composite(base,original).convert('RGB');b=Image.alpha_composite(base,decoded).convert('RGB')
  mse=sum(v*v for v in ImageStat.Stat(ImageChops.difference(a,b)).rms)/3
  scores.append(round(10*math.log10(255**2/mse),2))
 assert min(scores)>=36, f'{name}: composite PSNR below acceptance threshold: {scores}'
 assert len(candidate)<master.stat().st_size
 target.write_bytes(candidate)
 row={'path':resource,'master':str(master.relative_to(root)),'size':list(original.size),'beforeBytes':master.stat().st_size,'afterBytes':target.stat().st_size,'minQuality':85 if name=='profile-paper' else 0,'psnrDarkLight':scores};rows.append(row);print(row)
(root/'docs/verification/package-budget/compression.json').write_text(json.dumps(rows,indent=2)+'\n')
