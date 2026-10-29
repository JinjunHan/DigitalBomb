"""Remove source cards from guess panel using its intact original bottom rail."""
from pathlib import Path
from PIL import Image, ImageDraw
import json
R=Path(__file__).resolve().parents[1]
D=R/'docs/design/battle-panel-fix'
plan={'source':'docs/design/05-gameplay-v2.png','rect':[180,722,758,936],'existingBlankPanel':'assets/resources/art/battle/guess.png','repair':{'sample':[35,190,135,214],'target':[140,190,440,214]},'mask':'4x rounded outline following metal frame; outside transparent','role':'Fixed panel and heading; native guess digits remain separate','keyboard':'Gameplay keys scaled to 88% width and 84% height about source (470.5,1425), inside unchanged tray; preparation unchanged'}
(D/'manifest.json').write_text(json.dumps(plan,indent=2)+'\n')
p=R/plan['existingBlankPanel']; im=Image.open(p).convert('RGBA')
# Source rail is unobscured at the left. Only the flat lower rail is extended.
rail=im.crop(plan['repair']['sample']).resize((300,24),Image.Resampling.LANCZOS)
im.paste(rail,(140,190))
m=Image.new('L',(578*4,214*4)); d=ImageDraw.Draw(m)
d.rounded_rectangle((5*4,1*4,574*4,211*4),radius=26*4,fill=255)
im.putalpha(m.resize(im.size,Image.Resampling.LANCZOS));im.save(p,optimize=True)
for color,name in [('#173e3c','dark'),('#eee3ce','light')]:
 bg=Image.new('RGB',(618,254),color);bg.paste(im,(20,20),im);bg.save(D/(name+'.png'))
