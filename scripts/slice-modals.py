"""Reproducible modal crops. Coordinates are source pixels, LTRB, 941 x 1672.
Texture repairs use only documented clean samples from the same design.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import json, uuid
import imagequant  # pip install pillow imagequant
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/resources/art/modals'; OUT.mkdir(parents=True,exist_ok=True)
DOC=ROOT/'docs/design/modals'
# Body bounds, raised top ornament outline, independent controls (whole fixed lettering).
SPECS={
 'settings':('01-settings',[78,292,863,1497],[(215,294),(218,272),(245,244),(274,225),(382,225),(403,190),(444,163),(462,134),(479,148),(498,174),(536,197),(559,225),(662,225),(684,246),(722,276),(725,294)],{'back':[90,330,192,434],'done':[177,1272,766,1425]}),
 'rules':('02-rules',[54,199,889,1526],[(231,210),(232,182),(254,162),(393,162),(426,124),(458,109),(468,85),(484,106),(519,132),(546,161),(681,160),(710,183),(710,211)],{'back':[77,229,170,319],'done':[216,1349,725,1482]}),
 'menu':('03-table-menu',[92,382,851,1297],[(201,389),(208,366),(340,365),(376,336),(428,313),(468,291),(486,313),(534,331),(575,366),(725,366),(742,386)],{'back':[121,401,221,502],'continue':[158,647,784,860],'resign':[169,887,773,1054]}),
 'live':('04-guess-records',[80,237,862,1565],[(246,245),(256,202),(286,196),(299,181),(388,181),(415,146),(458,131),(469,112),(483,134),(523,150),(549,192),(682,192),(705,211),(745,239)],{'back':[61,201,269,297],'done':[194,1370,750,1501],'latest':[615,1243,810,1307]}),
 'result':('05-result-records',[61,304,868,1464],[(217,311),(220,239),(243,216),(252,190),(395,189),(425,150),(458,137),(469,116),(488,139),(523,159),(548,190),(687,190),(703,216),(724,240),(725,309)],{'back':[37,220,219,304],'done':[220,1271,724,1398]}),
 'lock':('06-lock-secret',[73,433,867,1301],[(309,439),(344,416),(373,416),(389,388),(426,363),(461,355),(469,345),(483,365),(516,372),(555,415),(589,418),(625,439)],{'back':[72,404,180,510],'cancel':[132,1066,450,1214],'confirm':[457,1066,812,1214]}),
 'repeat':('07-repeat-guess',[70,390,875,1257],[(311,398),(334,375),(378,372),(397,339),(431,318),(460,309),(469,292),(483,308),(523,326),(559,372),(592,373),(622,396)],{'back':[128,439,350,527],'cancel':[137,1003,463,1148],'confirm':[479,1003,809,1148]}),
 'leave':('08-leave-preparation',[94,350,852,1338],[(354,356),(391,344),(410,324),(439,308),(470,301),(504,309),(532,326),(550,345),(585,354)],{'back':[97,333,192,428],'confirm':[190,951,754,1080],'cancel':[184,1095,759,1244]}),
 'close':('09-close-room',[103,348,842,1352],[(344,352),(389,337),(410,317),(445,301),(469,291),(492,307),(524,319),(553,345),(590,353)],{'back':[133,378,236,486],'cancel':[179,977,765,1130],'confirm':[190,1142,753,1274]}),
 'resign':('10-resign',[84,341,859,1368],[(246,346),(265,328),(300,327),(313,315),(397,314),(418,290),(455,278),(469,265),(488,282),(529,297),(550,317),(630,318),(652,329),(683,331),(701,346)],{'back':[133,384,222,472],'cancel':[180,997,765,1156],'confirm':[230,1166,716,1291]}),
 'reconnect':('11-reconnect',[120,382,824,1295],[(190,388),(207,368),(379,365),(401,339),(432,319),(469,311),(505,318),(538,339),(560,365),(733,367),(752,388)],{'retry':[192,1064,752,1207]})
}
manifest={'sourceSize':[941,1672],'coordinates':'[left, top, right, bottom], source pixels','order':['body','controls','dynamic labels / rows'],'pages':{},'assets':{}}
images={}
def patch(im,target,sample,tile=False):
    l,t,r,b=target
    if tile:
        strip=im.crop(sample).resize((r-l,sample[3]-sample[1]),Image.Resampling.BICUBIC)
        texture=Image.new('RGBA',(r-l,b-t))
        for y in range(0,b-t,strip.height):
            texture.paste(strip if y//strip.height%2==0 else strip.transpose(Image.Transpose.FLIP_TOP_BOTTOM),(0,y))
    else: texture=im.crop(sample).resize((r-l,b-t),Image.Resampling.BICUBIC)
    mask=Image.new('L',texture.size,255)
    # Feather only within the target; sample glyphs stay outside the blend boundary.
    edge=Image.new('L',(texture.width+12,texture.height+12)); edge.paste(mask,(6,6));edge=edge.filter(ImageFilter.GaussianBlur(2))
    im.paste(texture,(l,t),edge.crop((6,6,texture.width+6,texture.height+6)))
def save(name,im,rect,source,role,mask,repairs=None):
    # Alpha-aware palette optimization; source PNGs remain the lossless reference.
    packed=imagequant.quantize_pil_image(im,min_quality=85,max_quality=95)
    packed.save(OUT/(name+'.png'),optimize=True)
    images[name]=packed.convert('RGBA')
    manifest['assets'][name]={'source':source+'.png','rect':rect,'role':role,'mask':mask,'textureRepairs':repairs or [],'encoding':'libimagequant RGBA palette, min quality 85 / target 95, dither 1.0'}
    meta=OUT/(name+'.png.meta')
    if not meta.exists():
        data=json.loads((ROOT/'assets/resources/art/friend/copy.png.meta').read_text()); old=data['uuid']; new=str(uuid.uuid4()); data=json.loads(json.dumps(data).replace(old,new).replace('"copy"',json.dumps(name)));meta.write_text(json.dumps(data,indent=2)+'\n')
def rounded(im,rect,radius):
    tile=im.crop(rect);w,h=tile.size;m=Image.new('L',(w*3,h*3));ImageDraw.Draw(m).rounded_rectangle((0,0,w*3-1,h*3-1),radius=radius*3,fill=255);tile.putalpha(m.resize((w,h),Image.Resampling.LANCZOS));return tile
for key,(source,bounds,top,controls) in SPECS.items():
    src=Image.open(DOC/(source+'.png')).convert('RGBA'); body=src.copy(); repairs=[]
    # Independent controls retain all artwork. Their old location is repaired with nearby paper.
    for name,rect in controls.items():
        radius=min(36,(rect[3]-rect[1])/2) if name!='back' else (min(rect[2]-rect[0],rect[3]-rect[1])/2 if rect[2]-rect[0]<120 else 32)
        save(key+'-'+name,rounded(src,rect,radius),rect,source,'fixed-text interactive control',{'rounded':radius})
        if name=='back':
            # Mirror the matching right-hand border for controls crossing the left frame.
            l,t,r,b=rect; sample=(941-r,t,941-l,b); body.paste(src.crop(sample).transpose(Image.Transpose.FLIP_LEFT_RIGHT),(l,t));repairs.append({'target':rect,'mirrorSample':sample})
        else:
            sample=(bounds[0]+50,rect[1]-20,bounds[2]-50,rect[1]-8)
            patch(body,rect,sample);repairs.append({'target':rect,'sample':sample})
    if key=='settings':
        for i,y in enumerate([542,733,923,1114]):
            rect=[609,y,774,y+88]; sample=[540,y,600,y+88];patch(body,rect,sample);repairs.append({'target':rect,'sample':sample})
        for name,rect in [('toggle-on',[610,542,774,630]),('toggle-off',[610,1114,774,1202])]: save(name,rounded(src,rect,43),rect,source,'dynamic setting state',{'rounded':43})
    if key in ('lock','repeat'):
        centers=[214,385,557,729] if key=='lock' else [225,389,553,717]
        for x in centers:
            target=[x-52,757 if key=='lock' else 743,x+52,884 if key=='lock' else 846];sample=[x-64,757 if key=='lock' else 743,x-54,884 if key=='lock' else 846]
            patch(body,target,sample);repairs.append({'target':target,'sample':sample})
    if key in ('close','reconnect'):
        target=[bounds[0],780,bounds[0]+72,1120];l,t,r,b=target;sample=[941-r,t,941-l,b]
        body.paste(src.crop(sample).transpose(Image.Transpose.FLIP_LEFT_RIGHT),(l,t));repairs.append({'target':target,'mirrorSample':sample})
    if key in ('live','result'):
        target=[122,475,822,1310] if key=='live' else [109,424,835,1256]
        sample=[145,1240,590,1315] if key=='live' else [220,1400,400,1420]
        patch(body,target,sample,tile=True);repairs.append({'target':target,'sample':sample,'verticalMirrorTile':True})
        if key=='live':
            target=[373,393,648,440];sample=[654,393,686,440];patch(body,target,sample);repairs.append({'target':target,'sample':sample})
        else:
            # Include the original bottom compass point below the frame.
            pass
    # Rounded main silhouette plus hand-traced raised wood/metal ornament, supersampled.
    mask=Image.new('L',(941*3,1672*3));d=ImageDraw.Draw(mask);d.rounded_rectangle(tuple(v*3 for v in bounds),radius=42*3,fill=255);d.polygon([(x*3,y*3) for x,y in top],fill=255)
    if key=='result':d.polygon([(402*3,1440*3),(470*3,1493*3),(541*3,1440*3)],fill=255)
    body.putalpha(mask.resize(src.size,Image.Resampling.LANCZOS));rect=[bounds[0],min(y for x,y in top),bounds[2]+1,1495 if key=='result' else bounds[3]+1]
    # Include detached back control only as its own node, never in the panel layer.
    save(key+'-body',body.crop(rect),rect,source,'static frame, heading, illustration and helper text; no live data',{'roundedBody':bounds,'radius':42,'topPolygon':top},repairs)
    manifest['pages'][key]={'body':key+'-body','controls':{n:key+'-'+n for n in controls},'bounds':rect}
# Record row/tab art; strip only glyph interiors, retaining borders and dividers.
src=Image.open(DOC/'04-guess-records.png').convert('RGBA')
for name,rect,targets,sample in [
 ('record-row',[144,642,781,713],[[191,656,263,704],[390,656,536,704],[645,655,732,704]],[350,653,383,701]),
 ('record-latest-row',[144,1155,781,1231],[[191,1169,263,1223],[390,1169,536,1223],[645,1169,732,1223]],[350,1168,383,1220]),
 ('tab-on',[130,476,481,559],[[192,493,423,545]],[157,493,190,545]),
 ('tab-off',[482,483,812,559],[[539,497,751,546]],[499,497,532,546])]:
    repaired=src.copy()
    for target in targets:patch(repaired,target,sample)
    save(name,rounded(repaired,rect,12),rect,'04-guess-records','dynamic records background',{'rounded':12},[{'target':t,'sample':sample} for t in targets])
save('record-header',src.crop((144,575,802,639)),[144,575,802,639],'04-guess-records','fixed column headings',{'rectangle':True})
track=src.copy();patch(track,[789,850,804,993],[789,1010,804,1153])
save('record-track',rounded(track,[789,645,804,1232],7),[789,645,804,1232],'04-guess-records','scroll track',{'rounded':7},[{'target':[789,850,804,993],'sample':[789,1010,804,1153]}])
save('record-thumb',rounded(src,[789,857,804,986],7),[789,857,804,986],'04-guess-records','dynamic scroll thumb',{'rounded':7})
# Write manifest before integration; both alpha backgrounds are inspectable.
(DOC/'slices.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
for bg,name in [('#193531','dark'),('#fff4df','light')]:
    sheet=Image.new('RGB',(1500,((len(images)+4)//5)*330),bg);d=ImageDraw.Draw(sheet)
    for i,(key,im) in enumerate(images.items()):
        tile=im.copy();tile.thumbnail((286,297));x=(i%5)*300+7;y=(i//5)*330+25;sheet.paste(tile,(x,y),tile);d.text((x,y-20),key,fill='white' if name=='dark' else 'black')
    sheet.save(DOC/(name+'-sheet.jpg'))
# Shared layout is generated from the manifest to prevent drift between crops and hit targets.
data={name:a['rect'] for name,a in manifest['assets'].items()}
(ROOT/'assets/scripts/shared/modal-art.ts').write_text('// Generated by scripts/slice-modals.py. Source-space LTRB rectangles.\nexport const MODAL_RECTS: Record<string, readonly number[]> = '+json.dumps(data,indent=2)+';\n')
print(f'{len(images)} modal assets extracted')
