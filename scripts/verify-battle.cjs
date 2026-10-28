/** Browser fixtures only. Run after build:web with preview and server listening. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:693}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8080');
 await page.waitForFunction(()=>window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c=>c.battleArtReady&&c.net.state));
 await page.evaluate(()=>{
  window.app=cc.director.getScene().getChildByName('Canvas').components.find(c=>c.battleArtReady);window.base=JSON.parse(JSON.stringify(app.net.state));base.me.avatar=0;base.me.name='半杯柠檬';
  app.net.onState=()=>{};app.net.onStatus=()=>{};app.net.stop();app.net.online=true;app.act=async(action,payload)=>{window.command={action,payload};};
  window.fixture=(phase,empty=false)=>{const me=base.me;app.net.online=true;app.net.state={...base,queuedAt:null,room:{id:'battle-fixture',mode:'public',phase,players:[{...me,ready:false,online:true},{id:'peer',name:'十二个字的超长对手昵称测试',avatar:1,ready:true,online:true}],version:1,round:4,turn:6,current:me.id,first:me.id,deadline:Date.now()+45000,startAt:Date.now()-1000,history:empty?[]:Array.from({length:12},(_,i)=>({playerId:me.id,turn:i*2,digits:i===10?null:'0012',hits:i===10?null:i%4})),ownSecret:phase==='preparing'?undefined:'1122',rematch:[]}};app.overlay='';app.draft=empty?'':'0123';app.selected=-1;app.busy=false;app.render();};
 });
 await page.waitForTimeout(200);
 const click=async name=>{const p=await page.evaluate(name=>{let found;const visit=n=>{if(n.name===name)found=n;n.children.forEach(visit);};visit(app.root);if(!found)throw Error(name);const r=found.components.find(c=>c.getBoundingBoxToWorld).getBoundingBoxToWorld();return{x:(r.x+r.width/2)*innerWidth/750,y:innerHeight-(r.y+r.height/2)*innerHeight/app.screenHeight};},name);await page.mouse.click(p.x,p.y);await page.waitForTimeout(100);};
 await page.evaluate(()=>fixture('preparing',true));await page.waitForTimeout(700);
 for(const key of ['0','1','2','3'])await click('Battle-prep-'+key);
 assert.equal(await page.evaluate(()=>app.draft),'0123');
 await click('Battle-prep-delete');assert.equal(await page.evaluate(()=>app.draft),'012');
 await page.evaluate(()=>{Math.random=()=>.0123;});await click('Battle-prep-action');assert.match(await page.evaluate(()=>app.draft),/^\d{4}$/);
 await click('Battle-card-paper');
 assert.equal(await page.evaluate(()=>app.selected),3);
 await click('Battle-prep-9');assert.equal(await page.evaluate(()=>app.draft),'0129');
 await page.evaluate(()=>{app.selected=1;app.render();});
 await page.screenshot({path:'docs/verification/battle-preparation.png'});
 await click('Battle-lock');assert.equal(await page.evaluate(()=>app.confirmation.kind),'lock');
 await page.evaluate(()=>fixture('playing'));await page.waitForTimeout(700);await page.screenshot({path:'docs/verification/battle-gameplay.png'});
 await click('Battle-status');assert.equal(await page.evaluate(()=>app.hideSecret),true);
 await click('Battle-status');assert.equal(await page.evaluate(()=>app.hideSecret),false);
 await click('Battle-play-action');assert.equal(await page.evaluate(()=>command.action),'guess');
 await click('Battle-all-records');assert.equal(await page.evaluate(()=>app.overlay),'guessRecords');
 await page.evaluate(()=>{fixture('playing');app.net.state.room.current='peer';app.render();});await page.waitForTimeout(700);
 await click('Battle-play-delete');assert.equal(await page.evaluate(()=>app.draft),'0123');
 await page.evaluate(()=>{fixture('preparing');app.net.state.room.ownSecret='0011';app.render();});
 await click('Battle-prep-9');assert.equal(await page.evaluate(()=>app.draft),'0123');
 for(let avatar=0;avatar<8;avatar++) {
  await page.evaluate(avatar=>{fixture('playing');app.net.state.me.avatar=avatar;app.render();},avatar);
  const count=await page.evaluate(()=>{const n=app.root.getChildByName('BattleRoom');return [...n.children,...(n.getChildByName('BattlePortraitClip')?.children||[])].filter(c=>['Battle-portrait','Battle-portrait-background','Battle-portrait-frame'].includes(c.name)).length;});
  assert.ok(count>=2,'avatar frame/background missing for '+avatar);
 }
 await page.screenshot({path:'docs/verification/battle-avatar-fallback.png'});
 await page.evaluate(()=>fixture('playing',true));await page.screenshot({path:'docs/verification/battle-empty.png'});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{fixture('preparing');app.draft='123';app.selected=3;app.net.state.room.deadline=app.net.now()+33000;app.render();});await page.waitForTimeout(700);
 assert.equal(await page.evaluate(()=>app.root.getChildByName('BattleRoom').children.some(n=>n.components.some(c=>c.string==='—'))),false);
 await page.screenshot({path:'docs/verification/battle-three-fixes.png'});
 for(const seconds of [45,9,0]) {
  await page.evaluate(seconds=>{app.net.state.room.deadline=app.net.now()+seconds*1000;app.updateTimer();},seconds);
  assert.equal(await page.evaluate(()=>app.timerLabel.string),String(seconds));
  if(seconds===9)await page.screenshot({path:'docs/verification/battle-timer-single-digit.png'});
 }
 await page.setViewportSize({width:390,height:600});await page.evaluate(()=>fixture('preparing'));await page.waitForTimeout(200);await page.screenshot({path:'docs/verification/battle-short.png'});
 await page.evaluate(()=>{localStorage.setItem('db-motion','1');fixture('playing');});await page.waitForTimeout(1100);
 await page.evaluate(()=>{app.net.state={...base,room:null,queuedAt:Date.now()-12000};app.render();});
 require('node:fs').mkdirSync('temp/battle-scene',{recursive:true});
 const poses=[];
 for(let frame=0;frame<12;frame++) {
  await page.screenshot({path:`temp/battle-scene/${String(frame).padStart(2,'0')}.png`});
  poses.push(await page.evaluate(()=>({...app.scenery.camera.pose})));
  await page.waitForTimeout(80);
 }
 assert.notDeepEqual(poses[0],poses[11],'scene camera did not animate');
 assert.ok(Math.abs(poses[11].lift-.16)<.001,'matching camera did not settle');
await page.screenshot({path:'docs/verification/battle-matching.png'});
 await click('Matching-cancel');assert.equal(await page.evaluate(()=>command.action),'cancelQueue');
 assert.deepEqual(errors,[]);console.log('PASS: digits, delete, random, lock confirmation, guess, records, empty history, short screen, selected-slot replacement, locked/waiting input guards, secret hide/reveal, 8 avatar choices, matching cancel; no page errors.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
