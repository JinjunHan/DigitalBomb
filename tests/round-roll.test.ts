import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoundRoll } from '../assets/scripts/shared/round-roll';
test('only consecutive changes roll; redraw does not restart; 9→10 stays aligned',()=>{
 const r=new RoundRoll();r.sync('a',9,true);assert.equal(r.pose.active,false);
 r.sync('a',10,true);assert.equal(r.previous,9);assert.equal(r.pose.newY,-42);
 r.advance(.04,true);const y=r.pose.newY;r.sync('a',10,true);assert.equal(r.pose.newY,y);
 for(let i=0;i<12;i++)r.advance(.04,true);assert.equal(r.pose.newY,0);assert.equal(r.pose.active,false);
});
test('reconnect, new room, skipped rounds and disabled motion snap to current',()=>{
 const r=new RoundRoll();r.sync('a',1,true);r.sync('a',2,true);r.sync('a',2,true,true);assert.equal(r.pose.active,false);
 r.sync('b',1,true);assert.equal(r.pose.active,false);r.sync('b',5,true);assert.equal(r.pose.active,false);
 r.sync('b',6,true);r.advance(.01,false);assert.equal(r.pose.newY,0);
 r.sync('b',7,false);assert.equal(r.pose.active,false);
});
