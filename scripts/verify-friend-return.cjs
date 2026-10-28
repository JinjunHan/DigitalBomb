const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [], checks = [], frames = [], dir = mkdtempSync(join(tmpdir(), 'friend-return-'));
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8080');
    await page.waitForFunction(() => window.cc?.director?.getScene()?.getChildByName('Canvas')?.components.some(c => c.modalArtReady && c.friendArtReady && c.joinArtReady && c.net.online));
    await page.evaluate(() => { window.app = cc.director.getScene().getChildByName('Canvas').components.find(c => c.friendReturn); localStorage.setItem('db-motion', '1'); });
    const click = async name => {
      const p = await page.evaluate(name => {
        let match;
        const walk = n => { if (n.name === name) match = n; n.children.forEach(walk); }; walk(app.node);
        if (!match) throw Error('Missing ' + name);
        const r = match.components.find(c => c.getBoundingBoxToWorld).getBoundingBoxToWorld();
        return { x: (r.x + r.width / 2) * innerWidth / 750, y: innerHeight - (r.y + r.height / 2) * innerHeight / app.screenHeight };
      }, name); await page.mouse.click(p.x, p.y);
    };
    const create = async () => {
      await click('Join-create');
      await page.waitForFunction(() => app.net.state.room?.phase === 'waiting' && !app.busy);
    };
    const ask = async () => { await click('Friend-back'); await page.waitForFunction(() => app.modals.interactive); };
    await page.waitForFunction(() => app.root.getChildByName('Lobby-friend-full'));
    await click('Lobby-friend-full'); await create();
    const roomId = await page.evaluate(() => app.net.state.room.id);
    await ask(); await click('ModalArt-close-cancel'); await page.waitForFunction(() => !app.modals.node.active);
    assert.equal(await page.evaluate(() => app.net.state.room.id), roomId);
    assert.equal(await page.evaluate(() => app.friendReturn.active), false); checks.push('cancel keeps the actual friend room');
    await ask();
    await page.evaluate(() => {
      window.originalCommand = app.net.command.bind(app.net);
      app.net.command = (action, payload) => action === 'leave' ? Promise.reject(Error('测试：关闭失败')) : originalCommand(action, payload);
    });
    await click('ModalArt-close-confirm'); await page.waitForFunction(() => !app.busy && !app.modals.node.active);
    assert.equal(await page.evaluate(() => app.net.state.room.id), roomId);
    assert.equal(await page.evaluate(() => app.friendReturn.active), false); checks.push('rejected close does not navigate or animate');
    await page.evaluate(() => { app.net.command = originalCommand; app.notice = ''; app.render(); });
    await ask(); await click('ModalArt-close-confirm');
    await page.waitForFunction(() => app.friendReturn.active);
    const positionBefore = await page.evaluate(() => {
      const before = app.friendReturn.elapsed; app.render(); return [before, app.friendReturn.elapsed];
    }); assert.equal(positionBefore[0], positionBefore[1]);
    await page.keyboard.press('7'); assert.equal(await page.evaluate(() => app.code), '');
    await click('Join-create'); assert.equal(await page.evaluate(() => app.net.state.room), null);
    for (let i = 0; i < 12; i++) {
      const state = await page.evaluate(() => ({ at: performance.now(), elapsed: app.friendReturn.elapsed, active: app.friendReturn.active, page: app.page, room: app.net.state.room?.id ?? null, scene: app.scenery.view }));
      const file = join(dir, String(i).padStart(2, '0') + '.png'); await page.screenshot({ path: file }); frames.push({ ...state, file }); await page.waitForTimeout(25);
    }
    await page.waitForFunction(() => !app.friendReturn.active);
    assert.ok(frames.every(f => f.page === 'join' && f.room === null && f.scene === 'friend'));
    assert.equal(await page.evaluate(() => app.friendReturn.node.children.some(n => n.name === 'FriendRoom')), false);
    await page.keyboard.press('1'); assert.equal(await page.evaluate(() => app.code), '1');
    checks.push('actual server close returns to join without lobby/background flash; redraw and input guards passed');
    await page.screenshot({ path: resolve('docs/verification/friend-return-settled.png') });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForFunction(() => Math.abs(app.screenHeight - 667 * 750 / 375) < 1); await page.waitForTimeout(150);
    await create();
    await page.evaluate(() => { localStorage.setItem('db-motion', '0'); });
    await ask(); await click('ModalArt-close-confirm'); await page.waitForFunction(() => !app.net.state.room && !app.busy);
    assert.equal(await page.evaluate(() => app.friendReturn.active), false); assert.equal(await page.evaluate(() => app.page), 'join');
    checks.push('motion-off returns immediately on a short screen');
    await page.screenshot({ path: resolve('docs/verification/friend-return-short.png') });
    assert.deepEqual(errors, []);
    writeFileSync(resolve('docs/verification/friend-return-checks.json'), JSON.stringify({ checks, errors, frames }, null, 2) + '\n');
    console.log(checks.join('\n')); console.log('Frames: ' + dir);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
