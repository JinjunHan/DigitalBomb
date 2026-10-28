# 好友房素材清单

来源：`docs/design/03-friend-room.png`，941×1672。坐标为左上原点的 `[left, top, right, bottom]`，右下不包含。输出在 `assets/resources/art/friend/`；脚本 `scripts/slice-friend-room.py` 可复现具体矩形及蒙版。

|顺序|素材|用途 / 固定文字|动态区域与处理|
|---|---|---|---|
|0|已有 scene 图层|持续共用书房和桌面|保持现有视差|
|1|back / heading|完整返回按钮 / 好友房标题|独立返回点击|
|2|waiting|虚线座位、人物剪影和等待好友牌|等待态独立节点|
|3|count|人数木牌与人物图标|移除示例人数，显示实际人数|
|4|paper|纸张、房间口令标题、数字框、说明、时钟框|数字及时间移除；复制按钮移到独立层|
|5|copy|完整复制口令按钮|独立点击与按压|
|6|已有 profile avatar / portrait-frame|真实头像与透明框|按玩家 avatar 选择|
|7|nameplate / seated|昵称底板 / 已入座状态|移除示例昵称，长昵称缩小|
|8|close|完整关闭房间按钮|独立点击与确认|

轮廓蒙版以四倍分辨率绘制后抗锯齿缩小，保留原 RGB；不做颜色键删除。纸张、人数、昵称遮挡区用同图干净纹理采样补片，纸张左下被植物遮住的边缘用右边缘镜像修补。这些是确定性纹理重建，不是无损原图切图。无生成模型和生成提示词。纸张上的数字框、装饰和固定说明保留；不将示例口令、时间、昵称或头像写入运行资源。

## 接入与验证

`GameApp.ts` 的 `friendWaiting` 使用独立整组变换，把设计稿像素映射到安全区；控件、文字与点击范围一起等比缩放。全部九张好友房资源加载完成才切换组合，失败继续使用既有等待页。背景仍由 `SceneBackdrop` 管理，计时器只改 Label，不重启背景。真实头像复用 profile 素材，额外头像编号保留文字头像回退。

Web 实测（本地 Node 服务，非正式服务器）：
- 创建房间、显示服务端随机四位口令、人数、连续倒计时。
- 返回与关闭都打开确认；取消后房间和口令保持；确认关闭返回首页。
- 复制按钮触发口令提示；浏览器剪贴板回读为空，未确认系统剪贴板写入，微信 `setClipboardData` 尚待真机验证。
- 保存十二字昵称及头像后创建新房，昵称缩小且不越界。
- 470×836 同稿比例截图：`docs/verification/friend-room-long-name.png`。
- 375×600 短屏截图：`docs/verification/friend-room-short.png`，返回、复制和关闭按钮无重叠与裁切。
- 深浅底切图检查见本目录 contact-sheet.jpg、light-sheet.jpg。

`npm test`：24/24；`npm run typecheck`、`npm run typecheck:client` 通过。Web 辅助构建及 `npm run build:wechat` 成功；微信主包 1911.7 KB、resources 分包 18588.5 KB，包体检查通过。导出目录 `build/wechatgame/`。尚未进行微信开发者工具/真机安全区、剪贴板核验或正式发布。本页面沿用已批准共用场景与资料头像框，并非整张设计图背景逐像素复刻。
