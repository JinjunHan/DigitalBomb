/** Run against npm run preview + npm run server after build:web.
 * PLAYWRIGHT_MODULE may point at an existing Playwright installation.
 * Fixtures are injected into the browser only; no debug routes ship in the game.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [], checks = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8080');
    await page.waitForFunction(() => window.cc?.director?.getScene()?.getChildByName('Canvas')?.components.some(c => c.modalArtReady && c.net.state));
    await page.evaluate(() => {
      window.app = cc.director.getScene().getChildByName('Canvas').components.find(c => c.modalArt);
      window.baseState = JSON.parse(JSON.stringify(app.net.state));
      app.net.onState = () => {}; app.net.onStatus = () => {}; app.net.stop();
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      app.net.online = true;
      app.act = async (action, payload = {}) => { window.lastCommand = { action, payload }; };
      window.fixture = kind => {
        const me = baseState.me;
        const phase = ['lock', 'leave'].includes(kind) ? 'preparing' : kind === 'close' ? 'waiting' : kind === 'result' ? 'finished' : 'playing';
        app.net.state = { ...baseState, room: {
          id: 'modal-fixture', mode: 'friend', code: '0123', phase,
          players: [{ ...me, ready: false, online: true }, { id: 'peer', name: '用于验证长昵称的对手名字', avatar: 1, ready: true, online: true }],
          version: 1, round: 20, turn: 40, current: me.id, first: me.id,
          deadline: Date.now() + 30000, startAt: Date.now() - 1000,
          history: Array.from({ length: 40 }, (_, i) => ({ playerId: i % 2 ? 'peer' : me.id, turn: i,
            digits: i === 10 ? null : i === 0 ? '0123' : String(i * 173 % 10000).padStart(4, '0'), hits: i === 10 ? null : i % 4 })), rematch: []
        } };
        app.lastRoom = 'modal-fixture'; app.lastPhase = phase; app.lastTurn = 40;
        app.draft = '0123'; app.recordsOpponent = false; app.confirmation = undefined;
        window.lastCommand = null;
        app.overlay = ({ live: 'guessRecords', result: 'resultRecords', menu: 'gameMenu' })[kind] ?? kind;
        if (kind === 'lock') app.lockSecret();
        else if (kind === 'repeat') app.submitGuess();
        else if (['leave', 'close', 'resign'].includes(kind)) app.ask(kind, () => app.act(kind === 'resign' ? 'resign' : 'leave'));
        else app.render();
      };
    });
    const output = resolve('docs/verification'); mkdirSync(output, { recursive: true });
    const shot = name => page.screenshot({ path: resolve(output, `modals-${name}.png`) });
    const fixture = kind => page.evaluate(kind => window.fixture(kind), kind);
    const click = async (name, index = 0) => {
      const point = await page.evaluate(({ name, index }) => {
        const matches = [];
        function visit(n) { if (n.name === name) matches.push(n); n.children.forEach(visit); } visit(app.root);
        const n = matches[index]; if (!n) throw Error('Missing control ' + name);
        const r = n.components.find(c => c.getBoundingBoxToWorld).getBoundingBoxToWorld();
        return { x: (r.x + r.width / 2) * innerWidth / 750, y: innerHeight - (r.y + r.height / 2) * innerHeight / app.screenHeight };
      }, { name, index });
      await page.mouse.click(point.x, point.y); await page.waitForTimeout(80);
    };
    for (const kind of ['settings', 'rules', 'menu', 'live', 'result', 'lock', 'repeat', 'leave', 'close', 'resign']) { await fixture(kind); await shot(kind); }
    for (const kind of ['lock', 'repeat', 'leave', 'close', 'resign']) {
      await fixture(kind); await click(`ModalArt-${kind}-cancel`);
      assert.equal(await page.evaluate(() => app.overlay), '');
      assert.equal(await page.evaluate(() => window.lastCommand), null);
      await fixture(kind);
      if (kind === 'lock' || kind === 'repeat') await page.evaluate(() => { app.draft = '9999'; });
      await click(`ModalArt-${kind}-confirm`);
      const sent = await page.evaluate(() => window.lastCommand);
      assert.equal(sent.action, ({ repeat: 'guess', close: 'leave' })[kind] || kind);
      if (kind === 'lock' || kind === 'repeat') assert.equal(sent.payload.digits, '0123');
      checks.push(`${kind}: cancel, confirm and immutable payload passed`);
    }
    await fixture('settings');
    const before = await page.evaluate(() => localStorage.getItem('db-music') ?? '1');
    await click('ModalArt-toggle-' + (before === '1' ? 'on' : 'off'));
    assert.notEqual(await page.evaluate(() => localStorage.getItem('db-music')), before);
    await click('ModalArt-settings-done'); assert.equal(await page.evaluate(() => app.overlay), '');
    checks.push('music toggle persisted; settings done closed');
    await fixture('rules'); await click('ModalArt-rules-done'); assert.equal(await page.evaluate(() => app.overlay), '');
    await fixture('menu'); await click('ModalArt-menu-resign'); assert.equal(await page.evaluate(() => app.confirmation.kind), 'resign');
    await click('ModalArt-resign-back'); assert.equal(await page.evaluate(() => app.overlay), '');
    await fixture('live');
    // Real pointer drag; ScrollView retains the resulting offset on redraw.
    const point = await page.evaluate(() => {
      const n = app.root.getChildByName('Modal-live').getChildByName('ModalRecordsViewport');
      return { x: n.worldPosition.x * innerWidth / 750, y: innerHeight - n.worldPosition.y * innerHeight / app.screenHeight };
    });
    await page.mouse.move(point.x, point.y - 70); await page.mouse.down(); await page.mouse.move(point.x, point.y + 90, { steps: 12 }); await page.mouse.up();
    await page.waitForTimeout(800);
    const offset = await page.evaluate(() => app.recordScrolls.find(s => s.key.startsWith('modal-')).view.getScrollOffset().y);
    assert.ok(offset < 876 - 30);
    await page.evaluate(() => app.render());
    assert.ok(Math.abs(await page.evaluate(() => app.recordScrolls.find(s => s.key.startsWith('modal-')).view.getScrollOffset().y) - offset) < 1);
    await click('ModalArt-live-latest'); await page.waitForTimeout(350);
    assert.ok(await page.evaluate(() => { const v = app.recordScrolls.find(s => s.key.startsWith('modal-')).view; return Math.abs(v.getScrollOffset().y - v.getMaxScrollOffset().y) < 1; }));
    await click('ModalArt-tab-off'); assert.equal(await page.evaluate(() => app.recordsOpponent), true);
    checks.push('pointer scroll, retained offset, latest and opponent tab passed');
    await click('ModalArt-live-done'); assert.equal(await page.evaluate(() => app.overlay), '');
    await fixture('repeat'); await page.evaluate(() => { app.net.state.room.turn++; app.stateChanged(); });
    assert.equal(await page.evaluate(() => app.overlay), ''); checks.push('stale turn dismissed');
    await page.setViewportSize({ width: 375, height: 667 }); await fixture('live'); await shot('short-records');
    await page.evaluate(() => { app.net.state.room.history = []; app.render(); }); await shot('short-empty');
    await fixture('settings'); await shot('short-settings');
    await fixture('rules'); await shot('short-rules');
    await page.setViewportSize({ width: 390, height: 844 }); await fixture('menu');
    await page.evaluate(() => { app.net.online = false; app.render(); }); await shot('reconnect');
    await click('ModalArt-reconnect-retry'); await page.waitForFunction(() => app.net.online);
    assert.equal(await page.evaluate(() => app.reconnecting), false); checks.push('local server reauthenticated after retry');
    assert.deepEqual(errors, []);
    writeFileSync(resolve(output, 'modals-checks.json'), JSON.stringify({ checks, errors, viewports: ['390x844', '375x667'], fixture: '40 records, null timeout, leading-zero secret, long opponent name', scope: 'Web visual fixtures and local reconnect; not WeChat device validation' }, null, 2) + '\n');
    console.log(checks.join('\n'));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
