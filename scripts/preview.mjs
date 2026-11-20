import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('build/web-mobile');
const types = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.wasm':'application/wasm', '.woff':'font/woff' };
createServer(async (req, res) => {
 try {
  const url = new URL(req.url, 'http://localhost'); const file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  await stat(file); res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file));
 } catch { res.writeHead(404); res.end('Build the Cocos web-mobile target first: npm run build:web'); }
}).listen(8080, '127.0.0.1', () => console.log('Cocos game preview: http://127.0.0.1:8080'));
