const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8080');
    await page.waitForFunction(() => window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c => c.lobbyArt?.has('machine')));
    await page.evaluate(() => {
      window.app = cc.director.getScene().getChildByName('Canvas').components.find(c => c.net);
      app.net.onState = () => {}; app.net.onStatus = () => {}; app.net.stop(); app.net.online = true;
      app.net.state = { me: { id: 'scene-fixture', name: '背景验证', avatar: 0 }, room: null, queuedAt: null, serverNow: Date.now() };
      app.startupEntered = true; app.releaseStartup(); app.dismissNotice(); app.page = 'lobby';
      window.originalScenery = app.scenery;
      localStorage.setItem('db-learning-offered-v1-scene-fixture', '1');
      app.learning.open('menu'); app.render();
    });
    await page.waitForFunction(() => app.learning.ready);
    const output = '/tmp/digitalbomb-learning-scene'; fs.mkdirSync(output, { recursive: true });
    async function click(name) {
      const point = await page.evaluate(name => {
        let target; const walk = node => { if (!node.activeInHierarchy) return; if (node.name === 'LearningControl-' + name) target = node; node.children.forEach(walk); }; walk(app.root);
        if (!target) throw Error('Missing control: ' + name);
        const p = target.worldPosition, s = cc.view.getVisibleSize(), r = document.querySelector('canvas').getBoundingClientRect();
        return { x: r.x + p.x / s.width * r.width, y: r.y + r.height - p.y / s.height * r.height };
      }, name);
      await page.mouse.click(point.x, point.y); await page.waitForTimeout(100);
    }
    async function shot(name) {
      assert.equal(await page.evaluate(() => app.scenery === originalScenery && app.root.children.every(n => n.name === 'LearningBlocker' || !n.active)), true);
      await page.screenshot({ path: `${output}/${name}.png` });
    }
    await shot('hub'); await click('3 位 · 进阶'); await shot('practice');
    await click('1'); await click('2'); await click('3'); await click('提交');
    assert.equal(await page.evaluate(() => app.learning.practice.history.length), 1);
    await click('推理提示 · 1 条记录'); await shot('clues');
    await click('记录与对比'); await shot('history');
    await page.evaluate(() => { app.learning.openMode('public', 4, () => { window.chosen = true; }); app.render(); });
    await shot('online'); await click('开始匹配'); assert.equal(await page.evaluate(() => window.chosen), true);
    await page.setViewportSize({ width: 390, height: 600 }); await page.waitForTimeout(150); await shot('online-short');
    await click('返回'); assert.equal(await page.evaluate(() => !app.learning.visible && app.root.children.some(n => n.active)), true);
    assert.deepEqual(errors, []);
    console.log(`PASS: persistent scene, hidden underlying controls, practice input, clues, mode selection, short screen, return; screenshots ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
