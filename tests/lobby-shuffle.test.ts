import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LobbyShuffle} from '../assets/scripts/shared/lobby-shuffle';
test('starts immediately, stops all reels then holds for five seconds without redraw restart',()=>{
 let n=0;const s=new LobbyShuffle(()=>((n++%10)+.1)/10);s.show(true);
 assert.equal(s.elapsed,0);s.advance(.1,true);assert.ok(s.pose(0).offset>0);
 s.show(true);assert.equal(s.elapsed,.1);
 for(let i=0;i<13;i++)s.advance(.1,true);
 const digits=[0,1,2,3].map(i=>s.pose(i).digit);assert.ok([0,1,2,3].every(i=>!s.pose(i).active));
 for(let i=0;i<48;i++)s.advance(.1,true);
 assert.deepEqual([0,1,2,3].map(i=>s.pose(i).digit),digits);assert.ok(s.elapsed>=6.1);
 s.advance(.1,true);assert.equal(s.elapsed,0);assert.equal(s.pose(0).active,true);
});
test('hidden view pauses; reentry starts immediately; disabled motion settles',()=>{
 const s=new LobbyShuffle(()=>.7);s.show(true);s.advance(.1,true);s.show(false);s.advance(.1,true);assert.equal(s.elapsed,.1);
 s.show(true);assert.equal(s.elapsed,0);s.advance(.1,false);assert.equal(s.pose(3).active,false);assert.equal(s.pose(3).digit,7);
 for(let i=0;i<100;i++)s.advance(.1,false);assert.equal(s.elapsed,s.rollDuration);
});
