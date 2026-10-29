const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8080');await p.waitForFunction(()=>window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c=>c.lobbyDigitFrames?.length===10&&c.matchingArtReady&&c.lobbyArt.has('machine')));
 await p.evaluate(()=>{window.app=cc.director.getScene().getChildByName('Canvas').components.find(c=>c.net);app.net.onState=()=>{};app.net.onStatus=()=>{};app.net.stop();app.net.online=true;app.net.state={me:{id:'fixture',name:'界面测试',avatar:0},room:null,queuedAt:null,serverNow:Date.now()};app.page='lobby';app.dismissNotice();app.landingCalls=[];const play=app.audio.play.bind(app.audio);app.audio.play=name=>{if(name==='tap')app.landingCalls.push(app.lobbyShuffle.elapsed);play(name);};localStorage.setItem('db-motion','1');app.render();});
 assert.equal(await p.evaluate(()=>app.lobbyReels.length),4);
 const poses=[];for(let i=0;i<22;i++){poses.push(await p.evaluate(()=>app.lobbyShuffle.pose(0).offset));await p.screenshot({path:`docs/verification/lobby-shuffle/frame-${String(i).padStart(2,'0')}.png`});await p.waitForTimeout(80);}
 assert.ok(new Set(poses.map(n=>n.toFixed(2))).size>3,'real frames animate');
 await p.waitForFunction(()=>app.lobbyShuffle.elapsed>app.lobbyShuffle.rollDuration);
 assert.equal(await p.evaluate(()=>app.landingCalls.length),4,'one landing cue per reel');
 const settled=await p.evaluate(()=>[0,1,2,3].map(i=>app.lobbyShuffle.pose(i).digit));
 await p.screenshot({path:'docs/verification/lobby-shuffle/settled.png'});
 await p.evaluate(()=>app.render());assert.deepEqual(await p.evaluate(()=>[0,1,2,3].map(i=>app.lobbyShuffle.pose(i).digit)),settled);
 const remaining=await p.evaluate(()=>Math.max(0,(app.lobbyShuffle.rollDuration+app.lobbyShuffle.holdDuration-app.lobbyShuffle.elapsed-.35)*1000));
 await p.waitForTimeout(remaining);assert.deepEqual(await p.evaluate(()=>[0,1,2,3].map(i=>app.lobbyShuffle.pose(i).digit)),settled);
 await p.waitForFunction(()=>app.lobbyShuffle.elapsed<1.2);await p.screenshot({path:'docs/verification/lobby-shuffle/next-cycle.png'});
 await p.evaluate(()=>{app.net.state.queuedAt=app.net.now();app.render();window.hour=app.matchingArt.get('hourglass-sheet');});
 const rect=await p.evaluate(()=>({x:hour.rect.x,y:hour.rect.y,width:hour.rect.width,height:hour.rect.height}));
 await p.waitForTimeout(1600);assert.deepEqual(await p.evaluate(()=>({x:hour.rect.x,y:hour.rect.y,width:hour.rect.width,height:hour.rect.height})),rect);assert.deepEqual(rect,{x:0,y:0,width:320,height:320});
 await p.screenshot({path:'docs/verification/lobby-shuffle/static-hourglass.png'});
 await p.evaluate(()=>{app.net.state.queuedAt=null;app.render();});assert.ok(await p.evaluate(()=>app.lobbyShuffle.elapsed<.3));
 await p.evaluate(()=>localStorage.setItem('db-motion','0'));await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>app.lobbyShuffle.pose(3).active),false);
 await p.setViewportSize({width:390,height:600});await p.waitForTimeout(150);await p.screenshot({path:'docs/verification/lobby-shuffle/short.png'});
 assert.deepEqual(errors,[]);console.log('PASS: actual rolling frames, stable hold across redraw, next cycle, immediate reentry, static hourglass, motion off, short viewport');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
