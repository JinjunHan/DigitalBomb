const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
module.exports = async function verifyMotion(page, output) {
  const framesRoot = mkdtempSync(join(tmpdir(), 'digitalbomb-modal-motion-'));
  const checks = [], recordings = {};
  await page.evaluate(() => { localStorage.setItem('db-motion', '1'); app.closeModal(); });
  await page.waitForFunction(() => !app.modals.node.active);
  const capture = async (kind, stage) => {
    const frames = [], dir = join(framesRoot, kind + '-' + stage); mkdirSync(dir);
    for (let i = 0; i < 9; i++) {
      const state = await page.evaluate(() => ({ at: performance.now(), enter: app.modals.active?.elapsed, exit: app.modals.outgoing?.exitElapsed, guard: app.modals.guard.active, children: app.modals.node.children.filter(n => n.name.startsWith('Modal-')).length }));
      const file = join(dir, String(i).padStart(2, '0') + '.png'); await page.screenshot({ path: file });
      frames.push({ ...state, file }); await page.waitForTimeout(30);
    }
    recordings[kind + '-' + stage] = frames;
  };
  for (const kind of ['settings', 'rules', 'menu', 'live', 'result', 'lock', 'repeat', 'leave', 'close', 'resign', 'reconnect']) {
    await page.evaluate(kind => {
      app.net.online = true;
      if (kind === 'reconnect') { fixture('menu'); app.net.online = false; app.render(); }
      else fixture(kind);
    }, kind);
    assert.equal(await page.evaluate(() => app.modals.guard.active), true);
    await capture(kind, 'in');
    await page.waitForFunction(() => app.modals.interactive);
    const stable = await page.evaluate(() => {
      const elapsed = app.modals.active.elapsed; app.render();
      return { before: elapsed, after: app.modals.active.elapsed, interactive: app.modals.interactive };
    });
    assert.equal(stable.before, stable.after); assert.equal(stable.interactive, true);
    await page.evaluate(() => { app.net.online = true; app.closeModal(); });
    assert.equal(await page.evaluate(() => app.modals.guard.active), true);
    await capture(kind, 'out');
    assert.equal(await page.evaluate(() => app.modals.node.active), false);
    checks.push(kind + ': entrance, settled redraw, guarded exit and cleanup passed');
  }
  await page.evaluate(() => fixture('rules')); await page.waitForTimeout(65);
  const interrupted = await page.evaluate(() => {
    const before = app.modals.active.elapsed; app.render(); const after = app.modals.active.elapsed;
    const position = app.modals.active.node.position.clone(); app.closeModal();
    return { before, after, position, exitPosition: app.modals.outgoing.node.position, opacity: app.modals.outgoing.from.opacity };
  });
  assert.equal(interrupted.before, interrupted.after); assert.deepEqual(interrupted.position, interrupted.exitPosition);
  assert.ok(interrupted.opacity > 0 && interrupted.opacity < 1);
  checks.push('mid-entry redraw and reverse retain time/pose');
  await page.waitForFunction(() => !app.modals.node.active);
  await page.evaluate(() => { fixture('menu'); fixture('resign'); fixture('rules'); });
  assert.ok(await page.evaluate(() => app.modals.node.children.filter(n => n.name.startsWith('Modal-')).length <= 2));
  await page.waitForFunction(() => app.modals.interactive && !app.modals.outgoing);
  await page.evaluate(() => { localStorage.setItem('db-motion', '0'); app.render(); });
  assert.equal(await page.evaluate(() => app.modals.interactive), true);
  await page.evaluate(() => { app.closeModal(); fixture('settings'); });
  assert.equal(await page.evaluate(() => app.modals.interactive && !app.modals.outgoing), true);
  await page.evaluate(() => app.closeModal()); assert.equal(await page.evaluate(() => app.modals.node.active), false);
  checks.push('rapid replacement bounded to two surfaces; motion-off opens/closes immediately');
  await page.evaluate(() => { localStorage.setItem('db-motion', '1'); fixture('menu'); });
  await page.waitForFunction(() => app.modals.interactive);
  await page.evaluate(() => app.closeModal());
  await page.keyboard.press('7'); assert.equal(await page.evaluate(() => app.draft), '0123');
  await page.waitForFunction(() => !app.modals.node.active);
  checks.push('keyboard is blocked during exit');
  writeFileSync(join(framesRoot, 'recordings.json'), JSON.stringify(recordings, null, 2));
  writeFileSync(join(output, 'modal-motion-checks.json'), JSON.stringify({ checks, framesRoot, recordings }, null, 2) + '\n');
  console.log('Motion recordings: ' + framesRoot); console.log(checks.join('\n'));
};
