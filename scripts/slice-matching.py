from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import json
ROOT=Path(__file__).resolve().parents[1];src=Image.open(ROOT/'docs/design/07-matching.png').convert('RGBA');out=ROOT/'assets/resources/art/matching';out.mkdir(exist_ok=True,parents=True);manifest={}
TOP=[(425,676),(431,669),(450,663),(472,660),(493,664),(515,672),(518,679),(507,690),(487,703),(473,716),(458,703),(439,691)]
BOTTOM=[(424,801),(429,791),(448,781),(469,769),(476,770),(494,783),(514,792),(520,802),(506,810),(439,813)]
def shape(rect,polygon=None,ellipse=None,radius=None):
 l,t,r,b=rect;m=Image.new('L',((r-l)*4,(b-t)*4));d=ImageDraw.Draw(m)
 if polygon:d.polygon([((x-l)*4,(y-t)*4) for x,y in polygon],fill=255)
 if ellipse:d.ellipse(tuple((v-(l if i%2==0 else t))*4 for i,v in enumerate(ellipse)),fill=255)
 if radius is not None:d.rounded_rectangle((0,0,m.width-1,m.height-1),radius=radius*4,fill=255)
 return m.resize((r-l,b-t),Image.Resampling.LANCZOS)
def patch(im,rect,target,sample):
 l,t,r,b=target;texture=src.crop(sample).resize((r-l,b-t),Image.Resampling.BICUBIC);im.paste(texture,(l-rect[0],t-rect[1]))
def base_repair(im,rect):
 patch(im,rect,(382,876,560,943),(366,887,383,938))
 # Bronze disk underneath the detached hourglass, using its unoccluded left surface.
 l,t,r,b=(354,704,590,860)
 texture=src.crop((620,800,640,815)).resize((r-l,b-t),Image.Resampling.BICUBIC)
 mask=Image.new('L',texture.size);ImageDraw.Draw(mask).rectangle((10,0,r-l-11,b-t-11),fill=255);mask=mask.filter(ImageFilter.GaussianBlur(5))
 im.paste(texture,(l-rect[0],t-rect[1]),mask)
def name_repair(im,rect):patch(im,rect,(394,1233,550,1272),(377,1236,393,1270))
def cut(name,rect,polygon=None,ellipse=None,radius=None,repair=None):
 im=src.crop(rect)
 if repair:repair(im,rect)
 m=shape(rect,polygon,ellipse,radius);im.putalpha(m);im.save(out/(name+'.png'),optimize=True)
 manifest[name]={'rect':rect,'polygon':polygon,'ellipse':ellipse,'radius':radius,'repair':repair.__name__ if repair else None}
cut('opponent',(383,157,555,329),ellipse=(385,159,553,327))
# Isolate gold lettering/decorations from the dark teal background, retaining their antialiasing.
rect=(229,344,716,550);im=src.crop(rect);pixels=list(im.getdata());mask=Image.new('L',im.size);mask.putdata([round(max(0,min(1,(r-b-12)/38))*255) for r,g,b,a in pixels]);im.putalpha(mask);im.save(out/'heading.png',optimize=True);manifest['heading']={'rect':rect,'mask':'gold chroma alpha: clamp((R-B-12)/38), source lettering only'}
cut('base',(142,704,799,1010),ellipse=(143,704,797,1008),repair=base_repair)
rect=(365,559,579,851)
# Curves of the glass silhouette, plus the two upright posts and top/bottom plates.
polygon=[(367,585),(384,570),(423,561),(478,559),(528,565),(560,576),(577,589),(577,613),(563,628),(562,713),(568,727),(564,802),(575,816),(572,836),(549,847),(395,849),(371,836),(367,819),(380,801),(379,728),(384,712),(382,629),(369,615)]
im=src.crop(rect);m=shape(rect,polygon=polygon)
# Open the narrow gaps beside the glass while retaining the hand-painted reflections.
d=ImageDraw.Draw(m);d.polygon([(x-rect[0],y-rect[1]) for x,y in [(404,641),(409,672),(429,700),(453,721),(431,741),(409,780),(405,792)]],fill=0);d.polygon([(x-rect[0],y-rect[1]) for x,y in [(536,641),(531,672),(511,700),(487,721),(509,741),(531,780),(535,792)]],fill=0)
for poly in [TOP,BOTTOM]:
 hole=shape(rect,polygon=poly);m=Image.frombytes('L',m.size,bytes(max(0,a-b) for a,b in zip(m.tobytes(),hole.tobytes())))
# Original static stream is removed; runtime grains provide the moving stream.
ImageDraw.Draw(m).rectangle((465-365,715-559,477-365,778-559),fill=0)
im.putalpha(m);im.save(out/'glass.png',optimize=True);manifest['glass']={'rect':rect,'polygon':polygon,'holes':[TOP,BOTTOM],'streamRemoved':[465,715,477,778]}
cut('sand-top',(423,659,522,717),polygon=TOP)
cut('sand-bottom',(422,767,524,815),polygon=BOTTOM)
rect=(315,1040,626,1240);im=src.crop(rect);m=Image.new('L',im.size);d=ImageDraw.Draw(m)
for poly in [[(318,1191),(332,1163),(344,1180),(350,1204),(374,1230),(350,1231),(333,1220)],[(571,1230),(589,1203),(593,1176),(607,1169),(618,1193),(608,1220),(586,1237)]]:d.polygon([(x-rect[0],y-rect[1]) for x,y in poly],fill=255)
m=Image.frombytes('L',m.size,bytes(round(a*max(0,min(1,(rgba[0]-rgba[2]-12)/38))) for a,rgba in zip(m.tobytes(),im.getdata())))
im.putalpha(m)
rim=Image.open(ROOT/'assets/resources/art/profile/portrait-frame.png').convert('RGBA').resize((231,231),Image.Resampling.LANCZOS)
im.alpha_composite(rim,(41,4));im.save(out/'portrait-rim.png',optimize=True);manifest['portrait-rim']={'rect':rect,'rimSource':'assets/resources/art/profile/portrait-frame.png','reason':'original rim occluded by example hair; leaf ornaments are source crops'}
cut('nameplate',(337,1224,603,1284),polygon=[(339,1251),(353,1230),(368,1226),(572,1227),(590,1237),(601,1251),(589,1274),(573,1281),(363,1281),(348,1270)],repair=name_repair)
cut('cancel',(207,1390,734,1545),radius=66)
(ROOT/'docs/design/matching/slices.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
for bg,name in [('#183b38','dark'),('#f2eadb','light')]:
 sheet=Image.new('RGB',(1100,1100),bg);x=y=10;rh=0
 for key in manifest:
  im=Image.open(out/(key+'.png'));im.thumbnail((480,300))
  if x+im.width>1090:x=10;y+=rh+20;rh=0
  sheet.paste(im,(x,y),im);x+=im.width+20;rh=max(rh,im.height)
 sheet.save(ROOT/f'docs/design/matching/{name}-sheet.jpg')
