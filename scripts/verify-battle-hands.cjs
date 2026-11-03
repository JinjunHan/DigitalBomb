const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
const p=await b.newPage({viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto('http://127.0.0.1:8080');await p.waitForFunction(()=>window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c=>c.battleArtReady));
await p.evaluate(()=>{window.app=cc.director.getScene().getChildByName('Canvas').components.find(c=>c.battleArtReady);app.net.onState=()=>{};app.net.onStatus=()=>{};app.net.stop();app.net.online=true;app.startupEntered=true;app.releaseStartup();app.learning.close();app.dismissNotice();window.fixture=(phase,count)=>{const me={id:'fixture',name:'测试玩家',avatar:0};app.net.state={me,queuedAt:null,serverNow:Date.now(),room:{id:'hands',mode:'public',phase,digitCount:count,players:[{...me,ready:false,online:true},{id:'peer',name:'对手',avatar:1,ready:false,online:true}],version:1,round:1,turn:0,current:me.id,first:me.id,deadline:Date.now()+60000,startAt:Date.now()-1000,history:[],ownSecret:phase==='preparing'?undefined:'1234'.slice(0,count),rematch:[]}};app.draft='1234'.slice(0,count);app.selected=-1;app.busy=false;app.overlay='';app.render();};});
fs.mkdirSync('/tmp/digitalbomb-hands',{recursive:true});
for(const height of [844,600]){await p.setViewportSize({width:390,height});for(const phase of ['preparing','playing'])for(const count of [2,3,4]){await p.evaluate(([phase,count])=>fixture(phase,count),[phase,count]);await p.waitForTimeout(200);
const bounds=await p.evaluate(()=>{const group=app.root.getChildByName('BattleRoom');return ['BattleGripLeft','BattleGripRight'].map(name=>{const n=group.getChildByName(name),r=n.getComponent('cc.UITransform').getBoundingBoxToWorld();return {x:r.x,right:r.x+r.width};});});
assert.ok(bounds[0].x<0 && bounds[1].right>750,'sleeve cuts must remain offscreen');
await p.screenshot({path:`/tmp/digitalbomb-hands/${phase}-${count}-${height}.png`});}}
await p.evaluate(()=>{fixture('preparing',2);app.selected=0;app.render();});
const point=await p.evaluate(()=>{const card=app.root.getChildByName('BattleRoom').getChildByName('SecretCard-1').getChildByName('Battle-card-paper');const v=card.worldPosition,r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x+v.x/750*r.width,y:r.y+r.height-v.y/app.screenHeight*r.height};});
await p.mouse.click(point.x,point.y);assert.equal(await p.evaluate(()=>app.selected),1);
await p.keyboard.press('9');assert.equal(await p.evaluate(()=>app.draft),'19');
await p.screenshot({path:'/tmp/digitalbomb-hands/selected-2.png'});
await p.evaluate(()=>fixture('playing',3));
const reveal=await p.evaluate(()=>{const group=app.root.getChildByName('BattleRoom'),card=group.children.find(n=>n.name==='Battle-card-paper');const v=card.worldPosition,r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x+v.x/750*r.width,y:r.y+r.height-v.y/app.screenHeight*r.height};});
await p.mouse.click(reveal.x,reveal.y);assert.equal(await p.evaluate(()=>app.hideSecret),true);
assert.deepEqual(errors,[]);console.log('PASS: 2/3/4-card preparation and gameplay at tall/short sizes, no page errors');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
