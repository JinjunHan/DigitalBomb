// Disposable local accounts. Capture the new layered pages through real hit targets.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const output=process.env.ART_SMOKE_OUTPUT??'/tmp/digitalbomb-learning-v2/art';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:470,height:836},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8080');
 await page.waitForFunction(()=>{if(!window.cc?.director.getScene())return false;const walk=n=>{for(const c of n.components)if(c.learning)window.app=c;n.children.forEach(walk);};walk(cc.director.getScene());return window.app?.learning.ready;});
 async function click(value){
  const point=await page.evaluate(value=>{let target;const walk=n=>{if(!n.activeInHierarchy)return;if(n.name==='LearningControl-'+value)target=n;n.children.forEach(walk);};walk(cc.director.getScene());if(!target)throw Error('Missing '+value);const p=target.worldPosition,s=cc.view.getVisibleSize(),r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x+p.x/s.width*r.width,y:r.y+r.height-p.y/s.height*r.height};},value);
  await page.mouse.click(point.x,point.y);await page.waitForTimeout(180);
 }
 const shot=name=>page.screenshot({path:join(output,name+'.png')});
 await shot('03-learning-hub');
 await click('互动教学 · 学会第一步推理');await page.keyboard.type('1234');await click('提交');await click('digit-0');await click('9');await click('提交');
 assert.equal(await page.evaluate(()=>app.learning.tutorial.step),2);await shot('04-interactive-tutorial');
 await click('返回');await click('3 位 · 进阶');
 await page.evaluate(()=>app.learning.practice.answer='145');
 await page.keyboard.type('123');await click('提交');await page.keyboard.type('923');await click('提交');await page.keyboard.type('153');await click('digit-1');await shot('05-free-practice');
 assert.deepEqual(await page.evaluate(()=>app.learning.practice.history.map(h=>h.hits)),[1,0]);
 await click('返回');await click('4 位 · 标准');await page.evaluate(()=>app.learning.practice.answer='1255');
 for(const digits of ['0000','1234','9234']){await page.keyboard.type(digits);await click('提交');}
 await click('推理提示 · 3 条记录');assert.equal(await page.evaluate(()=>app.learning.cache.count),192);await shot('06-position-deduction');
 assert.deepEqual(await page.evaluate(()=>app.learning.cache.positions[0].possible),['1']);
 await click('记录与对比');await shot('07-history-comparison');
 await click('record-0');await click('设为对照');await click('record-2');await click('复制后修改');
 assert.equal(await page.evaluate(()=>app.learning.draft),'9234');
 // UI boundary fixture: enough valid records to require ten pages, no backend secrets.
 await page.evaluate(()=>{const h=app.learning.practice.history;app.learning.practice.history=Array.from({length:30},(_,i)=>({...h[i%3]}));app.learning.go('clues');});
 await click('记录与对比');assert.equal(await page.evaluate(()=>app.learning.recordPage),9);
 await click('上一页');await page.evaluate(()=>app.render());assert.equal(await page.evaluate(()=>app.learning.recordPage),8);
 await shot('history-30-records');
 await click('返回');await click('返回');await click('先去大厅');
 await page.evaluate(()=>{app.selectMode('public');});await shot('01-online-mode');
 await click('返回');await page.evaluate(()=>app.selectMode('friend'));await click('3 位 · 标准局 · 1000 种组合');await shot('02-friend-mode');
 await page.setViewportSize({width:375,height:667});await page.waitForTimeout(300);await shot('short-screen-mode');
 await click('返回');await page.evaluate(()=>{app.learning.open('menu');app.render();});await click('2 位 · 入门');await click('推理提示 · 0 条记录');await shot('empty-two-digit-notes');
 assert.equal(await page.evaluate(()=>app.learning.cache.count),100);
 await click('记录与对比');await shot('empty-history');
 assert.deepEqual(errors,[]);console.log('PASS seven reconstructed pages, live tutorial input, 192 consistent candidates, history selection/copy, 30-record pagination retention, empty states, short screen; '+output);
}finally{await browser.close();}
