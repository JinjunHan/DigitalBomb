"""Targeted original-art recuts. No new painted controls; source-space masks at 4x."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageChops,ImageFilter,ImageOps
import json,re,uuid,imagequant
R=Path(__file__).resolve().parents[1];D=R/'docs/design/ui-repairs-v2';D.mkdir(exist_ok=True)
plan=[]
def add(folder,key,src,rect,points,**kw):plan.append(dict(folder=folder,key=key,source=src,rect=rect,outline=points,**kw))
# Explicit silhouettes exclude photographic background and paper beneath controls.
for key,rect in [('toast',[42,306,762,495]),('warning',[778,306,1499,495]),('turn',[42,85,762,271])]:
 add('feedback',key,'docs/design/feedback-v1/08-notifications.png',rect,[(12,41),(21,28),(43,24),(56,9),(667,9),(680,23),(696,28),(705,40),(705,148),(695,163),(678,171),(663,179),(55,179),(44,169),(25,165),(13,151)],ellipse=[40,11,194,169],finial=[(113,13),(118,0),(126,16),(124,33),(116,29)],blank=[204,47,687,157],sample=[300,342,650,370] if key!='turn' else [300,116,650,141])
for i,rect in enumerate([[34,107,532,348],[540,107,998,348],[1006,107,1498,348]]):
 l,t,r,b=rect;w=r-l;left=28 if i==0 else 8;right=w-3 if i==0 else w-10 if i==1 else w-22
 add('feedback','timeout-'+str(i),'docs/design/feedback-v1/04-timeout-states.png',rect,[(left,67),(left+8,50),(left+24,44),(right-24,44),(right-8,51),(right,65),(right,216),(right-8,230),(left+16,230),(left,218)],ellipse=[[247-l,0,349-l,100],[716-l,0,819-l,100],[1188-l,0,1292-l,100]][i])
# Main defeat plaque only. Lower reason is native text; ribbon contour excludes the reason panel.
add('feedback','defeat-title','docs/design/feedback-v1/06-defeat-result.png',[65,110,880,475],[(119, 137), (133, 129), (140, 113), (161, 113), (176, 100), (164, 89), (183, 95), (254, 80), (260, 71), (272, 76), (331, 65), (336, 54), (347, 60), (361, 65), (461, 65), (473, 53), (485, 58), (480, 69), (543, 80), (551, 73), (565, 79), (558, 88), (627, 98), (639, 89), (655, 97), (648, 111), (673, 115), (682, 128), (694, 136), (691, 235), (681, 257), (659, 269), (149, 269), (130, 263), (117, 240)],ellipse=[362,35,456,119],finial=[(398,35),(405,14),(412,33),(415,45)],ribbons=True,reasonPanel=True,blank=[185,299,650,346],sample=[300,399,640,409])
add('modals','live-latest','docs/design/modals/04-guess-records.png',[615,1243,810,1307],[(3,13),(12,4),(181,4),(191,12),(191,49),(183,57),(12,57),(3,49)])
# The original inactive tab is open-bottom and shares a lower rail with the paper. Close it using its own top edge.
add('modals','tab-off','docs/design/modals/04-guess-records.png',[477,476,817,564],[(0,26),(10,20),(12,14),(25,6),(315,6),(330,15),(331,26),(339,30),(339,58),(331,62),(330,73),(315,82),(25,82),(12,74),(10,68),(0,62)],blank=[46,17,300,72],sample=[250,1250,550,1290],mirrorHalf=True)
# Palm outlines follow skin/sleeve, excluding old card edges and the wooden tabletop.
prep='docs/design/04-preparation.png';play='docs/design/05-gameplay-v2.png'
left=[(0,858),(33,814),(60,785),(100,764),(154,743),(177,840),(214,825),(249,808),(275,800),(289,801),(298,810),(297,822),(286,838),(262,859),(235,877),(213,895),(194,910),(174,930),(159,951),(160,968),(142,1006),(120,1047),(81,1110),(0,1165)]
right=[(645,820),(649,808),(659,801),(672,801),(697,812),(729,834),(762,845),(774,812),(785,775),(790,742),(810,751),(835,763),(856,778),(873,799),(892,831),(915,857),(941,864),(941,1076),(858,1035),(814,957),(788,929),(771,908),(746,889),(713,873),(682,856),(659,838)]
pl=[(184,1040),(205,1027),(227,1018),(235,1014),(252,1080),(279,1067),(307,1059),(324,1059),(334,1066),(336,1076),(330,1088),(311,1104),(283,1120),(258,1136),(237,1153),(225,1192),(184,1192),(195,1158),(205,1128),(193,1098)]
pr=[(614,1076),(619,1065),(629,1060),(640,1062),(663,1071),(687,1080),(700,1043),(707,1013),(725,1020),(743,1033),(757,1050),(772,1074),(784,1095),(798,1094),(818,1103),(840,1120),(860,1130),(886,1141),(910,1152),(941,1170),(941,1194),(789,1194),(766,1168),(741,1151),(713,1140),(682,1129),(650,1112),(628,1096)]
lt=[(130,863),(171,845),(214,825),(249,808),(275,800),(289,801),(298,810),(297,822),(286,838),(262,859),(235,877),(213,895),(185,914),(161,927),(143,916)]
rt=[(645,820),(649,808),(659,801),(672,801),(697,812),(729,834),(762,845),(789,850),(814,852),(817,929),(788,929),(771,908),(746,889),(713,873),(682,856),(659,838)]
plt=[(219,1091),(251,1080),(279,1067),(307,1059),(324,1059),(334,1066),(336,1076),(330,1088),(311,1104),(283,1120),(258,1136),(237,1153),(218,1140)]
prt=[(614,1076),(619,1065),(629,1060),(640,1062),(663,1071),(687,1080),(710,1087),(736,1095),(766,1110),(757,1159),(713,1140),(682,1129),(650,1112),(628,1096)]
for key,src,rect,points in [('hands',prep,[0,736,941,1165],left),('hand-right',prep,[637,737,941,1076],right),('right-thumb',prep,[640,797,819,935],rt),('left-thumb',prep,[0,736,941,1165],lt),('play-hand-left',play,[184,991,340,1192],pl),('play-hand-right',play,[610,1004,941,1194],pr),('play-left-thumb',play,[184,991,340,1192],plt),('play-right-thumb',play,[610,1004,941,1194],prt)]:
 add('battle',key,src,rect,[(x-rect[0],y-rect[1])for x,y in points])
(D/'manifest.json').write_text(json.dumps({'coordinates':'Source rect LTRB; outline coordinates relative to crop. Curved 4x antialiased masks; native labels above art. Palms below cards, thumbs above cards.','assets':plan},indent=2)+'\n')
def curved(points):
 result=[]
 for i,(x,y)in enumerate(points):
  prev=points[i-1];nxt=points[(i+1)%len(points)];a=(x+(prev[0]-x)*.16,y+(prev[1]-y)*.16);b=(x+(nxt[0]-x)*.16,y+(nxt[1]-y)*.16)
  for j in range(9):
   t=j/8;result.append(((1-t)**2*a[0]+2*(1-t)*t*x+t*t*b[0],(1-t)**2*a[1]+2*(1-t)*t*y+t*t*b[1]))
 return [(x*4,y*4)for x,y in result]
def pack(im):
 packed=imagequant.quantize_pil_image(im,min_quality=80,max_quality=95,max_colors=255)
 palette=packed.getpalette('RGBA');palette += [0]*(1024-len(palette));palette[1020:1024]=[0,0,0,0]
 pixels=bytearray(packed.tobytes())
 for i,a in enumerate(im.getchannel('A').tobytes()):
  if a==0:pixels[i]=255
 result=Image.frombytes('P',im.size,bytes(pixels));result.putpalette(palette,rawmode='RGBA');return result
for item in plan:
 src=Image.open(R/item['source']).convert('RGBA');im=src.crop(item['rect']);w,h=im.size
 if item.get('mirrorHalf'):im.paste(im.crop((0,0,w,h//2)).transpose(Image.Transpose.FLIP_TOP_BOTTOM),(0,h//2))
 if 'blank'in item:
  l,t,r,b=item['blank'];patch=src.crop(item['sample']).resize((r-l,b-t),Image.Resampling.BICUBIC)
  feather=Image.new('L',patch.size,255);border=Image.new('L',(patch.width+12,patch.height+12));border.paste(feather,(6,6));border=border.filter(ImageFilter.GaussianBlur(2));im.paste(patch,(l,t),border.crop((6,6,patch.width+6,patch.height+6)))
 if item.get('reasonPanel'):im.paste(im.crop((114,275,662,293)).transpose(Image.Transpose.FLIP_TOP_BOTTOM),(114,347))
 if item.get('closeBottom'):
  # Use the same art rail, mirrored vertically; fixed-size paired tabs share one closed silhouette.
  im.paste(im.crop((0,0,w,13)).transpose(Image.Transpose.FLIP_TOP_BOTTOM),(0,h-13))
 mask=Image.new('L',(w*4,h*4));d=ImageDraw.Draw(mask);d.polygon(curved(item['outline']),fill=255)
 if item.get('ribbons'):
  ribbon=[(68,334),(112,327),(149,337),(182,346),(204,352),(204,462),(178,468),(153,459),(148,420),(109,416),(70,425),(94,377)]
  for points in [ribbon,[(940-x,y)for x,y in ribbon]]:d.polygon(curved([(x-65,y-110)for x,y in points]),fill=255)
 if item.get('reasonPanel'):d.polygon(curved([(115,288),(128,275),(638,275),(650,286),(662,295),(662,347),(650,364),(126,364),(114,350),(114,302)]),fill=255)
 if 'ellipse'in item:d.ellipse(tuple(v*4 for v in item['ellipse']),fill=255)
 if item['key'].startswith('timeout-'):
  cx=(item['ellipse'][0]+item['ellipse'][2])/2
  leaf=[(-77,38),(-73,30),(-65,47),(-54,50),(-48,61),(-62,69),(-81,63),(-70,59),(-80,52)]
  for sign in [-1,1]:d.polygon(curved([(cx+sign*x,y)for x,y in leaf]),fill=255)
 if 'finial'in item:d.polygon(curved(item['finial']),fill=255)
 im.putalpha(mask.resize((w,h),Image.Resampling.LANCZOS));out=R/'assets/resources/art'/item['folder']/(item['key']+'.png');packed=pack(im);packed.save(out,optimize=True)
 meta=Path(str(out)+'.meta')
 if not meta.exists():
  template=json.loads((R/'assets/resources/art/battle/right-thumb.png.meta').read_text());old=template['uuid'];template=json.loads(json.dumps(template).replace(old,str(uuid.uuid4())).replace('right-thumb',item['key']));meta.write_text(json.dumps(template,indent=2)+'\n')
# Selection edge is derived from the CURRENT paper art, so aspect and corner curvature match exactly.
card=Image.open(R/'assets/resources/art/battle/card-paper.png').convert('RGBA');a=card.getchannel('A');pad=ImageOps.expand(a,8,fill=0);inner=pad.filter(ImageFilter.MinFilter(15)).crop((8,8,8+a.width,8+a.height));card.putalpha(ImageChops.subtract(a,inner));card=pack(card);card.save(R/'assets/resources/art/battle/card-selected.png',optimize=True)
p=R/'assets/scripts/shared/feedback-art.ts';s=p.read_text();s=re.sub(r'("defeat-title": \[)\s*777,\s*304',r'\1\n    815,\n    365',s);p.write_text(s)
p=R/'assets/scripts/shared/battle-art.ts';s=p.read_text();values=json.loads(s[s.index('{'):].rstrip().rstrip(';'));values.update({'left-thumb':[0,736,941,1165],'play-left-thumb':[184,991,340,1192],'play-right-thumb':[610,1004,941,1194]});p.write_text('/** Source rectangles: battle/slices.json and ui-repairs-v2/manifest.json. */\nexport const BATTLE_RECTS: Record<string, readonly number[]> = '+json.dumps(values,indent=2)+';\n')
for bg,name in [('#173e3c','dark'),('#fff4df','light')]:
 sheet=Image.new('RGB',(1200,((len(plan)+2)//3)*250),bg);d=ImageDraw.Draw(sheet)
 for i,item in enumerate(plan):
  im=Image.open(R/'assets/resources/art'/item['folder']/(item['key']+'.png')).convert('RGBA');im.thumbnail((380,210));x=i%3*400;y=i//3*250;sheet.paste(im,(x,y+25),im);d.text((x+5,y+5),item['key'],fill='#b98134')
 sheet.save(D/(name+'.jpg'),quality=94)
print('Repaired',len(plan),'cutouts and matching card selection border.')
