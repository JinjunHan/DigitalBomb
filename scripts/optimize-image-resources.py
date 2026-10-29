"""Conservative resource sizing; default audits only. --apply writes verified smaller PNGs.
Run after artwork generation. Keeps source design images, names, UUIDs and atlas geometry.
"""
from pathlib import Path
from PIL import Image
import argparse, hashlib, io, json

ROOT=Path(__file__).resolve().parents[1]
TARGETS={
 'art/opponent.png': ((320,480),'Fallback actor renders at 153x230 design units; retain >2x pixels.'),
 'art/profile/portrait-frame.png': ((352,352),'Largest frame is 234x234 design units; retain 1.5x pixels.'),
 'art/profile/avatar-selected.png': ((96,96),'Selection badge renders at 58x58 design units; retain >1.6x pixels.'),
}
p=argparse.ArgumentParser();p.add_argument('--apply',action='store_true');p.add_argument('--report',default='docs/verification/image-sizing/inventory.json');args=p.parse_args()
rows=[]
for path in sorted((ROOT/'assets/resources').rglob('*.png')):
 relative=path.relative_to(ROOT/'assets/resources').as_posix();raw=path.read_bytes();im=Image.open(io.BytesIO(raw));im.load();before=im.size
 target,reason=TARGETS.get(relative,(before,'Keep existing pixel dimensions; conservative lossless PNG re-encoding only.'))
 # Never upscale an existing smaller asset. Preserve aspect and alpha through Pillow's RGBA resampler.
 output=im.copy()
 if before[0]>target[0] or before[1]>target[1]:
  output=im.convert('RGBA');output.thumbnail(target,Image.Resampling.LANCZOS)
 resized=output.size!=before
 buf=io.BytesIO();output.save(buf,format='PNG',optimize=True,compress_level=9);candidate=buf.getvalue()
 # No palette quantization or RGB/alpha changes for images that already have suitable dimensions.
 if not resized:
  decoded=Image.open(io.BytesIO(candidate)).convert('RGBA')
  assert decoded.tobytes()==im.convert('RGBA').tobytes(),relative+' lossless check failed'
 accepted=len(candidate)<len(raw)*.99 and len(raw)-len(candidate)>=1024
 if resized and not accepted:raise RuntimeError(relative+' resize did not reduce file size')
 meta=path.with_name(path.name+'.meta');meta_hash=hashlib.sha256(meta.read_bytes()).hexdigest() if meta.exists() else None
 if args.apply and accepted:path.write_bytes(candidate)
 if meta.exists():assert hashlib.sha256(meta.read_bytes()).hexdigest()==meta_hash
 rows.append(dict(path='assets/resources/'+relative,beforeSize=list(before),afterSize=list(output.size if accepted else before),beforeBytes=len(raw),afterBytes=len(candidate) if accepted else len(raw),action=('resize' if resized else 'lossless') if accepted else 'keep',reason=reason,metaSHA256=meta_hash))
report={'applied':args.apply,'policy':'No upscaling. Explicit dimension budgets only; all other images retain dimensions and exact decoded RGBA pixels. Keep originals when re-encoding saves <1% or <1KB. Design source images and atlas geometry untouched.','beforeBytes':sum(r['beforeBytes'] for r in rows),'afterBytes':sum(r['afterBytes'] for r in rows),'images':rows}
out=ROOT/args.report;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
for row in rows:
 if row['action']!='keep':print(row['action'],row['path'],row['beforeSize'],'->',row['afterSize'],round((row['beforeBytes']-row['afterBytes'])/1024,1),'KB saved')
print('Summary:',len(rows),'images;',sum(r['action']=='resize' for r in rows),'resized;',sum(r['action']=='lossless' for r in rows),'lossless;',round((report['beforeBytes']-report['afterBytes'])/1024,1),'KB saved')
