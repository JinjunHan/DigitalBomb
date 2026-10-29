/** Browser harness for the actual WeChat WebGL renderer and canvas handoff. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
(async () => {
  const root = path.resolve('build-templates/wechatgame');
  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<style>body{margin:0;background:#092c2a}canvas{display:block;width:100vw;height:100vh}</style><canvas id="main"></canvas><script>
        window.canvas=document.getElementById('main');canvas.width=innerWidth;canvas.height=innerHeight;
        window.wx={createCanvas:()=>document.createElement('canvas')};window.module={exports:{}};
      </script><script src="/first-screen.js"></script><script>
        window.ready=module.exports.start('false','true','false').then(()=>module.exports.setProgress(.6));
      </script>`); return;
    }
    const file = path.resolve(root, '.' + req.url);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.png') ? 'image/png' : 'image/jpeg');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    fs.mkdirSync('docs/verification/startup', { recursive: true });
    for (const [name, width, height] of [['standard', 390, 693], ['tall', 390, 844], ['short', 390, 600]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.evaluate(() => window.ready);
      await page.screenshot({ path: `docs/verification/startup/${name}-loading.png` });
      await page.evaluate(async () => {
        await module.exports.end();
        const startup = window.__digitalBombStartup;
        document.getElementById('main').replaceWith(startup.surface);
        startup.draw(.9, '正在连接牌桌…');
      });
      await page.screenshot({ path: `docs/verification/startup/${name}-connecting.png` });
      await page.evaluate(() => {
        const startup = window.__digitalBombStartup;
        startup.draw(.9, '连接未完成，点击这里重试');
        startup.surface.onclick = event => {
          const r = startup.retryRect, box = startup.surface.getBoundingClientRect();
          const x = (event.clientX - box.left) * startup.surface.width / box.width;
          const y = (event.clientY - box.top) * startup.surface.height / box.height;
          if (x >= r.x && x <= r.x+r.width && y >= r.y && y <= r.y+r.height) {
            window.retried = true; startup.draw(.9, '正在连接牌桌…');
          }
        };
      });
      await page.screenshot({ path: `docs/verification/startup/${name}-retry.png` });
      const point = await page.evaluate(() => {
        const s = window.__digitalBombStartup, r = s.retryRect;
        return { x: (r.x+r.width/2)*innerWidth/s.surface.width, y: (r.y+r.height/2)*innerHeight/s.surface.height };
      });
      await page.mouse.click(point.x, point.y);
      assert.equal(await page.evaluate(() => window.retried), true);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: native WebGL render, handoff canvas, live status and retry coordinates at three aspect ratios (browser harness; not WeChat device validation).');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
