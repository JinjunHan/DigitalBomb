import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const rootFlag = process.argv.indexOf('--root');
const root = rootFlag >= 0 ? process.argv[rootFlag + 1] : 'build/wechatgame';
if (!root) throw new Error('--root requires a build directory');
const game = JSON.parse(readFileSync(join(root, 'game.json'), 'utf8'));
const packages = game.subpackages ?? [];
const roots = packages.map(p => p.root.replace(/\/$/, '') + '/');
const sizes = new Map([['main', 0], ...packages.map(p => [p.name, 0])]);
function walk(dir, relative = '') {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, item.name);
    const name = relative + item.name;
    if (item.isDirectory()) walk(file, name + '/');
    else {
      const index = roots.findIndex(prefix => name.startsWith(prefix));
      const key = index < 0 ? 'main' : packages[index].name;
      sizes.set(key, sizes.get(key) + statSync(file).size);
    }
  }
}
walk(root);
for (const [name, size] of sizes) console.log(`[WeChat package] ${name}: ${(size / 1024).toFixed(1)} KB`);
if (sizes.get('main') > 4 * 1024 * 1024) {
  throw new Error('WeChat main package exceeds 4 MB; move resources into subpackages before previewing.');
}

// Check the full source tree: developer-tools device debugging counts main + subpackages.
// Keep 2 MiB headroom below the observed 30 MiB platform ceiling.
const total = [...sizes.values()].reduce((sum, bytes) => sum + bytes, 0);
const platformLimit = 30 * 1024 * 1024, projectBudget = 28 * 1024 * 1024;
console.log(`[WeChat package] total: ${(total / 1024).toFixed(1)} KB; headroom to 30 MiB: ${((platformLimit-total)/1024).toFixed(1)} KB`);
if (total > platformLimit) throw new Error('WeChat total source package exceeds the 30 MiB device-debug limit.');
if (total > projectBudget) throw new Error('WeChat total source package exceeds the project 28 MiB budget; retain 2 MiB for device-debug overhead and future changes.');
