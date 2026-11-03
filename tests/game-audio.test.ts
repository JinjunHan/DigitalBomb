import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the real controller with controllable asynchronous Cocos resource loads.
function setup() {
  const loads = new Map<string, (error: unknown, clip: unknown) => void>();
  const settings = new Map<string, string>();
  const sources: Source[] = [];
  class Source {
    clip: any = null; volume = 0; playing = false; plays = 0; loop = false;
    play() { this.playing = true; this.plays++; }
    stop() { this.playing = false; }
    pause() { this.playing = false; }
  }
  class Node {
    addChild() {}
    addComponent() { const source = new Source(); sources.push(source); return source; }
  }
  const output = ts.transpileModule(readFileSync('assets/scripts/GameAudio.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports: any = {};
  runInNewContext(output, { exports, require: (name: string) => name === 'cc'
    ? { Node, AudioSource: Source, AudioClip: class {}, resources: { load: (path: string, _: unknown, cb: any) => loads.set(path, cb) } }
    : { read: (key: string, fallback = '') => settings.get(key) ?? fallback, write: (key: string, value: string) => settings.set(key, value) } });
  const audio = new exports.GameAudio(new Node());
  return { audio, sources, load: (name: string) => loads.get('audio/' + name)!(null, { name }),
    advance: () => { for (let i = 0; i < 20; i++) audio.update(.05); } };
}

test('late lobby load cannot override battle; redraws do not restart music; scene changes fade', () => {
  const { audio, sources, load, advance } = setup(); const music = sources[0];
  audio.setScene('battle'); load('music-lobby'); assert.equal(music.clip, null);
  load('music-battle'); assert.equal(music.playing, false);
  audio.unlock(); advance(); assert.equal(music.clip!.name, 'music-battle');
  const plays = music.plays; audio.setScene('battle'); advance(); assert.equal(music.plays, plays);
  audio.setScene('lobby'); assert.equal(music.clip!.name, 'music-battle');
  advance(); assert.equal(music.clip!.name, 'music-lobby'); assert.equal(music.volume, .28);
  audio.setDucked(true); advance(); assert.equal(music.volume, .09);
  audio.setDucked(false); advance(); assert.equal(music.volume, .28);
});

test('mute, background and disposal prevent playback even during async scene changes', () => {
  const { audio, sources, load, advance } = setup(); const music = sources[0];
  load('music-lobby'); load('tap'); audio.unlock(); advance();
  audio.toggle('music'); audio.setScene('battle'); load('music-battle'); advance();
  assert.equal(music.playing, false); audio.play('tap'); assert.equal(sources[1].playing, true);
  audio.background(true); assert.ok(sources.every(s => !s.playing));
  audio.toggle('music'); advance(); assert.equal(music.playing, false);
  audio.background(false); assert.equal(music.playing, true);
  audio.dispose(); load('warning'); audio.unlock(); audio.background(false); advance();
  assert.ok(sources.every(s => !s.playing));
});
