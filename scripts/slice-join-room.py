"""Reproducible layered cuts of 08-join-room, with documented texture repairs."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import json
ROOT=Path(__file__).resolve().parents[1]
src=Image.open(ROOT/'docs/design/08-join-room.png').convert('RGBA')
out=ROOT/'assets/resources/art/join';out.mkdir(parents=True,exist_ok=True)
manifest={}
def patch(tile,rect,target,sample):
 l,t,r,b=target
 texture=src.crop(sample).resize((r-l,b-t),Image.Resampling.BICUBIC)
 mask=Image.new('L',texture.size);ImageDraw.Draw(mask).rectangle((3,3,r-l-4,b-t-4),fill=255)
 tile.paste(texture,(l-rect[0],t-rect[1]),mask.filter(ImageFilter.GaussianBlur(2)))
def paper_repair(tile,rect):
 for l,r in [(231,306),(369,443),(511,576),(642,713)]:patch(tile,rect,(l,507,r,604),(l,498,r,507))
 patch(tile,rect,(216,714,727,846),(220,690,730,710))
 patch(tile,rect,(239,846,707,954),(230,690,730,710))
 edge=tile.crop((748-rect[0],0,820-rect[0],rect[3]-rect[1])).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
 tile.paste(edge,(121-rect[0],0))
def keyboard_repair(tile,rect):
 # Only the covered central key field is replaced; border, corners and stitching survive.
 patch(tile,rect,(61,1098,880,1562),(340,1105,352,1190))
def cut(name,rect,polygon=None,radius=None,repair=None):
 tile=src.crop(rect)
 if repair:repair(tile,rect)
 w,h=tile.size;mask=Image.new('L',(w*4,h*4));d=ImageDraw.Draw(mask)
 if polygon:d.polygon([((x-rect[0])*4,(y-rect[1])*4) for x,y in polygon],fill=255)
 else:d.rounded_rectangle((0,0,w*4-1,h*4-1),radius=(radius or 0)*4,fill=255)
 tile.putalpha(mask.resize((w,h),Image.Resampling.LANCZOS));tile.save(out/(name+'.png'),optimize=True)
 manifest[name]={'rect':rect,'polygon':polygon,'radius':radius,'repair':repair.__name__ if repair else None}
cut('back',(26,46,227,122),[(27,80),(45,52),(59,47),(205,48),(217,64),(225,81),(216,105),(201,119),(53,117),(39,105)])
cut('heading',(249,65,696,256),[(250,169),(269,145),(292,135),(307,125),(400,125),(417,110),(436,99),(463,91),(463,77),(469,66),(477,76),(477,92),(504,98),(525,110),(544,125),(633,125),(647,135),(668,138),(691,163),(694,216),(676,242),(657,253),(288,254),(270,242),(251,222)])
cut('paper',(120,292,823,998),[(121,943),(142,375),(148,361),(165,349),(204,343),(217,333),(401,332),(423,311),(448,298),(472,294),(494,299),(516,313),(540,332),(728,332),(743,344),(775,345),(791,356),(799,374),(820,943),(811,964),(790,980),(750,984),(735,993),(207,993),(188,985),(150,981),(132,967)],repair=paper_repair)
cut('join',(221,716,723,842),[(223,750),(237,734),(251,720),(687,720),(704,732),(720,748),(721,802),(706,820),(693,833),(250,835),(233,823),(223,807)])
cut('create',(244,849,699,949),[(247,873),(258,863),(270,853),(672,853),(686,865),(696,878),(697,922),(682,936),(670,944),(271,944),(255,935),(246,924)])
cut('keyboard',(0,1047,941,1632),[(3,1537),(57,1093),(90,1069),(139,1055),(788,1055),(844,1072),(878,1096),(939,1553),(940,1631),(0,1631)],repair=keyboard_repair)
keys=[('1',(103,1100,341,1200)),('2',(353,1100,591,1200)),('3',(604,1100,842,1200)),('4',(90,1205,337,1309)),('5',(350,1205,594,1309)),('6',(607,1205,854,1309)),('7',(77,1315,332,1422)),('8',(347,1315,598,1422)),('9',(611,1315,867,1422)),('clear',(58,1430,327,1559)),('0',(340,1430,601,1559)),('delete',(613,1430,883,1559))]
for key,rect in keys:cut('key-'+key,rect,radius=23)
(ROOT/'docs/design/join-room/slices.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
for bg,name in [('#213936','dark'),('#f4ecdc','light')]:
 sheet=Image.new('RGB',(1200,1500),bg);x=y=10;row=0
 for key in manifest:
  im=Image.open(out/(key+'.png'));im.thumbnail((390,400))
  if x+im.width>1190:x=10;y+=row+20;row=0
  sheet.paste(im,(x,y),im);x+=im.width+15;row=max(row,im.height)
 sheet.save(ROOT/f'docs/design/join-room/{name}-sheet.jpg')
