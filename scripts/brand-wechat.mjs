import { copyFileSync, cpSync, rmSync } from 'node:fs';

// These lightweight assets live in the main package so they are available
// before Cocos or its resources subpackage has loaded.
copyFileSync('build-templates/wechatgame/first-screen.js', 'build/wechatgame/first-screen.js');
cpSync('build-templates/wechatgame/startup', 'build/wechatgame/startup', { recursive: true });
copyFileSync('docs/design/icons/144x144/couple-refined-cards-v1.png', 'build/wechatgame/logo.png');
for (const file of ['share-invite.jpg', 'share-guess.jpg', 'share-rematch.jpg']) {
  // Remove built-in share images left by incremental builds of earlier versions.
  rmSync('build/wechatgame/' + file, { force: true });
}
console.log('[WeChat branding] Illustrated startup with live progress installed.');
