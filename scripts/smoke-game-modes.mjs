// Local Cocos build regression: mode selection, persisted preferences and complete human games.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const output = process.env.MODE_SMOKE_OUTPUT ?? mkdtempSync(join(tmpdir(), 'digitalbomb-modes-'));
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const peers = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  async function boot() {
    await page.goto('http://127.0.0.1:8080');
    await page.waitForFunction(() => {
      if (!window.cc?.director.getScene()) return false;
      const walk = node => { for (const c of node.components) if (c.learning) window.app = c; node.children.forEach(walk); };
      walk(cc.director.getScene()); return window.app?.startupEntered && app.battleArtReady && app.modalArtReady && app.joinArtReady;
    });
    await page.waitForFunction(() => !app.learning.visible || app.learning.ready);
    await page.waitForTimeout(500);
  }
  async function click(value, byName = false) {
    const point = await page.evaluate(({ value, byName }) => {
      let target;
      const walk = node => { if (!node.activeInHierarchy) return; const label = node.getComponent(cc.Label); if (byName ? node.name === value : (label?.string === value || node.name === 'LearningControl-' + value)) target = node; node.children.forEach(walk); };
      walk(cc.director.getScene()); if (!target) throw Error('Missing control: ' + value);
      const p = target.worldPosition, size = cc.view.getVisibleSize(), rect = document.querySelector('canvas').getBoundingClientRect();
      return { x: rect.x + p.x / size.width * rect.width, y: rect.y + rect.height - p.y / size.height * rect.height };
    }, { value, byName });
    await page.mouse.click(point.x, point.y); await page.waitForTimeout(220);
  }
  const until = async fn => { const end = Date.now() + 9000; while (!await fn()) { if (Date.now() > end) throw Error('State timeout'); await new Promise(r => setTimeout(r, 40)); } };
  const shot = name => page.screenshot({ path: join(output, name + '.png') });
  const selected = () => page.evaluate(() => app.learning.selectedMode);
  await boot(); await click('先去大厅');
  await click('Lobby-match-full', true); assert.equal(await selected(), 4); await shot('default-four');
  await click('2 位 · 轻松局 · 100 种组合'); await click('开始匹配');
  assert.equal(await page.evaluate(() => app.net.state.queuedDigitCount), 2);
  await click('Matching-cancel', true); await boot();
  await click('Lobby-match-full', true); assert.equal(await selected(), 2);
  await click('3 位 · 标准局 · 1000 种组合'); await click('返回');
  await click('Lobby-match-full', true); assert.equal(await selected(), 2); await click('返回');
  await click('Lobby-friend-full', true); await click('Join-create', true); assert.equal(await selected(), 4);
  await click('返回');
  for (const size of [2, 3, 4]) {
    await click('Join-create', true);
    if (await selected() !== size) await click(`${size} 位 · ${size === 2 ? '轻松局' : size === 3 ? '标准局' : '挑战局'} · ${10 ** size} 种组合`);
    await click('创建房间');
    const code = await page.evaluate(() => app.net.state.room.code);
    assert.match(code, /^\d{4}$/); assert.equal(await page.evaluate(() => app.net.state.room.digitCount), size);
    await shot(`waiting-${size}`);
    const auth = await (await fetch('http://127.0.0.1:8787/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    const peer = new WebSocket('ws://127.0.0.1:8787/ws'); peers.push(peer); let state;
    peer.on('message', raw => { const m = JSON.parse(String(raw)); if (m.type === 'state') state = m.state; });
    await new Promise(resolve => peer.on('open', resolve)); peer.send(JSON.stringify({ action: 'auth', token: auth.token }));
    await until(() => state);
    const send = (action, payload = {}) => peer.send(JSON.stringify({ id: crypto.randomUUID(), action, payload: { roomId: state.room?.id, ...payload } }));
    const heartbeat = setInterval(() => peer.send(JSON.stringify({ action: 'heartbeat' })), 4000);
    try {
      send('join', { code, digitCount: 4 });
      await until(() => page.evaluate(() => app.net.state.room.phase === 'preparing'));
      await shot(`preparing-${size}`);
      await page.keyboard.type('0'.repeat(size)); await page.keyboard.press('Enter'); await page.waitForTimeout(650);
      await shot(`lock-${size}`);
      await click(size === 4 ? 'ModalArt-lock-confirm' : '确认', size === 4);
      await until(() => page.evaluate(() => !!app.net.state.room.ownSecret));
      send('lock', { digits: '1'.repeat(size) });
      await until(() => state.room.phase === 'playing');
      await page.waitForTimeout(Math.max(0, state.room.startAt - Date.now() + 150));
      if (state.room.current === auth.me.id) { send('guess', { digits: '8'.repeat(size), turn: state.room.turn }); }
      await until(() => page.evaluate(() => app.net.state.room.current === app.net.state.me.id));
      await page.keyboard.type('9'.repeat(size)); await page.keyboard.press('Enter');
      await until(() => state.room.current === auth.me.id);
      send('guess', { digits: '8'.repeat(size), turn: state.room.turn });
      await until(() => page.evaluate(() => app.net.state.room.current === app.net.state.me.id));
      await page.waitForTimeout(1800); await shot(`playing-${size}`);
      await page.keyboard.type('9'.repeat(size)); await page.keyboard.press('Enter'); await page.waitForTimeout(650);
      assert.equal(await page.evaluate(() => app.confirmation?.kind), 'repeat');
      await click(size === 4 ? 'ModalArt-repeat-cancel' : '取消', size === 4);
      await page.waitForTimeout(400); await click('推理提示 / 排除');
      assert.equal(await page.evaluate(() => app.learning.cache.count), 9 ** size);
      assert.equal(await page.evaluate(() => app.learning.cache.positions.length), size);
      await shot(`clues-${size}`); await click('返回');
      // Replace the existing repeated draft through the same real keyboard input path.
      for (let i = 0; i < size; i++) await page.keyboard.press('Backspace');
      await page.keyboard.type('1'.repeat(size)); await page.keyboard.press('Enter');
      await until(() => state.room.phase === 'reply' || state.room.phase === 'finished');
      if (state.room.phase === 'reply') {
        assert.equal(state.room.revealed, undefined); send('guess', { digits: '0'.repeat(size), turn: state.room.turn });
      }
      await until(() => page.evaluate(() => app.net.state.room.phase === 'finished'));
      await page.waitForTimeout(1900); await shot(`result-${size}`);
      await click('确认 · 返回房间');
      await until(() => page.evaluate(() => app.net.state.room.phase === 'waiting'));
      assert.equal(await page.evaluate(() => app.net.state.room.digitCount), size);
      await page.evaluate(() => app.net.command('leave', { roomId: app.net.state.room.id })); await page.waitForTimeout(650);
      await click('Join-create', true); assert.equal(await selected(), size); await click('返回');
    } finally { clearInterval(heartbeat); peer.close(); }
  }
  await click('Join-back', true); await click('Lobby-match-full', true); assert.equal(await selected(), 2);
  await page.setViewportSize({ width: 375, height: 667 }); await page.waitForTimeout(300); await shot('short-screen-mode');
  assert.deepEqual(errors, []);
  console.log('PASS default 4, persisted public/friend preferences, cancel preserves choice, 2/3/4-digit human games, confirmations, clues, results, return-to-room and four-digit room codes');
  console.log('Screenshots: ' + output);
} finally { peers.forEach(peer => peer.terminate()); await browser.close(); }
