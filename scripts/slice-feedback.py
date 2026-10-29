"""Feedback v1 only. Rectangles are source pixel LTRB; no old assets overwritten."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter
import json,uuid,statistics,sys
import imagequant
R=Path(__file__).resolve().parents[1]; D=R/'docs/design/feedback-v1'; O=R/'assets/resources/art/feedback';O.mkdir(parents=True,exist_ok=True)
plan=[]
def add(name,src,rect,body=None,orn=None,repairs=None):
 plan.append(dict(name=name,source=src+'.png',rect=rect,body=body,ornament=orn,repairs=repairs or [],role='complete fixed artwork; patches reserve live content',mask='supersampled rounded silhouette plus raised ornament',order='background, artwork, live labels, controls'))
# neutral/gold self panels: native aggregate score and phase-dependent wording.
for name,x,y in [('own',542,82),('own-gold',1040,567)]:
 rect=[x,y-52,x+460,y+402]
 add(name,'01-own-feedback',rect,[x,y,x+460,y+402],[x+140,y-52,x+325,y+105],[[[x+67,y+68,x+396,y+144],[x+55,y+155,x+88,y+185]],[[x+80,y+175,x+385,y+280],[x+47,y+175,x+75,y+280]],[[x+50,y+304,x+413,y+361],[x+35,y+285,x+440,y+300]]])
# Opponent cards are source art with score and anonymous portrait cleared for dynamic content.
for i,(x,y) in enumerate([(89,79),(783,79),(89,374),(783,374),(89,667),(783,667)]):
 add('opponent-'+str(i),'02-opponent-feedback',[x,y,x+665,y+263],[x,y+28,x+665,y+263],None,[[[x+180,y+73,x+463,y+170],[x+177,y+178,x+448,y+190]],[[x+61,y+102,x+134,y+190],[x+180,y+178,x+220,y+190]]])
for i,rect in enumerate([[34,107,532,348],[540,107,998,348],[1006,107,1498,348]]):
 l,t,r,b=rect;add('timeout-'+str(i),'04-timeout-states',rect,[l,t+45,r,b],[l+(r-l)/2-50,t,l+(r-l)/2+50,t+100])
for i,rect in enumerate([[35,375,531,923],[540,375,998,923],[1006,375,1499,923]]):
 l,t,r,b=rect;add('timeout-end-'+str(i),'04-timeout-states',rect,rect,None,[[[l+60,778,r-60,878],[l+50,750,r-50,770]]])
# Neutral ending panels: static semantic text, separate return button.
for i,(x,y) in enumerate([(47,101),(641,101),(47,657),(641,657)]):
 add('cancel-'+str(i),'05-cancelled-states',[x,y,x+565,y+515],[x,y+71,x+565,y+515],[x+160,y,x+390,y+180],[[[x+110,y+331,x+463,y+464],[x+45,y+290,x+520,y+315]]])
add('home','05-cancelled-states',[157,432,509,551],[157,432,509,551])
# Success/reminder/error toast frames. Text is native and can wrap.
for name,rect in [('toast',[42,306,762,495]),('warning',[778,306,1499,495]),('turn',[42,85,762,271])]:
 l,t,r,b=rect;add(name,'08-notifications',rect,[l,t+30,r,b],[l+35,t,l+170,t+150],[[[l+215,t+65,r-40,b-35],[l+205,t+40,r-35,t+55]]])
# Result page separates heading, reason, recap, actions and actual data.
add('defeat-title','06-defeat-result',[83,110,860,414],[83,233,860,414],[278,110,670,315])
add('draw-title','07-draw-result',[147,114,797,526],[147,269,797,526],[349,114,603,341])
add('result-reason','06-defeat-result',[103,387,842,486],[103,387,842,486],None,[[[190,409,763,454],[152,403,181,464]]])
add('result-paper','06-defeat-result',[48,481,888,1288],[48,481,888,1288],None,[[[95,614,841,1154],[100,585,830,606]],[[285,1156,665,1264],[95,1170,260,1240]]])
for name,rect in [('records',[285,1155,665,1255]),('rematch',[89,1289,856,1438]),('match',[106,1440,474,1550]),('result-home',[489,1440,851,1550])]:add(name,'06-defeat-result',rect,rect)
for i,(x,y) in enumerate([(47,113),(641,113),(47,644),(641,644)]):
 add('end-'+str(i),'12-end-feedback',[x,y,x+565,y+466],[x,y+115,x+565,y+466],[x+145,y,x+410,y+215])
add('victory-title','12-end-feedback',[58,113,610,458],[58,232,610,458],[192,113,457,328])
# Rematch panels, their controls extracted separately.
for i,(l,r) in enumerate([(65,571),(636,1147),(1210,1712)]):
 add('rematch-'+str(i),'09-rematch-states',[l,106,r,793],[l,181,r,793],[l+155,106,r-155,270],[[[l+40,566,r-40,755],[l+30,533,r-30,551]]])
add('empty-ledger','10-records-empty-timeout',[263,351,516,596],[263,351,516,596])
# Loading panels: no dependency on these textures in actual failure fallback.
for i,(x,y) in enumerate([(104,76),(733,76),(104,685),(733,685)]):
 add('connection-'+str(i),'11-connection-loading',[x,y,x+467,y+479],[x,y+69,x+467,y+479],[x+145,y,x+330,y+164],[[[x+91,y+311,x+390,y+430],[x+40,y+279,x+427,y+300]]])
add('retry','11-connection-loading',[788,407,1095,512],[788,407,1095,512])
# Clean-paper samples were visually checked; tile, never stretch glyph-bearing strips.
clean={
 '01-own-feedback.png':[610,375,950,397],
 '02-opponent-feedback.png':[310,298,500,313],
 '04-timeout-states.png':[100,750,450,766],
 '05-cancelled-states.png':[120,390,500,416],
 '06-defeat-result.png':[106,1200,245,1235],
 '08-notifications.png':[280,352,660,369],
 '09-rematch-states.png':[150,550,490,566],
 '11-connection-loading.png':[155,344,510,359],
 '12-end-feedback.png':[120,554,500,566]
}
for a in plan:
 if a['name'].startswith('timeout-end-'):
  l,t,r,b=a['rect'];a['body']=[l+20,t+4,r-18,b-22]
 if a['name'].startswith('end-'):
  x,y=a['rect'][:2];a['repairs']=[[[x+60,y+340,x+515,y+420],clean[a['source']]]]
 if a['name'].startswith('opponent-'):
  x,y=a['rect'][:2];a['repairs']=[[[x+205,y+72,x+515,y+177],clean[a['source']]]]
 if a['name']=='result-reason':
  a['repairs']=[[[150,399,792,472],[106,1200,245,1235]]]
 if a['name'].startswith('connection-'):
  x,y=a['rect'][:2];a['repairs']=[[[x+36,y+300,x+420,y+443],clean[a['source']]]]
 for patch in a['repairs']:patch[1]=clean[a['source']]
 a['repairSource']='assets/resources/art/modals/record-row.png, crop [190,12,420,59], mirrored texture tile; reconstructed blank area, not lossless source extraction'
contours={
 'draw-title':[(0,204),(10,184),(24,177),(87,177),(104,165),(126,157),(181,155),(210,172),(222,195),(429,195),(445,163),(472,155),(515,156),(549,177),(627,177),(645,190),(650,209),(650,348),(642,370),(623,381),(441,381),(427,400),(402,410),(247,410),(220,399),(205,382),(27,382),(9,373),(0,351)],
 'result-home':[(0,23),(11,13),(17,3),(316,3),(325,13),(336,23),(339,29),(339,81),(329,91),(321,103),(17,103),(8,92),(0,84)],
 'home':[(16,25),(24,17),(31,6),(320,6),(330,16),(338,22),(338,96),(328,102),(320,111),(31,111),(23,101),(16,95)]
}

for a in plan:
 if a['name'] in contours:
  a['mask']='local source-crop silhouette at 3x supersampling; draw-title also uses crest ellipse [216,31,436,251] and top finial'
  a['contour']=contours[a['name']]
# Manifest written BEFORE producing assets.
(D/'implementation-slices.json').write_text(json.dumps({'coordinates':'source pixel LTRB','assets':plan},ensure_ascii=False,indent=2)+'\n')
# Optional targeted recut: never rewrite unrelated textures or the size registry.
selected=set(sys.argv[1:])
frames={}
for a in plan:
 if selected and a['name'] not in selected:continue
 im=Image.open(D/a['source']).convert('RGBA')
 for dest,sample in a['repairs']:
  l,t,r,b=dest
  piece=Image.open(R/'assets/resources/art/modals/record-row.png').convert('RGBA').crop((190,12,420,59))
  tile=Image.new('RGBA',(r-l,b-t))
  for yy in range(0,b-t,piece.height):
   for xx in range(0,r-l,piece.width):tile.paste(piece.transpose(Image.Transpose.FLIP_TOP_BOTTOM) if yy//piece.height%2 else piece,(xx,yy))
  # Match the existing paper luminance and feather only the repair edge.
  original=Image.open(D/a['source']).convert('RGB')
  colors=[p for p in original.crop(dest).getdata() if p[0]>190 and p[1]>155 and p[2]>100]
  if colors:
   target=tuple(statistics.median(c[i] for c in colors) for i in range(3))
   source=tuple(statistics.median(c[i] for c in piece.getdata()) for i in range(3))
   delta=[target[i]-source[i] for i in range(3)]
   tile.putdata([tuple(max(0,min(255,int(p[i]+delta[i]))) for i in range(3))+(255,) for p in tile.getdata()])
  feather=Image.new('L',tile.size);ImageDraw.Draw(feather).rectangle((5,5,tile.width-6,tile.height-6),fill=255);feather=feather.filter(ImageFilter.GaussianBlur(3))
  im.paste(tile,(l,t),feather)
 mask=Image.new('L',(im.width*3,im.height*3));draw=ImageDraw.Draw(mask)
 body=a['body'] or a['rect'];draw.rounded_rectangle(tuple(v*3 for v in body),radius=24*3,fill=255)
 if a['ornament']:draw.ellipse(tuple(v*3 for v in a['ornament']),fill=255)
 if a['name'].startswith('opponent-'):
  x,y=a['rect'][:2];draw.rounded_rectangle(( (x+160)*3,y*3,(x+500)*3,(y+64)*3),radius=14*3,fill=255)
 if a['name']=='defeat-title':
  draw.rectangle((0,0,mask.width,mask.height),fill=0)
  draw.polygon([(x*3,y*3) for x,y in [(83,300),(142,303),(173,263),(190,225),(315,203),(360,179),(405,172),(430,147),(462,138),(470,113),(487,140),(517,152),(548,175),(595,187),(625,204),(735,209),(755,237),(795,274),(860,300),(827,332),(849,359),(848,401),(795,401),(770,414),(175,414),(150,401),(90,401),(90,364),(117,336)]],fill=255)
 # Follow the actual ornament/button outline, not the rectangular screenshot crop.
 # Coordinates below are local to each source rect; supersampling preserves antialiasing.
 if a['name'] in contours:
  draw.rectangle((0,0,mask.width,mask.height),fill=0)
  l,t,_,_=a['rect']
  draw.polygon([((l+x)*3,(t+y)*3) for x,y in contours[a['name']]],fill=255)
  if a['name']=='draw-title':
   draw.ellipse(((l+216)*3,(t+31)*3,(l+436)*3,(t+251)*3),fill=255)
   draw.polygon([((l+x)*3,(t+y)*3) for x,y in [(306,42),(318,24),(325,7),(333,26),(347,44)]],fill=255)
 mask=mask.resize(im.size,Image.Resampling.LANCZOS);im.putalpha(mask)
 tile=im.crop(a['rect']);tile.thumbnail((850,850),Image.Resampling.LANCZOS)
 packed=imagequant.quantize_pil_image(tile,min_quality=80,max_quality=93);packed.save(O/(a['name']+'.png'),optimize=True)
 frames[a['name']]=tile
 meta=O/(a['name']+'.png.meta')
 if not meta.exists():
  data=json.loads((R/'assets/resources/art/modals/record-row.png.meta').read_text());old=data['uuid'];data=json.loads(json.dumps(data).replace(old,str(uuid.uuid4())).replace('record-row',a['name']));meta.write_text(json.dumps(data,indent=2)+'\n')
for color,name in [('#173b36','dark'),('#fff4df','light')]:
 sheet=Image.new('RGB',(1200,((len(frames)+3)//4)*250),color);d=ImageDraw.Draw(sheet)
 for i,(key,tile) in enumerate(frames.items()):
  tile=tile.copy();tile.thumbnail((285,220));x=i%4*300;y=i//4*250;sheet.paste(tile,(x,y+24),tile);d.text((x,y),key,fill='#c08050')
 sheet.save(D/(name+('-recut' if selected else '-slices')+'.jpg'))
if not selected:(R/'assets/scripts/shared/feedback-art.ts').write_text('// Generated by scripts/slice-feedback.py\nexport const FEEDBACK_SIZES: Record<string, readonly number[]> = '+json.dumps({k:list(v.size) for k,v in frames.items()},indent=2)+';\n')
print(len(frames),'assets generated')
