import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const platform = process.argv[2] ?? 'web-mobile';
const config = JSON.parse(readFileSync(new URL('./build-config.json', import.meta.url), 'utf8'));
config.platform = platform;
config.outputName = platform;
if (platform === 'wechatgame') {
  const appid = process.env.WECHAT_APP_ID ?? 'wx3f231fcad8d0170f';
  config.packages = { wechatgame: { appid, orientation: 'portrait' } };
}

const configPath = resolve('temp/build-config.json');
mkdirSync('temp', { recursive: true });
writeFileSync(configPath, JSON.stringify(config, null, 2));

const editor = process.env.COCOS_CREATOR ?? '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator';
const result = spawnSync(editor, ['--project', process.cwd(), '--build', 'configPath=' + configPath], { stdio: 'inherit' });
if (result.error) {
  console.error(result.error.message);
  if (result.error.code === 'ENOENT') console.error('Set COCOS_CREATOR to the installed Cocos Creator 3.8.8 executable.');
}
// Creator also reports a successful command-line export with exit code 36.
if (result.status !== 36 && result.status !== 0) process.exit(result.status ?? 1);
if (platform === 'wechatgame') {
  await import('./brand-wechat.mjs');
  await import('./check-wechat-size.mjs');
  await import('./verify-wechat-feedback.mjs');
}
