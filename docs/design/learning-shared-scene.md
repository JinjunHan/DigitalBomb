# 新增页面沿用共用场景

在线匹配/好友房位数选择、新手练习室、教学、练习、推理笔记和确认页统一沿用 `SceneBackdrop` 的持久 2.5D 场景。原先 `LearningPanel` 同时显示铺屏的 `bg-mode` 与随面板缩放的 `bg-*`，两套房间构图和缩放造成上下接缝。

运行时分层：

1. 原有 `SceneBackdrop`，不因打开学习页面重建。
2. 覆盖全屏的轻微半透明遮罩和输入阻挡；底层页面控件隐藏，关闭后由正常重绘恢复。
3. `art/profile/paper.png` 的透明纸张美术，九宫格保留边框；无新生成或近似绘制素材。
4. `art/learning-v2/` 现有透明标题、卡牌、按钮及示例面板，叠加动态文字。原本烘焙在背景中的教学示例、练习说明和笔记标题由这些既有素材补齐。

四张 `learning-v2/bg-*.jpg` 不再被该页面加载或渲染，原资源保留供设计追溯。未改游戏规则和网络协议。

验证：`npm run typecheck:client`、`npm test`、`npm run typecheck`、`npm run build:wechat`。辅助 Web 构建后运行 `scripts/verify-learning-scene.cjs`（通过 `PLAYWRIGHT_MODULE` 指定 Playwright 模块），检查共用场景身份、底层控件隐藏、练习输入/提交、推理记录、模式选择、短屏和返回；截图输出 `/tmp/digitalbomb-learning-scene/`。Web 检查不等于微信真机验证。
