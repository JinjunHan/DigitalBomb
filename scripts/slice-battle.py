"""Source crops and documented same-source texture repairs; never overwrites older art."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import json
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/resources/art/battle'; OUT.mkdir(parents=True,exist_ok=True)
DOC=ROOT/'docs/design/battle'; DOC.mkdir(parents=True,exist_ok=True)
spec={}
def add(name,source,rect,radius=16,repairs=None,polygon=None):
 spec[name]=dict(source=source,rect=rect,radius=radius,repairs=repairs or [],polygon=polygon)
p='04-preparation.png'; g='05-gameplay-v2.png'
add('opponent',p,[330,0,610,180],0,polygon=[[332,177],[351,148],[365,127],[390,116],[410,108],[406,92],[407,80],[397,81],[408,60],[408,39],[427,23],[437,9],[462,5],[478,9],[492,17],[511,24],[519,42],[530,54],[517,54],[524,71],[518,87],[510,93],[509,105],[525,112],[547,116],[577,136],[598,171],[610,180]])
add('heading',p,[179,362,762,496],30)
add('rules',p,[291,530,651,582],25)
add('lock',p,[105,1373,834,1536],35)
add('card-backs',p,[316,175,624,303],12)
add('nameplate',p,[398,134,546,173],18,[[[423,141,520,164],[410,143,421,162]]])
add('status',p,[375,302,566,345],20,[[[410,310,538,334],[390,312,405,330]]])
add('timer',p,[363,463,579,528],26,[[[463,476,542,514],[449,479,462,511]]])
add('round',g,[16,23,274,100],20,[[[43,40,248,81],[80,34,102,39]]])
add('records',g,[94,309,849,716],28,[[[151,400,802,673],[160,459,175,471]]])
add('record-row',g,[149,397,805,487],14,[[[185,417,282,467],[166,420,180,466]],[[325,420,375,467],[326,412,375,419]],[[410,420,463,467],[411,412,463,419]],[[501,420,551,467],[501,412,551,419]],[[587,420,638,467],[587,412,638,419]],[[699,428,761,460],[700,423,759,428]]])
add('all-records',g,[642,338,819,385],12)
add('guess',g,[180,722,758,936],28,[[[252,798,341,881],[260,852,273,875]],[[369,798,459,881],[260,852,273,875]],[[485,798,575,881],[260,852,273,875]],[[602,798,689,881],[260,852,273,875]]])
add('turn',g,[270,1151,670,1234],25,[[[306,1172,635,1211],[311,1201,321,1210]]])
# Standalone numeral-free paper card: rotate with each hand position at runtime.
add('card',p,[323,630,480,837],12,[[[345,670,466,800],[342,641,464,664]]])
# Hand silhouettes retain the source wrists/fingers, with all card interiors excluded.
add('hands',p,[0,736,941,1165],0,polygon=[[0,858],[72,780],[148,745],[161,773],[196,810],[247,797],[274,800],[302,818],[288,845],[247,879],[207,908],[139,931],[157,967],[127,1037],[82,1127],[0,1165]])
add('hand-right',p,[637,737,941,1076],0,polygon=[[637,823],[648,806],[667,801],[692,812],[735,838],[757,784],[768,747],[805,744],[864,776],[898,816],[941,870],[941,1076],[858,1035],[811,951],[765,914],[700,888],[659,852]])
for prefix,src,rects in [('prep',p,[[183,972,371,1052],[379,972,567,1052],[571,972,759,1052],[168,1056,370,1140],[376,1056,570,1140],[573,1056,777,1140],[155,1144,365,1231],[370,1144,577,1231],[578,1144,791,1231],[133,1236,361,1339],[366,1236,578,1339],[583,1236,808,1339]]),('play',g,[[87,1238,337,1312],[348,1238,593,1312],[604,1238,855,1312],[75,1314,334,1394],[344,1314,598,1394],[607,1314,866,1394],[62,1396,330,1478],[339,1396,601,1478],[612,1396,879,1478],[47,1484,324,1588],[336,1484,605,1588],[615,1484,899,1588]])]:
 for name,rect in zip(['1','2','3','4','5','6','7','8','9','delete','0','action'],rects):add(prefix+'-'+name,src,rect,18)
spec['card']['quad']=[300,609,321,866,503,849,488,594]
manifest={'coordinates':'left,top,right,bottom; 941x1672 source pixels','drawOrder':['existing persistent scene','opponent','panels','cards','hands','dynamic labels','buttons'],'dynamic':'All nicknames, readiness, round, timer, secret, draft and history come from session state. Fixed button lettering retained. Repairs copy same-source clean texture, not lossless crops.','assets':spec}
(DOC/'slices.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
for name,s in spec.items():
 src=Image.open(ROOT/'docs/design'/s['source']).convert('RGBA');l,t,r,b=s['rect'];im=src.crop((l,t,r,b))
 for target,sample in s['repairs']:
  x,y,z,w=target;tile=src.crop(sample);patch=Image.new('RGBA',(z-x,w-y))
  for py in range(0,w-y,tile.height):
   for px in range(0,z-x,tile.width):patch.paste(tile,(px,py))
  im.paste(patch,(x-l,y-t))
 if name=='card':
  im=src.transform((190,260),Image.Transform.QUAD,s['quad'],Image.Resampling.BICUBIC)
  tile=im.crop((35,42,155,59));patch=Image.new('RGBA',(130,157))
  for py in range(0,157,tile.height):
   for px in range(0,130,tile.width):patch.paste(tile,(px,py))
  im.paste(patch,(30,60))
 mask=Image.new('L',(im.width*4,im.height*4));d=ImageDraw.Draw(mask)
 if s['polygon']:d.polygon([((x-l)*4,(y-t)*4) for x,y in s['polygon']],fill=255)
 else:d.rounded_rectangle((2,2,mask.width-3,mask.height-3),s['radius']*4,fill=255)
 im.putalpha(mask.resize(im.size,Image.Resampling.LANCZOS));im.save(OUT/(name+'.png'),optimize=True)
for bg,label in [('#173E3C','dark'),('#eee3ce','light')]:
 sheet=Image.new('RGB',(1200,1700),bg);x=y=10;row=0
 for name in spec:
  im=Image.open(OUT/(name+'.png'));im.thumbnail((360,170))
  if x+im.width>1190:x=10;y+=row+28;row=0
  sheet.paste(im,(x,y),im);ImageDraw.Draw(sheet).text((x,y+im.height),name,fill='orange');x+=im.width+16;row=max(row,im.height)
 sheet.save(DOC/(label+'.jpg'))
