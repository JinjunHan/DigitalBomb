// Inspect the matching art in a real queued game.
const enterTestLobby = require('./enter-test-lobby.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8080');
    await enterTestLobby(page);
    await page.evaluate(() => {
      window.app = cc.director.getScene().getChildByName('Canvas').components.find(c => c.net);
      return app.act('queue');
    });
    const geometry = () => page.evaluate(() => {
      const room = (app.matchingIncoming ?? app.root).getChildByName('MatchingRoom');
      const frame = room.getChildByName('Matching-hourglass-sheet').getComponent(cc.Sprite).spriteFrame;
      return [frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height, frame.texture.width, frame.texture.height];
    });
    const still = [0, 0, 320, 320, 1280, 1280];
    assert.deepEqual(await geometry(), still);
    await page.waitForTimeout(650);
    assert.deepEqual(await geometry(), still);
    await page.screenshot({ path: 'docs/verification/package-budget/matching.png' });
    await page.evaluate(() => app.act('cancelQueue'));
    assert.equal(await page.evaluate(() => app.net.state.queuedAt), null);
    assert.deepEqual(errors, []);
    console.log('PASS: matching displays the upright atlas cell at its original dimensions and cancels the queue.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
