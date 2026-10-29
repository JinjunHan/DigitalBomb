"""Targeted source recuts and documented same-art texture repairs."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter,ImageStat,ImageChops
import json,re,imagequant
R=Path(__file__).resolve().parents[1];D=R/'docs/design/result-feedback-fix';O=R/'assets/resources/art/feedback'
plan={'victory-title':{'source':'12-end-feedback.png','rect':[22,130,612,584],'role':'complete crown and victory panel; native reason'},'result-paper':{'source':'06-defeat-result.png','rect':[48,451,888,1288],'role':'complete recap with original row frames; native counts/cards; top rail reconstructed from own bottom rail'},'own':{'source':'01-own-feedback.png','rect':[542,30,1002,484],'role':'lock panel with cleared title, score and footer'},'own-gold':{'source':'01-own-feedback.png','rect':[1026,509,1501,970],'role':'gold lock panel; native title, score and footer'}}
(D/'manifest.json').write_text(json.dumps({'coordinates':'LTRB source pixels; curved masks supersampled 4x; patches use same-art paper samples, not lossless extraction','assets':plan,'opponent':'Use baked portrait rim only. Insert circular live face at source-relative (117,139), not an extra rim.','layout':'Own title -52, score 50, footer 158 in 430px panel. Result labels align to original recap rows.'},indent=2)+'\n')
def patch(im,box,sample):
 a=Image.new('L',(box[2]-box[0],box[3]-box[1]),0);ImageDraw.Draw(a).rectangle((5,5,a.width-6,a.height-6),fill=255);a=a.filter(ImageFilter.GaussianBlur(3));p=sample.resize(a.size,Image.Resampling.BICUBIC);target=ImageStat.Stat(im.crop((box[0],box[1],box[0]+8,box[1]+8))).mean;mean=ImageStat.Stat(p).mean
 for channel in range(3):
  band=p.getchannel(channel).point(lambda v,c=channel:max(0,min(255,round(v+target[c]-mean[c]))))
  bands=list(p.split());bands[channel]=band;p=Image.merge('RGBA',bands)
 im.paste(p,box[:2],a)
def mask(im,points):
 m=Image.new('L',(im.width*4,im.height*4));d=ImageDraw.Draw(m);pts=[]
 for i,(x,y) in enumerate(points):
  prev=points[i-1];nxt=points[(i+1)%len(points)];a=(x+(prev[0]-x)*.12,y+(prev[1]-y)*.12);b=(x+(nxt[0]-x)*.12,y+(nxt[1]-y)*.12)
  for j in range(9):
   t=j/8;pts.append((4*((1-t)**2*a[0]+2*(1-t)*t*x+t*t*b[0]),4*((1-t)**2*a[1]+2*(1-t)*t*y+t*t*b[1])))
 d.polygon(pts,fill=255);im.putalpha(m.resize(im.size,Image.Resampling.LANCZOS))
for key,item in plan.items():
 src=Image.open(R/'docs/design/feedback-v1'/item['source']).convert('RGBA');im=src.crop(item['rect']);w,h=im.size
 if key=='victory-title':
  patch(im,(116,331,479,387),im.crop((78,303,114,355)))
  mask(im,[(0,132),(15,112),(27,109),(34,87),(52,80),(148,80),(157,45),(172,71),(187,31),(197,55),(218,26),(258,10),(284,10),(293,0),(301,13),(338,24),(364,37),(379,69),(403,31),(414,60),(428,73),(441,80),(539,80),(558,90),(562,109),(581,120),(588,140),(588,403),(575,424),(561,430),(552,448),(35,448),(22,433),(7,422),(0,403)])
 elif key=='result-paper':
  # Restore the obscured top rail, retaining the original heading and all four row frames.
  im.paste(im.crop((0,h-40,w,h)).transpose(Image.Transpose.FLIP_TOP_BOTTOM),(0,0))
  clean=Image.open(D/'paper-master.png').convert('RGBA').crop((120,240,700,360))
  for box in [(101,170,747,235),(101,263,747,327),(298,368,755,506),(298,535,755,672),(230,700,630,813)]:patch(im,box,clean)
  # Clear baked left row labels too, then render consistent native typography.
  for box in [(100,405,292,470),(100,572,292,638)]:patch(im,box,clean)
  mask(im,[(2,39),(15,29),(20,10),(40,1),(799,1),(821,13),(825,30),(839,39),(839,795),(825,814),(811,835),(27,835),(12,819),(1,798)])
 else:
  # Crop-relative clear zones retain ornamental borders, lock and score inset.
  clean=Image.open(D/'paper-master.png').convert('RGBA').crop((120,240,700,360))
  boxes=[(76,132,389,203),(92,223,393,343),(60,360,422,425)] if key=='own' else [(64,120,427,209),(106,229,407,349),(74,366,436,431)]
  for box in boxes:patch(im,box,clean)
  mask(im,[(3,87),(17,72),(27,59),(143,59),(157,44),(166,37),(176,42),(183,21),(204,10),(218,8),(226,0),(234,11),(257,20),(274,37),(281,48),(300,39),(314,59),(431,59),(447,73),(458,88),(458,421),(447,440),(429,451),(30,451),(13,439),(2,423)] if key=='own' else [(3,94),(17,77),(30,65),(155,65),(171,44),(190,30),(213,14),(228,6),(241,17),(267,27),(290,51),(315,65),(448,65),(465,81),(473,98),(473,430),(460,450),(440,459),(32,459),(13,446),(2,430)])
 q=imagequant.quantize_pil_image(im,max_colors=256,min_quality=80,max_quality=95);q.save(O/(key+'.png'),optimize=True)
 item['size']=list(im.size)
 p=R/'assets/scripts/shared/feedback-art.ts';s=p.read_text();s=re.sub(r'("'+key+r'": \[)\s*\d+,\s*\d+',lambda m:m[1]+f'\n    {w},\n    {h}',s);p.write_text(s)
for bg,name in [('#173e3c','dark'),('#eee3ce','light')]:
 sheet=Image.new('RGB',(1000,1100),bg)
 for i,key in enumerate(plan):
  im=Image.open(O/(key+'.png')).convert('RGBA');im.thumbnail((470,510));sheet.paste(im,((i%2)*500,(i//2)*550),im)
 sheet.save(D/(name+'.jpg'),quality=92)
