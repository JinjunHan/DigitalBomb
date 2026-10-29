const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8080');
 await page.waitForFunction(()=>window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c=>c.battleArtReady&&c.net.state));
 await page.evaluate(()=>{
  window.app=cc.director.getScene().getChildByName('Canvas').components.find(c=>c.battleArtReady);const base=JSON.parse(JSON.stringify(app.net.state));
  app.net.onState=()=>{};app.net.onStatus=()=>{};app.net.stop();app.net.online=true;localStorage.setItem('db-motion','1');
  app.net.state={...base,room:{id:'round-fixture',mode:'public',phase:'playing',players:[{...base.me,ready:true,online:true},{id:'peer',name:'数字玩家',avatar:1,ready:true,online:true}],version:1,round:9,turn:16,current:base.me.id,first:'peer',deadline:app.net.now()+300000,startAt:app.net.now()-1000,history:[],ownSecret:'6289',rematch:[]}};
  app.overlay='';app.draft='';app.busy=false;app.render();
 });
 await page.waitForTimeout(500);
 await page.evaluate(()=>{app.net.online=true;app.render();});
 await page.waitForTimeout(200);
 fs.mkdirSync('temp/round-motion',{recursive:true});
 await page.screenshot({path:'docs/verification/round-9.png'});
 await page.evaluate(()=>{app.net.state.room.round=10;app.render();});
 for(let i=0;i<7;i++){await page.screenshot({path:`temp/round-motion/${i}.png`});if(i===1)await page.evaluate(()=>{const elapsed=app.roundRoll.elapsed;app.render();if(app.roundRoll.elapsed!==elapsed)throw Error('redraw restarted roll');});await page.waitForTimeout(40);}
 await page.waitForTimeout(500);
 assert.deepEqual(await page.evaluate(()=>({x:app.roundNew.position.x,y:app.roundNew.position.y,old:app.roundOld.active})),{x:0,y:0,old:false});
 await page.screenshot({path:'docs/verification/round-10.png'});
 for(const round of [1,20]){await page.evaluate(round=>{app.net.state.room.round=round;app.render();},round);await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>app.roundNew.position.x),0);}
 const point=await page.evaluate(()=>{const p=app.roundNew.parent.parent.worldPosition;return{x:p.x/cc.view.getVisibleSize().width*innerWidth,y:innerHeight-p.y/cc.view.getVisibleSize().height*innerHeight};});
 await page.mouse.click(point.x,point.y);assert.equal(await page.evaluate(()=>app.overlay),'gameMenu');
 await page.setViewportSize({width:390,height:600});await page.evaluate(()=>{app.overlay='';app.render();});await page.waitForTimeout(500);await page.screenshot({path:'docs/verification/round-short.png'});
 assert.deepEqual(errors,[]);console.log('PASS: 1/9/10/20 centered, roll survives redraw, settles at center, menu click, short viewport; continuous frames captured.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
