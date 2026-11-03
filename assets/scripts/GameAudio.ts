import { AudioClip, AudioSource, Node, resources } from 'cc';
import { read, write } from './Platform';
export class GameAudio {
  private music: AudioSource;
  private voices: AudioSource[];
  private scene: 'lobby' | 'battle' = 'lobby';
  private ducked = false;
  private clips = new Map<string, AudioClip>();
  private unlocked = false; private hidden = false; private disposed = false; private voice = 0;
  constructor(parent: Node) {
    const node = new Node('GameAudio'); parent.addChild(node);
    this.music = node.addComponent(AudioSource); this.music.loop = true; this.music.volume = 0; this.music.playOnAwake = false;
    this.voices = Array.from({length: 5}, (_, i) => { const n = new Node('Voice'+i); node.addChild(n); const source = n.addComponent(AudioSource); source.playOnAwake = false; source.volume = .65; return source; });
    for (const name of ['music-lobby','music-battle','tap','submit','ready','turn','warning','error','hit0','hit1','hit2','hit3','hit4','win','lose','draw']) {
      resources.load('audio/'+name, AudioClip, (error, clip) => {
        if (error || this.disposed) return;
        this.clips.set(name, clip);
        if (name === 'music-' + this.scene) this.syncMusic();
      });
    }
  }
  setScene(scene: 'lobby' | 'battle') {
    if (this.disposed || this.scene === scene) return;
    this.scene = scene;
    this.syncMusic();
  }
  setDucked(ducked: boolean) { this.ducked = ducked; }
  update(dt: number) {
    if (this.disposed || this.hidden) return;
    const clip = this.clips.get('music-' + this.scene);
    const switching = !!clip && this.music.clip !== clip;
    const target = switching ? 0 : this.ducked ? .09 : .28;
    const step = Math.max(0, Math.min(dt, .1)) * .8;
    const delta = target - this.music.volume;
    this.music.volume += Math.sign(delta) * Math.min(Math.abs(delta), step);
    if (switching && this.music.volume === 0) {
      this.music.stop(); this.music.clip = clip!; this.syncMusic();
    }
  }
  unlock() { this.unlocked = true; this.syncMusic(); }
  private syncMusic() {
    if (this.disposed) return;
    if (!this.music.clip) this.music.clip = this.clips.get('music-' + this.scene) ?? null;
    if (this.unlocked && !this.hidden && read('music','1') === '1' && this.music.clip) { if (!this.music.playing) this.music.play(); }
    else this.music.pause();
  }
  play(name: string) {
    if (this.disposed || this.hidden || !this.unlocked || read('sound','1') !== '1') return;
    const clip = this.clips.get(name); if (!clip) return;
    const source = this.voices[this.voice++ % this.voices.length]; source.stop(); source.clip = clip; source.play();
  }
  toggle(key: 'music' | 'sound') {
    write(key, read(key,'1') === '1' ? '0' : '1');
    if (key === 'sound' && read(key) === '0') this.voices.forEach(v => v.stop());
    this.syncMusic();
  }
  background(hidden: boolean) { this.hidden = hidden; if (hidden) this.voices.forEach(v => v.stop()); this.syncMusic(); }
  dispose() { this.disposed = true; this.music.stop(); this.voices.forEach(v => v.stop()); }
}
