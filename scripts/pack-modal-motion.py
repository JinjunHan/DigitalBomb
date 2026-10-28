"""Package actual browser captures with their measured timestamps; never synthesize animation frames."""
from pathlib import Path
from PIL import Image, ImageDraw
import json
root=Path(__file__).resolve().parents[1]
report_path=root/'docs/verification/modal-motion-checks.json'
report=json.loads(report_path.read_text())
out=root/'docs/verification/modal-motion';out.mkdir(exist_ok=True)
recordings=report['recordings']
for kind in [key[:-3] for key in recordings if key.endswith('-in')]:
    frames=recordings[kind+'-in']+recordings[kind+'-out']
    images=[Image.open(frame['file']).convert('RGB') for frame in frames]
    durations=[max(20,round(frames[i+1]['at']-frame['at'])) if i<len(frames)-1 else 100 for i,frame in enumerate(frames)]
    images[0].save(out/(kind+'.gif'),save_all=True,append_images=images[1:],duration=durations,loop=0,optimize=False)
    indices=[0,1,3,8,9,10,12,17]
    strip=Image.new('RGB',(195*8,450),'#142b28');d=ImageDraw.Draw(strip)
    for col,i in enumerate(indices):
        im=images[i].resize((195,422),Image.Resampling.LANCZOS);strip.paste(im,(col*195,28))
        stage='in' if i<9 else 'out';start=frames[0 if i<9 else 9]['at'];d.text((col*195+5,6),f'{kind} {stage} +{round(frames[i]["at"]-start)}ms',fill='white')
    strip.save(out/(kind+'.jpg'),quality=90)
# Keep portable timing evidence; raw screenshots live in the capture directory until cleanup.
report.pop('framesRoot',None)
for key,frames in recordings.items():
    for f in frames:f.pop('file',None)
report['previews']='modal-motion/<kind>.gif and <kind>.jpg; frames captured from the running Web build'
report_path.write_text(json.dumps(report,indent=2)+'\n')
