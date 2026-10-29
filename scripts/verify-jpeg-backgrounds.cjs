/** Check converted textures via actual Cocos resource loading and composed scene captures. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8080');await page.waitForFunction(()=>window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c=>c.net?.state&&c.scenery?.ready&&c.feedbackArt?.ready));
 await page.evaluate(()=>{window.app=cc.director.getScene().getChildByName('Canvas').components.find(c=>c.net?.state);app.net.onState=()=>{};app.net.onStatus=()=>{};app.net.stop();localStorage.setItem('db-motion','0');});await page.waitForTimeout(200);
 const loaded=await page.evaluate(async()=>{const result=[];for(const key of ['art/lobby/background','art/scene/room','art/table']){const texture=await new Promise((resolve,reject)=>cc.resources.load(key+'/texture',cc.Texture2D,(error,value)=>error?reject(error):resolve(value)));result.push({key,width:texture.width,height:texture.height});}return result;});
 assert.deepEqual(loaded,[{key:'art/lobby/background',width:941,height:1672},{key:'art/scene/room',width:864,height:1536},{key:'art/table',width:941,height:1672}]);
 for(const view of ['lobby','game','matching']){await page.evaluate(view=>{app.net.online=true;app.page='lobby';app.render();app.scenery.setView(view,false);if(view!=='lobby')app.root.active=false;},view);await page.waitForTimeout(100);await page.screenshot({path:`docs/verification/jpeg-backgrounds/${view}.png`});}
 assert.deepEqual(errors,[]);console.log('PASS: all three JPEG textures resolve via original extensionless keys at unchanged dimensions; lobby/game/matching backdrop compositions captured without runtime errors.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
