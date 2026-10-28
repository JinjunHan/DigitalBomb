import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackEvent, resultCaption, cancellationArt } from '../assets/scripts/shared/feedback-state';
import type { RoomView } from '../assets/scripts/shared/protocol';
const previous={roomId:'r',phase:'playing',guesses:0};
const room={id:'r',phase:'playing',history:[{playerId:'peer',turn:0,digits:'1234',hits:3}]} as RoomView;
test('opponent pressure reflects actual aggregate, without replay or position hints',()=>{
 assert.equal(feedbackEvent(room,'me',previous)?.art,'opponent-3');
 assert.equal(feedbackEvent(room,'me',{...previous,guesses:1}),undefined);
 assert.equal(feedbackEvent(room,'me',previous,true),undefined);
 assert.equal(feedbackEvent(room,'me',{...previous,roomId:'old'}),undefined);
});
test('reply opportunity differs from loss and draw',()=>{
 const reply={...room,phase:'reply',history:[{...room.history[0],hits:4}]} as RoomView;
 assert.equal(feedbackEvent(reply,'me',previous)?.art,'opponent-4');
 const finished={...reply,phase:'finished',result:{winner:null,reason:'same_round'}} as RoomView;
 assert.equal(feedbackEvent(finished,'me',previous)?.art,'end-2');
 assert.equal(feedbackEvent({...finished,result:{winner:'peer',reason:'cracked'}},'me',previous)?.art,'end-1');
});
test('first timeout is nonfinal; cancelled has no defeat feedback',()=>{
 const timed={...room,history:[{...room.history[0],digits:null,hits:null}]};
 assert.equal(feedbackEvent(timed,'me',previous)?.art,'timeout-1');
 assert.equal(feedbackEvent({...timed,phase:'cancelled'},'me',previous),undefined);
 assert.equal(cancellationArt('prepare_timeout'),'cancel-0');
});
test('timeout/disconnection attribution follows winner, not fixed opponent wording',()=>{
 for(const reason of ['timeout','disconnect']) {
 const ended={...room,result:{winner:'peer',reason}};
 assert.ok(resultCaption(ended,'me').startsWith('你'));
 assert.ok(resultCaption(ended,'peer').startsWith('对手'));
 }
});
