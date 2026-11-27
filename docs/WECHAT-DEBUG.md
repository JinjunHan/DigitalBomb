# 微信真机调试

在微信开发者工具导入 `build/wechatgame`，AppID 为 `wx3f231fcad8d0170f`，不使用云服务。

## 2026-10-27 主包超限修复

`assets/resources.meta` 使用 `wechat-resources` Bundle 配置；配置保存在 `settings/v2/packages/builder.json`，仅微信小游戏使用 subpackage，Web 和原生仍使用 merge_dep。

执行 `npm run build:wechat` 后，Cocos 自动生成 `game.json` 的 resources 分包配置，运行时 settings 将 resources 列入分包及启动预加载列表。没有修改图片质量或删除音乐音效。

此次构建按文件字节统计：主包 1868.9 KB，resources 分包 5196.9 KB。构建脚本会自动检查主包 4 MB 限制，也可以执行 `node scripts/check-wechat-size.mjs`。最终上传体积以微信开发者工具为准。

重新构建后，在微信开发者工具点击编译，再执行预览或真机调试。如果仍显示旧的 7043 KB 主包错误，清除缓存后重新编译，并确认导入目录是当前项目的 `build/wechatgame`。

已检查分包入口、资源配置、启动预加载和主包内无重复资源；客户端 TypeScript 检查通过。手机扫码运行仍需由已登录的微信开发者工具完成验证。

## 全屏与安全区域

使用 FIXED_WIDTH，背景与弹窗遮罩覆盖实际可见高度。界面纵向位置按胶囊下方与底部安全区域之间的空间排布，按钮、数字牌和文字保持尺寸比例；高面板随布局高度调整。监听 canvas-resize 更新布局。

已在开发者工具 iPhone 12/13 Pro 模拟器验证大厅背景无上下黑边，并保存 `docs/verification/wechat-fullscreen-lobby.png`。客户端类型检查和微信构建通过。此次模拟器交互验证出现工具自身 `worker path empty` 报错，手机真机触摸及更多机型仍待验证。
