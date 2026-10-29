/** Real two-client HTTP/WS journey. No game state fixtures or debug routes for the match. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 fs.mkdirSync('docs/verification/journey',{recursive:true});const errors=[];
 async function player(){const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('db-motion','0'));await page.goto('http://127.0.0.1:8080');await page.waitForFunction(()=>window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c=>c.feedbackArt?.ready&&c.battleArtReady&&c.friendArtReady&&c.modalArtReady&&c.net.state));await page.evaluate(()=>window.app=cc.director.getScene().getChildByName('Canvas').components.find(c=>c.net?.state));return page;}
 const a=await player(),b=await player();
 async function click(page,name){const point=await page.evaluate(name=>{let node;const visit=n=>{if(n.name===name)node=n;n.children.forEach(visit)};visit(app.node);if(!node)throw Error('missing '+name);const r=node.components.find(c=>c.getBoundingBoxToWorld).getBoundingBoxToWorld();return{x:(r.x+r.width/2)*innerWidth/750,y:innerHeight-(r.y+r.height/2)*innerHeight/app.screenHeight};},name);await page.mouse.click(point.x,point.y);await page.waitForTimeout(100);}
 const shot=async(page,name)=>{await page.waitForTimeout(120);await page.screenshot({path:'docs/verification/journey/'+name+'.png'});};
 const phase=async(page,value)=>page.waitForFunction(value=>app.net.state.room?.phase===value,value);
 await shot(a,'01-lobby');await click(a,'Lobby-help-full');assert.equal(await a.evaluate(()=>app.overlay),'rules');await a.evaluate(()=>app.closeModal());
 await a.evaluate(()=>app.openProfile());await shot(a,'02-profile');await a.evaluate(()=>{app.nicknameEditBox.string='流程测试甲';return app.saveProfile();});assert.equal(await a.evaluate(()=>app.net.state.me.name),'流程测试甲');
 await a.evaluate(()=>{app.toast('可关闭的提示');window.lobbyNode=app.root.getChildByName('Lobby-title');app.noticeUntil=0;app.updateTimer();if(window.lobbyNode!==app.root.getChildByName('Lobby-title'))throw Error('toast expiration rebuilt page');});
 await a.evaluate(()=>app.toast('点击关闭提示'));await click(a,'FeedbackArt-warning');assert.equal(await a.evaluate(()=>app.notice),'');
 await click(a,'Lobby-friend-full');await shot(a,'03-join');await click(a,'Join-create');await phase(a,'waiting');await shot(a,'04-waiting');
 const code=await a.evaluate(()=>app.net.state.room.code);await click(b,'Lobby-friend-full');for(const digit of code)await click(b,'Join-key-'+digit);await click(b,'Join-join');await phase(a,'preparing');await phase(b,'preparing');await shot(a,'05-prepare');
 for(const [page,secret]of [[a,'1122'],[b,'0123']]){for(const digit of secret)await click(page,'Battle-prep-'+digit);await click(page,'Battle-lock');await click(page,'ModalArt-lock-confirm');}
 await phase(a,'playing');await a.waitForFunction(()=>app.net.now()>=app.net.state.room.startAt);await shot(a,'06-playing');
 const firstA=await a.evaluate(()=>app.net.state.room.current===app.net.state.me.id);const first=firstA?a:b,second=firstA?b:a;
 for(const digit of firstA?'0123':'1122')await click(first,'Battle-play-'+digit);await click(first,'Battle-play-action');await phase(second,'reply');await shot(second,'07-reply');
 for(const digit of firstA?'1122':'0123')await click(second,'Battle-play-'+digit);await click(second,'Battle-play-action');await phase(a,'finished');assert.equal(await a.evaluate(()=>app.net.state.room.result.reason),'same_round');await a.waitForTimeout(1800);await shot(a,'08-result');
 await click(a,'FeedbackArt-records');assert.equal(await a.evaluate(()=>app.overlay),'resultRecords');await shot(a,'09-records');await click(a,'ModalArt-result-done');
 await a.evaluate(()=>app.warnedTurn=0);await click(a,'FeedbackArt-rematch');await shot(a,'10-rematch');await click(b,'FeedbackArt-rematch');await phase(a,'preparing');await phase(b,'preparing');assert.equal(await a.evaluate(()=>app.warnedTurn),-1);
 await b.evaluate(()=>app.act('leave'));await phase(a,'waiting');await a.evaluate(()=>app.act('leave'));await a.waitForFunction(()=>!app.net.state.room);await a.evaluate(()=>{app.page='lobby';app.render();});
 await click(a,'Lobby-match-full');await a.waitForFunction(()=>app.net.state.queuedAt!==null);await shot(a,'11-matching');await a.evaluate(()=>app.act('cancelQueue'));assert.equal(await a.evaluate(()=>app.net.state.queuedAt),null);
 // A rejected invitation must preserve its four-digit code in the actual join input.
 await a.evaluate(()=>{app.pendingInvitation={code:'0000',roomId:'expired-test'};app.consumeInvitation();});await a.waitForFunction(()=>!app.joiningInvitation);assert.equal(await a.evaluate(()=>app.code),'0000');assert.ok(await a.evaluate(()=>app.notice.length));await shot(a,'12-expired-invite');
 await a.evaluate(()=>{window.nativeCommand=app.net.command;app.net.command=()=>new Promise(r=>window.resolveCommand=r);window.pendingAction=app.act('create');});assert.equal(await a.evaluate(()=>app.busy),true);await a.evaluate(()=>{resolveCommand();app.net.command=nativeCommand;});await a.evaluate(()=>pendingAction);
 await a.setViewportSize({width:390,height:600});await a.evaluate(()=>{app.page='lobby';app.render();});assert.equal(await a.evaluate(()=>app.notice),'');await shot(a,'13-short-lobby');
 assert.deepEqual(errors,[]);console.log('PASS: real two-client lobby/profile/join/preparation/guess/reply/draw/records/rematch/leave/match-cancel; toast stability; invitation failure; request busy state; short screen.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
