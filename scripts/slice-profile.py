"""Cut original complete profile controls; only nickname text remains editable."""
from pathlib import Path
from PIL import Image, ImageDraw
import json
root=Path(__file__).resolve().parents[1]
im=Image.open(root/'docs/design/02-profile.png').convert('RGBA')
out=root/'assets/resources/art/profile';out.mkdir(parents=True,exist_ok=True)
regions={
'back':((18,37,226,115),[(37,39),(206,39),(222,52),(224,96),(207,112),(35,110),(19,98),(19,56)]),
'heading':((283,143,657,254),[(306,146),(633,146),(653,169),(656,225),(635,249),(308,252),(286,231),(285,169)]),
'change-avatar':((318,619,620,698),[(343,622),(592,622),(616,653),(603,680),(580,694),(344,691),(321,663)]),
'wechat':((203,873,740,982),[(230,875),(713,875),(735,896),(737,950),(717,976),(226,980),(205,959),(205,901)]),
'cancel':((111,1386,432,1510),[(139,1389),(404,1389),(427,1407),(429,1485),(408,1505),(136,1507),(113,1486),(113,1412)]),
'save':((454,1386,826,1510),[(482,1388),(798,1389),(820,1410),(824,1482),(803,1503),(477,1507),(456,1486),(456,1412)]),
'input':((292,737,778,821),None),
}
manifest={}
for name,(rect,poly) in regions.items():
 x,y,r,b=rect;tile=im.crop(rect)
 if poly:
  mask=Image.new('L',(tile.width*4,tile.height*4));d=ImageDraw.Draw(mask);d.polygon([((a-x)*4,(b-y)*4) for a,b in poly],fill=255);tile.putalpha(mask.resize(tile.size,Image.Resampling.LANCZOS))
 else:
  # Remove the original example name; the input's backing is rendered separately.
  mask=Image.new('L',tile.size,255);ImageDraw.Draw(mask).rectangle((16,10,207,73),fill=0);tile.putalpha(mask)
 if name == 'wechat':
  # Follow the curved outer silhouette; the old polygon cut through the rounded bevel.
  mask=Image.new('L',(tile.width*4,tile.height*4));d=ImageDraw.Draw(mask)
  points=[]
  def curve(a,b,c,e):
   for step in range(25):
    t=step/24;u=1-t
    points.append((4*(u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*e[0]),4*(u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*e[1])))
  curve((29,1),(170,1),(360,1),(508,1))
  curve((508,1),(523,1),(530,11),(531,25))
  curve((531,25),(532,42),(533,63),(533,78))
  curve((533,78),(533,92),(523,102),(509,103))
  curve((509,103),(350,104),(170,104),(27,104))
  curve((27,104),(12,104),(1,95),(1,80))
  curve((1,80),(2,61),(3,42),(4,26))
  curve((4,26),(5,11),(13,2),(29,1))
  d.polygon(points,fill=255);tile.putalpha(mask.resize(tile.size,Image.Resampling.LANCZOS))
 tile.save(out/(name+'.png'),optimize=True);manifest[name]=list(rect)
for i,rect in enumerate([(349,379,591,621),(307,1090,466,1249),(489,1090,648,1249),(672,1090,831,1249)]):
 tile=im.crop(rect);mask=Image.new('L',(636,636));ImageDraw.Draw(mask).ellipse((4,4,632,632),fill=255);tile.putalpha(mask.resize(tile.size,Image.Resampling.LANCZOS));tile.save(out/f'avatar-{i}.png',optimize=True);manifest[f'avatar-{i}']=list(rect)
(root/'docs/design/profile-slices.json').write_text(json.dumps(manifest,indent=2)+'\n')
