# 启动页设计稿 v1

使用内置 imagegen 生成。`startup-v1.png` 保留原始设计稿；当前微信运行时已接入清理后的主画面，进度填充和状态文字独立绘制。

## 实现与素材

- `startup-runtime-source.png`：imagegen 基于原稿局部重建，清除进度填充及状态文字，保留边框和其他内容；不是无损原图切图。
- `layers.json`：素材分层、原图坐标、动态区域及输出路径。
- `build-templates/wechatgame/startup/background.jpg`：主包内压缩背景，约 306 KB。
- `build-templates/wechatgame/startup/progress.png`：从原稿金色进度区裁切的纹理，约 8 KB。
- 原生启动层按引擎加载阶段更新进度；90% 表示等待连接，非网络传输百分比。
- 首次收到服务器状态后进入首页（有恢复对局/邀请时遵循原有路由），销毁启动纹理。失败/15 秒等待后在原画面显示可点击重试文字。
- 背景按比例完整显示，长短屏余量用深绿色填充。动态状态和重试热区使用同一源坐标。
- 素材位于微信构建模板，不由 Cocos 资源库导入，因此无 `.meta`；导出脚本复制到主包，在引擎和分包加载前可用。

## 验证

`npm test`、两项类型检查、`npm run build:wechat`。`scripts/verify-startup.cjs` 在浏览器运行原生 WebGL 渲染器，验证三种比例及交接画面。`scripts/verify-startup-cocos.cjs` 在 Web 构建注入原生交接数据，验证真实 Cocos 节点、首次登录失败、点击重试、成功进入首页及纹理释放。截图保存在 `docs/verification/startup/`。这些验证不等同于微信开发者工具真机测试。

## 背景清理提示词

Edit this exact startup screen for runtime use. Preserve composition, dimensions/aspect ratio, all illustration details, Chinese title and subtitle and bottom footer exactly. Make only two localized changes: 1. remove the GOLD FILLED PORTION inside the loading bar near y=1315, leaving the entire ornate gold FRAME unchanged and its whole interior empty dark teal like its current right half. 2. Remove the small status text 正在准备牌桌… underneath the bar near y=1382, seamlessly restoring the teal felt behind it. Keep footer 观察 · 推理 · 默契 unchanged. Do not add anything or move any element. Output full portrait background.

## 生成提示词

Use case: ui-mockup. Create a polished portrait 9:16 full-screen startup page image for an existing Chinese WeChat casual deduction card game titled “猜数字暗号”. Flat screen artwork only, no phone frame. Elegant tactile vintage illustrated card-table aesthetic: deep petrol teal felt background with subtle vignette, warm ivory paper, antique brass details and restrained burgundy accents. Centerpiece is four beautifully drawn ivory number cards showing 0 1 2 3, overlapping gently above a small antique four-digit combination mechanism; suggests deduction and secret codes, not gambling. Strong readable Chinese title “猜数字暗号” in large custom cream display lettering in upper middle, subtitle exactly “四位数字，藏着你的暗号”. Balanced spacious composition, finely crafted print textures, soft warm light, playful yet premium hand-painted 2D game art. Bottom quarter features a slim elegant brass-framed loading bar partially filled and small text exactly “正在准备牌桌…”. Footer exactly “观察 · 推理 · 默契”. Keep top 12% quiet for WeChat safe area, main artwork inside middle 70%, bottom 8% quiet. No buttons, no navigation, no extra words, no watermarks, no explosive bomb imagery. Deliver one finished high-resolution startup screen.
