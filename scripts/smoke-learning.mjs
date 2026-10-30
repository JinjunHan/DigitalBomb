// Runs only against local disposable accounts and the built Cocos Web client.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const output = process.env.LEARNING_SMOKE_OUTPUT ?? mkdtempSync(join(tmpdir(), 'digitalbomb-learning-'));
mkdirSync(output, { recursive: true });
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const browser=await chromium.launch({headless:true,channel:'chrome'});
let peer;
try {
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8080');await page.waitForTimeout(5000);
await page.evaluate(()=>{const walk=n=>{for(const c of n.components)if(c.learning)window.app=c;for(const child of n.children)walk(child);};walk(cc.director.getScene());});
async function click(text, first=false){
 const p=await page.evaluate(({t,first})=>{let found;const walk=n=>{const l=n.getComponent(cc.Label);if(l?.string===t&&(!first||!found))found=n;for(const c of n.children)walk(c);};walk(cc.director.getScene());if(!found)throw Error('Label missing '+t);const v=found.worldPosition,sz=cc.view.getVisibleSize(),r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x+v.x/sz.width*r.width,y:r.y+r.height-v.y/sz.height*r.height};},{t:text,first});
 await page.mouse.click(p.x,p.y);await page.waitForTimeout(150);
}
await click('互动教学 · 学会第一步推理');
for(const k of '1234')await click(k);await click('提交');
assert.equal(await page.evaluate(()=>app.learning.tutorial.step),1);
await click('1',true);await click('9');await click('提交');
assert.equal(await page.evaluate(()=>app.learning.tutorial.step),2);
assert.deepEqual(await page.evaluate(()=>app.learning.tutorial.history.map(h=>h.hits)),[2,1]);
await click('9');assert.equal(await page.evaluate(()=>app.learning.tutorial.step),2);
await click('1');await click('密码中没有 1、2、3、4');assert.equal(await page.evaluate(()=>app.learning.tutorial.step),3);
await click('这些数字在各自对应位置不正确');assert.equal(await page.evaluate(()=>app.learning.tutorial.complete),true);
await page.screenshot({path:join(output, 'tutorial-complete.png')});
await click('从 2 位练习开始');
const firstGuess = await page.evaluate(()=>app.learning.practice.answer === '12' ? '13' : '12');
await page.keyboard.type(firstGuess);await page.keyboard.press('Enter');
assert.equal(await page.evaluate(()=>app.learning.practice.history.length),1);
await click('推理提示 · 1 条记录');
await page.screenshot({path:join(output, '2-digit-clues.png')});
assert.ok(await page.evaluate(()=>app.learning.cache.positions.every(p=>p.possible.every(d=>/^\d$/.test(d)))));
assert.ok(await page.evaluate(()=>app.learning.cache.count<100));
await click('记录与对比');await click('复制后修改');
assert.equal(await page.evaluate(()=>app.learning.draft),firstGuess);
// Verify all three tiers and the same leading-zero input path.
for(const size of [3,4]){await click('返回');await click(size===3?'3 位 · 进阶':'4 位 · 标准');const guess=await page.evaluate(size=>app.learning.practice.answer==='0'.repeat(size)?'0'.repeat(size-1)+'1':'0'.repeat(size),size);await page.keyboard.type(guess);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>app.learning.practice.history[0].digits),guess);}
await page.screenshot({path:join(output, 'practice-four.png')});
// Check complete success flow using the test's local practice answer, never multiplayer secrets.
const answer=await page.evaluate(()=>app.learning.practice.answer);
await page.keyboard.type(answer,{delay:60});await page.keyboard.press('Enter');await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>app.learning.practice.solved),true);
await click('查看推理记录');await page.setViewportSize({width:375,height:667});await page.waitForTimeout(300);await page.screenshot({path:join(output, 'short-screen.png')});
await click('返回');await click('返回');await click('查看正式对战规则');
assert.ok(await page.evaluate(()=>{let yes=false;const walk=n=>{const l=n.getComponent(cc.Label);if(l?.string.includes('每回合 60 秒，最多 30 大轮'))yes=true;n.children.forEach(walk)};walk(cc.director.getScene());return yes}));
await page.setViewportSize({width:390,height:844});
await page.evaluate(async()=>{app.learning.close();app.render();await app.net.command('create');});
const auth=await (await fetch('http://127.0.0.1:8787/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
peer=new WebSocket('ws://127.0.0.1:8787/ws');let peerState;
peer.on('message',raw=>{const m=JSON.parse(String(raw));if(m.type==='state')peerState=m.state;});
await new Promise(resolve=>peer.on('open',resolve));peer.send(JSON.stringify({action:'auth',token:auth.token}));
const until=async(fn)=>{const until=Date.now()+8000;while(!await fn()){if(Date.now()>until)throw Error('state timeout');await new Promise(r=>setTimeout(r,40));}};
await until(()=>peerState);
const send=(action,payload={})=>peer.send(JSON.stringify({id:crypto.randomUUID(),action,payload:{roomId:peerState.room?.id,...payload}}));
const code=await page.evaluate(()=>app.net.state.room.code);send('join',{code});
await until(()=>peerState.room?.phase==='preparing');
await page.evaluate(()=>app.net.command('lock',{roomId:app.net.state.room.id,digits:'1122'}));send('lock',{digits:'0123'});
await until(()=>peerState.room?.phase==='playing');
await until(()=>page.evaluate(()=>app.net.state.room?.phase==='playing'));
assert.equal(peerState.room.roundLimit,30);assert.equal(peerState.room.turnMs,60000);
await new Promise(r=>setTimeout(r,Math.max(0,peerState.room.startAt-Date.now()+100)));
if(peerState.room.current===auth.me.id){send('guess',{digits:'9999',turn:peerState.room.turn});await until(()=>page.evaluate(()=>app.net.state.room.current===app.net.state.me.id));}
await page.evaluate(()=>app.net.command('guess',{roomId:app.net.state.room.id,digits:'0000',turn:app.net.state.room.turn}));
await until(()=>peerState.room.current===auth.me.id);
send('guess',{digits:'9999',turn:peerState.room.turn});await until(()=>page.evaluate(()=>app.net.state.room.current===app.net.state.me.id));
await page.waitForTimeout(1600);await page.screenshot({path:join(output, 'battle.png')});
await click('推理提示 / 排除');
assert.equal(await page.evaluate(()=>app.learning.cache.count),2916);
assert.equal(await page.evaluate(()=>app.net.state.room.revealed),undefined);
const timer=await page.evaluate(()=>app.learning.timer.string);await page.waitForTimeout(1200);
assert.notEqual(await page.evaluate(()=>app.learning.timer.string),timer);
await page.screenshot({path:join(output, 'battle-clues.png')});
await click('记录与对比');await click('复制后修改');
assert.equal(await page.evaluate(()=>app.draft),'0000');assert.equal(await page.evaluate(()=>app.learning.visible),false);
await click('推理提示 / 排除');
send('resign');await until(()=>page.evaluate(()=>app.net.state.room.phase==='finished'));
assert.equal(await page.evaluate(()=>app.learning.visible),false);
peer.close();
assert.deepEqual(errors,[]);console.log('PASS actual UI clicks: tutorial incorrect/correct choices, 2/3/4 practice, copy, leading zeros, success, rules, short viewport, live 30-round/60-second game, countdown, copy, terminal cleanup; no page errors');
console.log('Screenshots: ' + output);
} finally { peer?.terminate(); await browser.close(); }
