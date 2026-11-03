"""Original synthesized effects; deterministic, no third-party samples."""
import math, random, wave, struct, subprocess
from pathlib import Path
RATE=22050
out=Path('assets/resources/audio')
def tone(buf,start,note,duration,gain=.15,soft=False):
 f=440*2**((note-69)/12)
 for i in range(int(duration*RATE)):
  t=i/RATE
  env=min(1,t/.012)*math.exp(-t/(.7 if soft else .16))*min(1,(duration-t)/.06)
  v=math.sin(2*math.pi*f*t)+.22*math.sin(4*math.pi*f*t)+.08*math.sin(6*math.pi*f*t)
  buf[(int(start*RATE)+i)%len(buf)]+=v*env*gain

def save(name,buf,mp3=True):
 peak=max(abs(x) for x in buf) or 1
 scale=min(1,.85/peak)
 path=out/(name+'.wav')
 with wave.open(str(path),'wb') as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(b''.join(struct.pack('<h',int(x*scale*32767)) for x in buf))
 if mp3:
  subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(path),'-codec:a','libmp3lame','-b:a','48k',str(out/(name+'.mp3'))],check=True);path.unlink()
fx={'tap':[(0,76,.1,.12)],'submit':[(0,48,.15,.2),(.1,60,.2,.15)],'ready':[(0,60,.2,.16),(.12,67,.3,.16)],'turn':[(0,67,.18,.15),(.14,72,.3,.15)],'warning':[(0,76,.13,.13),(.23,76,.13,.13)],'error':[(0,50,.22,.15),(.15,47,.3,.13)],'hit0':[(0,48,.3,.18)],'win':[(0,60,.4,.16),(.15,64,.4,.16),(.3,67,.4,.16),(.5,72,.8,.16)],'lose':[(0,64,.35,.14),(.25,60,.35,.14),(.5,57,.7,.14)],'draw':[(0,60,.4,.13),(.2,67,.6,.13)]}
for hits in range(1,5):fx['hit'+str(hits)]=[(.22+i*.13,[60,64,67,72][i],.4,.16) for i in range(hits)]
for name,notes in fx.items():
 b=[0.]*int((max(t+d for t,n,d,g in notes)+.08)*RATE)
 for t,n,d,g in notes:tone(b,t,n,d,g)
 save(name,b)
print('Generated',len(fx),'MP3 effects')
