/** Local browser fixtures. No test hooks are shipped in the client. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8080');
 await page.waitForFunction(()=>window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c=>c.feedbackArt?.ready&&c.net.state));
 await page.evaluate(()=>{
  window.app=cc.director.getScene().getChildByName('Canvas').components.find(c=>c.feedbackArt?.ready);window.base=JSON.parse(JSON.stringify(app.net.state));
  app.net.onState=()=>{};app.net.onStatus=()=>{};app.net.stop();app.net.online=true;app.act=async(action,payload)=>{window.command={action,payload};};
  window.fixture=(phase='playing',reason='cracked',winner='peer')=>{app.clearEffects();app.net.online=true;app.overlay='';app.notice='';app.rematchNotice='';app.net.state={...base,room:{id:'feedback-fixture',mode:'public',phase,players:[{...base.me,ready:true,online:true},{id:'peer',name:'十二个字的超长对手昵称测试',avatar:1,ready:true,online:true}],version:1,round:4,turn:7,current:base.me.id,first:'peer',deadline:app.net.now()+30000,startAt:app.net.now()-1000,history:[],ownSecret:'6289',rematch:[],result:phase==='finished'||phase==='cancelled'?{winner,reason}:undefined,revealed:phase==='finished'?{[base.me.id]:'6289',peer:'7041'}:undefined},queuedAt:null};app.lastRoom='feedback-fixture';app.lastPhase=phase;app.seenGuesses=0;app.lastTurn=7;app.suppressFeedback=false;app.draft='';app.busy=false;app.render();};
 });
 await page.waitForTimeout(250);
 const shot=async name=>{await page.waitForTimeout(240);await page.screenshot({path:`docs/verification/feedback-${name}.png`});};
 const click=async name=>{const point=await page.evaluate(name=>{let node;const visit=n=>{if(n.name===name)node=n;n.children.forEach(visit);};visit(app.node);if(!node)throw Error(name+' missing');const p=node.worldPosition;return{x:p.x/cc.view.getVisibleSize().width*innerWidth,y:innerHeight-p.y/cc.view.getVisibleSize().height*innerHeight};},name);await page.mouse.click(point.x,point.y);};
 await page.evaluate(()=>{fixture();app.net.state.room.history=[{playerId:'peer',turn:6,digits:'6189',hits:3}];app.stateChanged();});
 await shot('opponent3');assert.equal(await page.evaluate(()=>app.effects.getChildByName('GuessFeedback')?.children.some(n=>n.name==='FeedbackArt-opponent-3')),true);
 await click('Battle-play-1');assert.equal(await page.evaluate(()=>app.draft),'1');
 await page.evaluate(()=>{app.stateChanged();});assert.equal(await page.evaluate(()=>app.effects.children.length),1);
 await page.evaluate(()=>{fixture('reply');app.net.state.room.history=[{playerId:'peer',turn:6,digits:'6289',hits:4}];app.stateChanged();});await shot('reply');
 await page.evaluate(()=>{fixture();app.net.state.room.history=[{playerId:base.me.id,turn:6,digits:null,hits:null}];app.stateChanged();});await shot('timeout');
 await page.evaluate(()=>{fixture();app.feedback('我的猜测',2,'1234','推理正在接近答案');});await shot('own');
 for(const [phase,reason,winner,name] of [['finished','cracked','peer','defeat'],['finished','same_round',null,'draw'],['finished','timeout','peer','timeout-result'],['cancelled','prepare_timeout',null,'cancelled'],['cancelled','room_expired',null,'expired']]){
  await page.evaluate(([p,r,w])=>fixture(p,r,w),[phase,reason,winner]);await shot(name);
 }
 await click('FeedbackArt-home');assert.equal(await page.evaluate(()=>command.action),'leave');
 await page.evaluate(()=>fixture('finished'));await click('FeedbackArt-rematch');assert.equal(await page.evaluate(()=>command.action),'rematch');
 await click('FeedbackArt-match');assert.equal(await page.evaluate(()=>command.action),'queue');
 await click('FeedbackArt-records');assert.equal(await page.evaluate(()=>app.overlay),'resultRecords');await page.waitForTimeout(600);await shot('empty-records');
 await click('ModalArt-result-done');await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>app.overlay),'');
 await page.evaluate(()=>{fixture('finished');app.net.state.room.rematch=[base.me.id];app.render();});await shot('rematch');
 await page.evaluate(()=>{fixture();app.toast('确认超时，请查看同步后的状态');});await shot('notice');
 await page.evaluate(()=>{fixture();app.suppressFeedback=true;app.net.state.room.history=[{playerId:'peer',turn:6,digits:'1234',hits:3}];app.stateChanged();});assert.equal(await page.evaluate(()=>app.effects.children.length),0);
 for(const kind of ['win','expired-invite','peer-left','timeout-end','loading','login-failed']) {
  await page.evaluate(kind=>{
   fixture('finished','cracked',kind==='win'?base.me.id:'peer');
   if(kind==='expired-invite')app.rematchNotice='再战邀请已过期，请重新匹配';
   if(kind==='peer-left')app.rematchNotice='对方已离开，请重新匹配';
   if(kind==='loading'||kind==='login-failed'){app.net.state=null;app.loginFailed=kind==='login-failed';}
   if(kind==='timeout-end'){fixture();app.net.state.room.phase='finished';app.net.state.room.result={winner:'peer',reason:'timeout'};app.stateChanged();}else app.render();
  },kind);await shot(kind);
 }
 await page.setViewportSize({width:390,height:600});await page.evaluate(()=>fixture('finished'));await shot('short-result');
 await page.evaluate(()=>{fixture();app.showFeedback({kind:'opponent',hits:3,title:'',caption:'',art:'opponent-3',urgent:true});});await shot('short-opponent');
 fs.mkdirSync('temp/feedback-motion',{recursive:true});
 await page.evaluate(()=>{localStorage.setItem('db-motion','1');fixture();app.showFeedback({kind:'opponent',hits:3,title:'',caption:'',art:'opponent-3',urgent:true});});
 const opacities=[];for(let i=0;i<12;i++){opacities.push(await page.evaluate(()=>app.effects.getChildByName('GuessFeedback')?.components.find(c=>typeof c.opacity==='number')?.opacity??0));await page.screenshot({path:`temp/feedback-motion/${String(i).padStart(2,'0')}.png`});await page.waitForTimeout(170);}
 await page.waitForTimeout(400);assert.ok(opacities.some(v=>v>200),JSON.stringify(opacities));assert.equal(await page.evaluate(()=>app.effects.children.length),0);
 await page.evaluate(()=>{localStorage.setItem('db-motion','0');fixture();app.showFeedback({kind:'opponent',hits:0,title:'',caption:'',art:'opponent-0'});});assert.equal(await page.evaluate(()=>app.effects.children[0].components.find(c=>typeof c.opacity==='number').opacity),255);

 // Audit coverage: score variants, cancellation causes, result reasons and short-screen notices.
 for(const own of [false,true])for(let hits=0;hits<=4;hits++){
  await page.evaluate(({own,hits})=>{fixture(hits===4?'reply':'playing');app.net.state.room.history=[{playerId:own?base.me.id:'peer',turn:6,digits:'1234',hits}];app.stateChanged();},{own,hits});
  assert.equal(await page.evaluate(()=>app.effects.getChildByName('GuessFeedback')?.children.some(n=>n.name.startsWith('FeedbackArt-'))),true);
 }
 for(const [reason,art] of [['player_left','cancel-2'],['both_offline','cancel-3']]){
  await page.evaluate(reason=>fixture('cancelled',reason,null),reason);
  assert.equal(await page.evaluate(art=>{let found=false;const visit=n=>{if(n.name==='FeedbackArt-'+art)found=true;n.children.forEach(visit);};visit(app.root);return found;},art),true);
 }
 for(const reason of ['round_limit','disconnect','resigned','reply_timeout']){
  await page.evaluate(reason=>fixture('finished',reason,reason==='round_limit'?null:'peer'),reason);
  await shot('audit-'+reason);
 }
 for(const message of ['确认超时，请查看同步后的状态','房间暂不可加入','昵称需为 2–12 个中文、字母或数字']){
  await page.evaluate(message=>{fixture();app.toast(message);},message);
  const bottom=await page.evaluate(()=>{const group=app.root.getChildByName('Notice'),art=group.children.find(n=>n.name.startsWith('FeedbackArt-'));const size=art.components.find(c=>typeof c.height==='number');return group.position.y-size.height/2+app.screenHeight/2;});
  assert.ok(bottom>=36,'notice must clear bottom safe inset: '+bottom);
 }
 await shot('audit-short-notice');
 assert.deepEqual(errors,[]);console.log('PASS: opponent input remains usable; reply, timeout, terminal, cancellation, empty records, rematch, toast; buttons; reconnect suppression; tall/short screens; real motion frames; motion disabled.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
