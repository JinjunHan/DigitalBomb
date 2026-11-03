const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8080');
    await page.waitForFunction(() => window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c => c.matchingArtReady && c.lobbyArt.has('machine')));
    await page.evaluate(() => {
      window.app = cc.director.getScene().getChildByName('Canvas').components.find(c => c.net);
      app.net.onState = () => {}; app.net.onStatus = () => {}; app.net.stop(); app.net.online = true;
      app.net.state = { me: { id: 'motion-fixture', name: '动画测试', avatar: 0 }, room: null, queuedAt: null, serverNow: Date.now() };
      app.startupEntered = true; app.releaseStartup(); app.page = 'lobby'; app.dismissNotice(); app.learning.close();
      localStorage.setItem('db-learning-offered-v1-motion-fixture', '1');
      localStorage.setItem('db-motion', '1'); app.render();
      app.net.state.queuedAt = app.net.now(); app.render();
    });
    const output = '/tmp/digitalbomb-matching-frames'; fs.mkdirSync(output, { recursive: true });
    const frames = [];
    for (let i = 0; i < 8; i++) {
      frames.push(await page.evaluate(() => ({ elapsed: app.matchingMotionElapsed, opacity: app.matchingIncoming?.getComponent('cc.UIOpacity').opacity })));
      await page.screenshot({ path: `${output}/${i}.png` });
      if (i === 1) {
        await page.evaluate(() => {
          const elapsed = app.matchingMotionElapsed, outgoing = app.matchingOutgoing;
          app.render();
          if (app.matchingMotionElapsed !== elapsed || app.matchingOutgoing !== outgoing) throw Error('Redraw restarted transition');
        });
      }
      await page.waitForTimeout(40);
    }
    assert.ok(new Set(frames.map(frame => frame.opacity)).size > 2, 'real frames animate');
    await page.waitForFunction(() => !app.matchingMotion);
    assert.equal(await page.evaluate(() => app.matchingOutgoing === undefined), true);
    assert.equal(await page.evaluate(() => app.matchingIncoming.getComponent('cc.UIOpacity').opacity), 255);
    await page.evaluate(() => {
      app.net.state.queuedAt = null; app.render();
      app.net.state.queuedAt = app.net.now(); app.render();
      app.net.state.queuedAt = null; app.render();
      if (app.matchingMotion || app.matchingOutgoing || app.root.getChildByName('MatchingIncoming')) throw Error('Cancel left transition nodes');
      localStorage.setItem('db-motion', '0');
      app.net.state.queuedAt = app.net.now(); app.render();
      if (app.matchingMotion || app.matchingIncoming) throw Error('Motion preference ignored');
    });
    assert.deepEqual(errors, []);
    console.log('PASS: continuous frames, redraw continuity, completion cleanup, immediate cancellation, motion disabled');
    console.log(JSON.stringify(frames));
    console.log(`Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
