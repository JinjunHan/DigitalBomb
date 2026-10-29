/** Requires build:web and local preview :8080; starts an isolated test server. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { resolve, join } = require('node:path');
const { tmpdir } = require('node:os');
(async () => {
  const folder = fs.mkdtempSync(join(tmpdir(), 'digital-bomb-startup-'));
  const server = spawn(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('server/index.ts')], { cwd: folder, env: { ...process.env, PORT: '18789', HOST: '127.0.0.1', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(Error('test server timeout')), 5000);
    server.stdout.on('data', chunk => { if (String(chunk).includes('local service:')) { clearTimeout(timer); done(); } });
    server.on('exit', code => { clearTimeout(timer); reject(Error('server exit ' + code)); });
  });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const source = fs.readFileSync('build-templates/wechatgame/first-screen.js', 'utf8');
    const data = file => 'data:image/' + (file.endsWith('.jpg') ? 'jpeg' : 'png') + ';base64,' + fs.readFileSync(file).toString('base64');
    await page.addInitScript(({ source, background, fill }) => {
      // Simulate only the native renderer handoff; Platform remains in Web mode.
      const factory = new Function('wx', 'canvas', 'module', source + '\nreturn createScreen;');
      const create = factory({ createCanvas: () => document.createElement('canvas') }, { width: innerWidth, height: innerHeight }, { exports: {} });
      const bg = new Image(), fg = new Image(); bg.src = background; fg.src = fill;
      window.__digitalBombStartup = create(bg, fg);
      window.startupRetryRect = window.__digitalBombStartup.retryRect;
      window.startupSurfaceHeight = window.__digitalBombStartup.surface.height;
    }, { source, background: data('build-templates/wechatgame/startup/background.jpg'), fill: data('build-templates/wechatgame/startup/progress.png') });
    let failFirst;
    const gate = new Promise(resolve => { failFirst = resolve; });
    let requests = 0;
    await page.route('**/api/login', async route => {
      if (++requests === 1) { await gate; await route.fulfill({ status: 503, body: '{}' }); }
      else await route.continue();
    });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:8080/?api=http://127.0.0.1:18789');
    await page.waitForFunction(() => window.cc?.director.getScene()?.getChildByName('Canvas')?.components.some(c => c.startupFrame && c.root?.getChildByName('Startup')));
    await page.waitForTimeout(500);
    fs.mkdirSync('docs/verification/startup', { recursive: true });
    await page.screenshot({ path: 'docs/verification/startup/cocos-connecting.png' });
    failFirst();
    await page.waitForFunction(() => cc.director.getScene().getChildByName('Canvas').components.some(c => c.root?.getChildByName('StartupRetry')));
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'docs/verification/startup/cocos-retry.png' });
    const point = await page.evaluate(() => ({ x: (startupRetryRect.x + startupRetryRect.width / 2) * innerWidth / 750, y: (startupRetryRect.y + startupRetryRect.height / 2) * innerHeight / startupSurfaceHeight }));
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => cc.director.getScene().getChildByName('Canvas').components.some(c => c.net?.state && !c.startupFrame));
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'docs/verification/startup/cocos-lobby.png' });
    assert.equal(requests, 2); assert.deepEqual(errors, []);
    console.log('PASS: Cocos canvas texture handoff, failed login, real retry click, successful login, startup resource release and lobby. Native handoff simulated in Web; no device claim.');
  } finally {
    await browser.close(); server.kill('SIGTERM');
    await new Promise(done => { if (server.exitCode !== null) done(); else server.on('exit', done); });
    fs.rmSync(folder, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
