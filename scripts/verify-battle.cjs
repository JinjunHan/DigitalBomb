/** Browser fixtures only. Run after build:web with preview and server listening. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:693}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8080');
 await page.waitForFunction(()=>window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c=>c.battleArtReady&&c.net.state));
 await page.evaluate(()=>{
  window.app=cc.director.getScene().getChildByName('Canvas').components.find(c=>c.battleArtReady);window.base=JSON.parse(JSON.stringify(app.net.state));
  app.net.onState=()=>{};app.net.onStatus=()=>{};app.net.stop();app.net.online=true;app.act=async(action,payload)=>{window.command={action,payload};};
  window.fixture=(phase,empty=false)=>{const me=base.me;app.net.online=true;app.net.state={...base,queuedAt:null,room:{id:'battle-fixture',mode:'public',phase,players:[{...me,ready:false,online:true},{id:'peer',name:'十二个字的超长对手昵称测试',avatar:1,ready:true,online:true}],version:1,round:4,turn:6,current:me.id,first:me.id,deadline:Date.now()+45000,startAt:Date.now()-1000,history:empty?[]:Array.from({length:12},(_,i)=>({playerId:me.id,turn:i*2,digits:i===10?null:'0012',hits:i===10?null:i%4})),ownSecret:phase==='preparing'?undefined:'1122',rematch:[]}};app.overlay='';app.draft=empty?'':'0123';app.selected=-1;app.busy=false;app.render();};
 });
 await page.waitForTimeout(200);
 const click=async name=>{const p=await page.evaluate(name=>{let found;const visit=n=>{if(n.name===name)found=n;n.children.forEach(visit);};visit(app.root);if(!found)throw Error(name);const r=found.components.find(c=>c.getBoundingBoxToWorld).getBoundingBoxToWorld();return{x:(r.x+r.width/2)*innerWidth/750,y:innerHeight-(r.y+r.height/2)*innerHeight/app.screenHeight};},name);await page.mouse.click(p.x,p.y);await page.waitForTimeout(100);};
 await page.evaluate(()=>fixture('preparing',true));await page.waitForTimeout(700);
 for(const key of ['0','1','2','3'])await click('Battle-prep-'+key);
 assert.equal(await page.evaluate(()=>app.draft),'0123');
 await click('Battle-prep-delete');assert.equal(await page.evaluate(()=>app.draft),'012');
 await click('Battle-prep-action');assert.match(await page.evaluate(()=>app.draft),/^\d{4}$/);
 await page.screenshot({path:'docs/verification/battle-preparation.png'});
 await click('Battle-lock');assert.equal(await page.evaluate(()=>app.confirmation.kind),'lock');
 await page.evaluate(()=>fixture('playing'));await page.waitForTimeout(700);await page.screenshot({path:'docs/verification/battle-gameplay.png'});
 await click('Battle-play-action');assert.equal(await page.evaluate(()=>command.action),'guess');
 await click('Battle-all-records');assert.equal(await page.evaluate(()=>app.overlay),'guessRecords');
 await page.evaluate(()=>fixture('playing',true));await page.screenshot({path:'docs/verification/battle-empty.png'});
 await page.setViewportSize({width:390,height:600});await page.evaluate(()=>fixture('preparing'));await page.waitForTimeout(200);await page.screenshot({path:'docs/verification/battle-short.png'});
 await page.evaluate(()=>{app.net.state={...base,room:null,queuedAt:Date.now()-12000};app.render();});await page.waitForTimeout(200);await page.screenshot({path:'docs/verification/battle-matching.png'});
 await click('Matching-cancel');assert.equal(await page.evaluate(()=>command.action),'cancelQueue');
 assert.deepEqual(errors,[]);console.log('PASS: digits, delete, random, lock confirmation, guess, records, empty history, short screen, matching cancel; no page errors.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
