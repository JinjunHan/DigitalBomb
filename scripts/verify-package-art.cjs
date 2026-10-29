const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8080');await page.waitForFunction(()=>window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c=>c.net?.state&&c.matchingArtReady));
 await page.evaluate(()=>{window.app=cc.director.getScene().getChildByName('Canvas').components.find(c=>c.net?.state);localStorage.setItem('db-motion','1');});
 assert.equal(await page.evaluate(()=>app.hourglassFrames.length),16);
 assert.equal(await page.evaluate(()=>app.hourglassFrames.every(f=>f.rect.width===320&&f.rect.height===320&&f.texture.width===1280&&f.texture.height===1280)),true);
 await page.evaluate(()=>app.act('queue'));await page.waitForFunction(()=>app.net.state.queuedAt!==null&&app.hourglass);
 const first=await page.evaluate(()=>app.hourglassFrames.indexOf(app.hourglass.spriteFrame));await page.waitForTimeout(650);
 assert.notEqual(await page.evaluate(()=>app.hourglassFrames.indexOf(app.hourglass.spriteFrame)),first);
 await page.screenshot({path:'docs/verification/package-budget/matching.png'});await page.evaluate(()=>app.act('cancelQueue'));assert.equal(await page.evaluate(()=>app.net.state.queuedAt),null);
 assert.deepEqual(errors,[]);console.log('PASS: all 16 compressed atlas frames resolve with original geometry; live matching animation advances; cancellation succeeds.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
