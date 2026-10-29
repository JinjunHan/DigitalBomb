/** Visual bounds and identity regression checks against the built Cocos client. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8080');await page.waitForFunction(()=>window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c=>c.feedbackArt?.ready&&c.battleArtReady&&c.net.state));
 await page.evaluate(()=>{window.app=cc.director.getScene().getChildByName('Canvas').components.find(c=>c.net?.state);app.net.onState=()=>{};app.net.onStatus=()=>{};app.net.stop();localStorage.setItem('db-motion','0');});await page.waitForTimeout(250);
 fs.mkdirSync('docs/verification/page-details',{recursive:true});
 await page.evaluate(()=>{app.net.online=true;app.net.state.me.avatar=7;app.net.state.me.avatarUrl='';app.openProfile();});
 assert.equal(await page.evaluate(()=>app.avatar),3);
 assert.equal(await page.evaluate(()=>app.avatarFrame(app.net.state.me)===app.profileArt.get('avatar-3')),true);
 await page.screenshot({path:'docs/verification/page-details/legacy-avatar.png'});
 for(const height of [844,600]){
  await page.setViewportSize({width:390,height});await page.waitForTimeout(100);
  await page.evaluate(()=>{const me=app.net.state.me;app.page='lobby';app.net.online=true;app.net.state.room={id:'detail-check',mode:'friend',phase:'playing',players:[{...me,online:true,ready:true},{id:'peer',name:'十二个字的超长对手昵称测试',avatar:5,online:true,ready:true}],round:4,turn:7,current:me.id,first:me.id,deadline:app.net.now()+30000,startAt:app.net.now()-1000,history:[{playerId:me.id,turn:5,digits:'0123',hits:2}],ownSecret:'1122',rematch:[]};app.draft='';app.render();window.bounds=n=>n.components.find(c=>c.getBoundingBoxToWorld).getBoundingBoxToWorld();});
  assert.equal(await page.evaluate(()=>app.root.getChildByName('BattleRoom').getChildByName('Battle-play-action').components.find(c=>'grayscale'in c).grayscale),true);
  await page.evaluate(()=>app.showFeedback({kind:'opponent',art:'opponent-3',hits:3,title:'对手猜测',caption:'',urgent:true}));
  const check=await page.evaluate(()=>{const room=app.root.getChildByName('BattleRoom'),group=app.effects.getChildByName('GuessFeedback'),banner=bounds(group.getChildByName('FeedbackArt-opponent-3')),records=bounds(room.getChildByName('Battle-records')),nav=bounds(room.getChildByName('Battle-round'));
   const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
   return{records:overlaps(banner,records),nav:overlaps(banner,nav),peerVisible:room.getChildByName('PlayerPortrait').active};});
  assert.deepEqual(check,{records:false,nav:false,peerVisible:false});
  await page.screenshot({path:`docs/verification/page-details/feedback-${height}.png`});
  await page.evaluate(()=>{app.draft='1234';app.render();});assert.equal(await page.evaluate(()=>app.root.getChildByName('BattleRoom').getChildByName('Battle-play-action').components.find(c=>'grayscale'in c).grayscale),false);
  await page.waitForTimeout(2100);assert.equal(await page.evaluate(()=>app.root.getChildByName('BattleRoom').getChildByName('PlayerPortrait').active),true);
 }
 assert.deepEqual(errors,[]);console.log('PASS: legacy avatar selection; feedback avoids navigation/records at 390x844 and 390x600; peer restored after feedback and redraw; disabled/enabled guess states.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
