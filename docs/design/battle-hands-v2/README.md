# 双手与 2 / 3 / 4 张牌适配

旧手部切图的袖口下缘被截断，固定四张牌位置也无法适配收窄的牌组。本次使用 Imagegen 基于旧左手和右手素材重建一张长袖左手，右手镜像复用。源图为 `grip-sleeve-source.png`（1536×1024，真实 alpha）；运行时为 `assets/resources/art/battle/grip-sleeve.png`，经 pngquant 40–65 质量压缩，不重新绘制轮廓。旧的八张手/拇指素材及其 `.meta` 移至 `legacy/`，保留来源且不占微信资源包。

## 素材与图层

- 背景、卡牌、卡牌数字和键盘保持既有素材。
- 左右抓握端跟随最外侧卡牌，准备页选中边牌抬起时同步上移。
- 整个手部位于外侧牌角前方，不再拼接旧拇指，避免新旧皮肤与袖口接缝。
- 手部轮廓自然闭合，袖子只在画布左边截断。九宫格保留左侧 40 px、右侧 700 px（手掌及袖口），仅拉长针织中段。
- 根据实际屏宽与 BattleRoom 缩放，把袖子切口放到可见区域外再留 40 设计单位余量。两边镜像，手掌不横向压缩。
- 参考抓握点为源图 `(1470, 400)`，准备页缩放 .34、对局页 .24。当前左右手不单独生成，避免肤色、袖口和光照出现额外差异。

## Imagegen 提示词

初稿参考：旧 `play-hand-left.png`、`hand-right.png`，现在保存在 `legacy/`。

> Create one production-ready transparent PNG sprite of a LEFT hand with a LONG cream knitted sweater sleeve, for the same warm painterly realistic card game as references. Landscape canvas 1536x1024. ONLY ONE LEFT hand, no cards, no background, no text, no shadows on background, no plants. Hand points RIGHT. Sleeve/forearm enters horizontally from far LEFT canvas edge at mid-height, long uninterrupted sleeve occupies left 65% of canvas, natural continuous rounded upper and lower sleeve silhouettes wholly inside canvas. Sleeve is cut ONLY by LEFT edge, NEVER by bottom or top edge. Wrist near x=1080 y=540; thumb stretches diagonally toward upper-right fingertip near x=1430 y=360, rounded fingertip. Fingers form subtle pinch behind an imaginary vertical card, curled fingertips near x=1300 y=250; grip opens to the right. All hand fully visible, skin anatomy correct. Match reference warm peach skin, beige knit cuff texture, soft golden light. Hand shape should read as holding lower left corner of cards placed to its right. Keep generous transparent space above and below whole sleeve, no straight horizontal cut edge. Entire sleeve must span from x=0 to wrist, allowing sprite left end to be kept offscreen when grip moves. Do not add right hand or duplicate parts. Preserve true alpha outside silhouette. This is a replacement game asset, not a scene.

透明通道修正（以初稿为参考）：

> Edit ONLY transparency of this exact hand and sleeve image. Remove ALL the broad blurred brown glow, drop shadow, aura and background pixels surrounding the hand and sleeve. Alpha must be ZERO everywhere outside actual skin/knit silhouette, with only a 1-2 pixel antialias edge. Preserve exact hand, sleeve, pose, dimensions, placement, colors and interior opaque pixels. No background, no shadow, no halo, no glow. Transparent game sprite cutout. Sleeve still cut at LEFT edge only. Output same 1536x1024 canvas.

## 验证

辅助 Web 构建与预览后运行 `scripts/verify-battle-hands.cjs`（`PLAYWRIGHT_MODULE` 可指定模块路径）。覆盖准备/对局两页 × 2/3/4 位 × 390×844/390×600；验证袖口边界在屏幕外、点击选牌并修改数字、点击翻看底牌及页面无异常。实际截图输出 `/tmp/digitalbomb-hands/`。微信本地导出另执行 `npm run build:wechat`，不代表真机验证或正式发布。
