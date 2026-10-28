// Validate actual exports, since Cocos may return success after importer failure.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const root = 'build/wechatgame';
const resources = read(root + '/subpackages/resources/config.json');
const paths = new Set(Object.values(resources.paths).map(v => v[0]));
const assets = read('docs/design/feedback-v1/implementation-slices.json').assets;
for (const { name } of assets) assert.ok(paths.has('art/feedback/' + name + '/texture'), 'Missing exported texture: ' + name);
assert.ok(read(root + '/assets/main/config.json').scenes['db://assets/scenes/Main.scene'] !== undefined, 'Missing main scene');
let scriptFound = false;
function visit(path) {
  for (const name of readdirSync(path)) {
    const file = path + '/' + name;
    if (statSync(file).isDirectory()) visit(file);
    else if (file.endsWith('.js') && readFileSync(file, 'utf8').includes('opponent-')) scriptFound = true;
  }
}
visit(root + '/assets/main');
assert.ok(scriptFound, 'Missing feedback implementation in main bundle');
console.log(`PASS: Main.scene, feedback runtime, and ${assets.length} exported feedback textures.`);
