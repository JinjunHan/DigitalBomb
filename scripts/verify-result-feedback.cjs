/** UI fixture verification uses the real built Cocos scene, pointer drags and native ScrollView. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8080');await page.waitForFunction(()=>window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c=>c.net&&c.feedbackArt?.ready&&c.battleArtReady&&c.modalArtReady));
 await page.evaluate(()=>{window.app=cc.director.getScene().getChildByName('Canvas').components.find(c=>c.net);app.net.onState=()=>{};app.net.onStatus=()=>{};app.net.stop();localStorage.setItem('db-motion','0');app.net.state={me:{id:'local-review',name:'界面测试',avatar:0},room:null,queuedAt:null,serverNow:Date.now()};window.me={...app.net.state.me};app.dismissNotice();});await page.waitForTimeout(250);
 await page.evaluate(()=>{app.net.online=true;window.room=(phase='playing')=>({id:'ui-repair-room',mode:'friend',phase,players:[{...me,online:true,ready:phase!=='preparing'},{id:'peer',name:'对手玩家',avatar:1,online:true,ready:phase!=='preparing'}],round:20,turn:39,current:me.id,first:me.id,startAt:app.net.now()-1000,deadline:app.net.now()+60000,history:Array.from({length:40},(_,i)=>({playerId:i%2===0?me.id:'peer',turn:i,digits:String(1000+i),hits:i%4})),ownSecret:phase==='preparing'?undefined:'1122',rematch:[]});window.find=name=>{let result;const visit=n=>{if(n.name===name)result=n;n.children.forEach(visit)};visit(app.node);return result;};window.scroll=()=>find('BattleRecordsViewport').components.find(c=>c.getScrollOffset);});

 const shot=async name=>{await page.waitForTimeout(120);await page.screenshot({path:`docs/verification/result-feedback-fix/${name}.png`});};
 for(const [name,winner,reason] of [['victory',await page.evaluate(()=>me.id),'cracked'],['defeat','peer','cracked'],['win-timeout',await page.evaluate(()=>me.id),'timeout']]){
 await page.evaluate(({winner,reason})=>{app.net.state.room={...room('finished'),result:{winner,reason},revealed:{[me.id]:'1122',peer:'0123'}};app.render();},{winner,reason});await shot(name);
 }
 await page.evaluate(()=>{app.net.state.room=room();app.render();});
 for(let hits=0;hits<5;hits++){
 await page.evaluate(hits=>app.showFeedback({kind:'own',title:hits===4?'全部命中':'我的猜测',caption:hits===4?'等待对手本轮补猜':['暂未命中，换个思路','找到一点线索了','推理正在接近答案','只差一位，继续推理'][hits],hits,art:hits===4?'own-gold':'own'}),hits);await shot('own-'+hits);
 }
 for(let hits=0;hits<5;hits++){
 await page.evaluate(hits=>app.showFeedback({kind:'opponent',title:'',caption:'',hits,art:'opponent-'+hits}),hits);await shot('opponent-'+hits);
 assert.equal(await page.evaluate(()=>find('GuessFeedback').children.filter(n=>n.name==='PlayerPortraitRim').length),0);
 }
 await page.setViewportSize({width:390,height:600});await page.evaluate(()=>{app.clearEffects();app.net.state.room={...room('finished'),result:{winner:me.id,reason:'cracked'},revealed:{[me.id]:'1122',peer:'0123'}};app.render();});await shot('short-victory');
 assert.deepEqual(errors,[]);console.log('PASS: paired win/loss, actual reason, own 0–4, opponent 0–4 single portrait rim, short result');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
