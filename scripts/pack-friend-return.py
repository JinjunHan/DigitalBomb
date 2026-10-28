"""Encode real browser screenshots with their captured frame intervals."""
from pathlib import Path
from PIL import Image, ImageDraw
import json
root=Path(__file__).resolve().parents[1]
out=root/'docs/verification'
report_path=out/'friend-return-checks.json'
report=json.loads(report_path.read_text());frames=report['frames']
images=[Image.open(f['file']).convert('RGB') for f in frames]
durations=[max(20,round(frames[i+1]['at']-f['at'])) if i+1<len(frames) else 200 for i,f in enumerate(frames)]
images[0].save(out/'friend-return.gif',save_all=True,append_images=images[1:],duration=durations,loop=0)
indices=[0,1,2,3,4,6,9,11]
strip=Image.new('RGB',(195*8,450),'#142b28');d=ImageDraw.Draw(strip)
for col,i in enumerate(indices):
    strip.paste(images[i].resize((195,422),Image.Resampling.LANCZOS),(col*195,28))
    d.text((col*195+6,7),f'+{round(frames[i]["at"]-frames[0]["at"])} ms',fill='white')
strip.save(out/'friend-return-frames.jpg',quality=90)
for frame in frames:frame.pop('file',None)
report['preview']='friend-return.gif; friend-return-frames.jpg'
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
