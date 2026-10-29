import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LobbyShuffle} from '../assets/scripts/shared/lobby-shuffle';
test('starts immediately, stops all reels then holds for five seconds without redraw restart',()=>{
 let n=0;const s=new LobbyShuffle(()=>((n++%10)+.1)/10);s.show(true);
 assert.equal(s.elapsed,0);s.advance(.1,true);assert.ok(s.pose(0).offset>0);
 s.show(true);assert.equal(s.elapsed,.1);
 for(let i=0;i<18;i++)s.advance(.1,true);
 const digits=[0,1,2,3].map(i=>s.pose(i).digit);assert.ok([0,1,2,3].every(i=>!s.pose(i).active));
 for(let i=0;i<48;i++)s.advance(.1,true);
 assert.deepEqual([0,1,2,3].map(i=>s.pose(i).digit),digits);assert.ok(s.elapsed>=6.6);
 s.advance(.1,true);s.advance(.1,true);assert.equal(s.elapsed,0);assert.equal(s.pose(0).active,true);
});
test('hidden view pauses; reentry starts immediately; disabled motion settles',()=>{
 const s=new LobbyShuffle(()=>.7);s.show(true);s.advance(.1,true);s.show(false);s.advance(.1,true);assert.equal(s.elapsed,.1);
 s.show(true);assert.equal(s.elapsed,0);s.advance(.1,false);assert.equal(s.pose(3).active,false);assert.equal(s.pose(3).digit,7);
 for(let i=0;i<100;i++)s.advance(.1,false);assert.equal(s.elapsed,s.rollDuration);
});

test('reels stop left to right, emit one click each and bounce only at landing',()=>{
 const s=new LobbyShuffle(()=>.5);s.show(true);const stops:number[]=[];const times:number[]=[];
 for(let i=0;i<110;i++){const landed=s.advance(.02,true);stops.push(...landed);for(const _ of landed)times.push(s.elapsed);s.show(true);}
 assert.deepEqual(stops,[0,1,2,3]);
 for(let i=1;i<4;i++)assert.ok(Math.abs(times[i]-times[i-1]-.24)<.025);
 s.elapsed=.96;assert.ok(Math.abs(s.pose(0).bounce)>0);assert.equal(s.pose(1).bounce,0);
 s.elapsed=s.rollDuration;for(let i=0;i<4;i++){assert.equal(s.pose(i).active,false);assert.ok(Math.abs(s.pose(i).bounce)<1e-8);}
 assert.deepEqual(s.advance(.02,false),[]);s.show(false);assert.deepEqual(s.advance(.02,true),[]);
});
