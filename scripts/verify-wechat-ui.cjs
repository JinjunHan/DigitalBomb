const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://thirdwx.qlogo.cn/**',route=>route.fulfill({path:'assets/resources/art/profile/avatar-1.png',contentType:'image/png'}));
 await page.goto('http://127.0.0.1:8080');await page.waitForFunction(()=>window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c=>c.feedbackArt?.ready&&c.friendArtReady&&c.net.state));
 await page.evaluate(()=>{window.app=cc.director.getScene().getChildByName('Canvas').components.find(c=>c.net?.state);window.base=JSON.parse(JSON.stringify(app.net.state));app.net.onState=()=>{};app.net.onStatus=()=>{};app.net.stop();});await page.waitForTimeout(250);
 await page.evaluate(()=>{
  window.native={destroyed:0};window.wx={getWindowInfo:()=>({windowWidth:innerWidth,windowHeight:innerHeight,screenHeight:innerHeight}),getMenuButtonBoundingClientRect:()=>({bottom:32}),requirePrivacyAuthorize:o=>o.success(),createUserInfoButton:o=>{native.rect=o.style;return{onTap:f=>native.tap=f,show:()=>{},destroy:()=>native.destroyed++};},openPrivacyContract:()=>native.privacy=true,shareAppMessage:o=>native.share=o};
  app.wxFlow.wx=wx;app.net.online=true;app.net.command=async(action,payload)=>{native.command={action,payload};};app.net.state={...base,room:null,queuedAt:null};localStorage.setItem('db-motion','0');app.openProfile();
 });
 await page.evaluate(()=>app.authorizeProfile());
 const rect=await page.evaluate(()=>native.rect);assert.ok(rect.top>0&&rect.left>=0&&rect.top+rect.height<844);
 await page.evaluate(()=>native.tap({userInfo:{nickName:'微信玩家',avatarUrl:'https://thirdwx.qlogo.cn/mmopen/vi_32/test/132'}}));await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>app.nickname),'微信玩家');await page.screenshot({path:'docs/verification/wechat-profile-preview.png'});
 await page.evaluate(()=>app.saveProfile());assert.equal(await page.evaluate(()=>native.command.payload.avatarUrl),'https://thirdwx.qlogo.cn/mmopen/vi_32/test/132');
 await page.evaluate(()=>{app.openProfile();app.wxFlow.openPrivacy();});assert.equal(await page.evaluate(()=>native.privacy),true);
 await page.evaluate(()=>app.authorizeProfile());await page.evaluate(()=>{app.closeProfile();native.tap({userInfo:{nickName:'过期回调',avatarUrl:'https://thirdwx.qlogo.cn/mmopen/vi_32/test/132'}});});assert.notEqual(await page.evaluate(()=>app.nickname),'过期回调');
 await page.evaluate(()=>{app.notice='';app.net.state.room={id:'friend-test',mode:'friend',phase:'waiting',code:'0012',players:[{...base.me,ready:false,online:true}],version:1,round:0,turn:0,current:base.me.id,first:base.me.id,deadline:app.net.now()+600000,startAt:0,history:[],rematch:[]};app.render();app.wxFlow.share();});assert.equal(await page.evaluate(()=>native.share.query),'code=0012&roomId=friend-test');await page.screenshot({path:'docs/verification/wechat-friend-invite.png'});
 await page.evaluate(()=>{app.net.state.room=null;app.pendingInvitation={code:'0012',roomId:'friend-test'};app.consumeInvitation();});assert.equal(await page.evaluate(()=>native.command.payload.inviteRoomId),'friend-test');
 assert.deepEqual(errors,[]);console.log('PASS: WeChat API mock integration, native bounds, profile preview/save, privacy entry, callback cleanup, sharing and invitation join. Not real-device authorization.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
