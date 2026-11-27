# 实现用素材

使用内置 image_gen 生成 `assets/resources/art/table.png`，2026-10-26。
这是独立无文字背景，UI、卡牌、数字和按钮由 Cocos 原生组件渲染。

最终提示词：

Generate a production game background asset, portrait 9:16, 750x1334 composition. A warm cozy illustrated study/cafe interior above a perspective green teal felt walnut table, viewed first-person seated at near end. Far empty chair centered in top 20%, warm lamplight, bookshelves and night window blurred in distant background. The table occupies lower 80% and is EMPTY, uninterrupted rich dark teal felt with subtle texture, elegant wood edges at left/right/bottom. Space for UI overlays, low contrast center. Premium painted 2.5D casual game art, warm amber and deep teal. No people, hands, cards, game devices, text, letters, numbers, UI, buttons, watermarks, decorative objects on the usable tabletop. Upper right quiet background for WeChat capsule. Important: visually rich edges but spacious clear central play area. This is a separated BACKGROUND sprite for 数字炸弹, not a complete mockup.


## 2026-10-27 对手人物

assets/resources/art/opponent.png，imagegen 原生透明背景输出。原始文件：/Users/hanjinjun/.codex/generated_images/01a176ec-83e6-7210-bad4-d489be51d4ba/exec-49e095f3-e418-484b-bf25-27ef37e9d5ad.png。

提示词：Create ONE transparent isolated game character sprite, a handsome friendly adult young man with tousled dark brown hair in olive knitted sweater, sitting facing viewer, chin supported on one hand, forearms resting just below chest, waist-up. Warm amber light from left, painterly polished anime casual mystery card game style, refined soft edges, intricate knit fabric, inviting warm brown eyes. Fully transparent background no scene no table no cards no text no border. Centered symmetrical front view, entire hair and both elbows visible, bottom ends at waist. Intended for small opponent bust at far edge of teal felt table. Portrait aspect.

## 2026-10-27 首页 v3 分层实现

以 `01-lobby-v3.png` 为参考，用内置 image_gen 重建无 UI 背景和带真实 alpha 的前景图集，再按实测边界裁切；这不是原稿的逐像素无损 PSD 分层。

运行时目录：`assets/resources/art/lobby/`，包含 background、title、machine、primary、secondary、help、utility 七张 PNG，Cocos 导入元数据随素材保存。按钮文字、昵称、四位数字及点击逻辑均为独立原生节点。标题为品牌美术字。个人资料采用实时昵称与现有系统头像符号，没有固化参考图中的虚构用户头像。圆形控件复用于设置与声音按钮。

源图集、完整生成提示词、裁切坐标：`docs/design/lobby-layers/`。复现裁切：`python3 scripts/slice-lobby.py`（需 Pillow）。保持原 alpha，不做色键抠图。首页资源缺失时回退到原生按钮和文字，其余页面继续使用原背景。

验证：客户端 TypeScript 检查通过；Cocos web-mobile 构建成功；本地浏览器实测在线匹配进入准备阶段、退出准备、好友入口、玩法弹窗、设置弹窗、声音开关。实际截图：`docs/verification/lobby-layered-v3.png`。尚未进行本次变更的微信真机验证。

## 完整控件切图修订

根据用户要求，首页主按钮改为从 `01-lobby-v3.png` 原图直接裁切，保留背景、图标、中文文字和箭头；设置、声音及带问号的怎么玩也使用整块切图。新增头像边框与昵称框，框内显示当前玩家的系统头像符号和昵称。昵称框原姓名区域作透明窗口，由底色与实时昵称填充。静音状态在完整声音切图上叠加独立斜线节点。

复现：`python3 scripts/slice-lobby-controls.py`。完整坐标与轮廓在 `docs/design/lobby-layers/control-slices.json`。原始像素直接保留，仅轮廓外和头像/昵称动态区域使用透明遮罩。按钮不再叠加系统字体，旧图集保留用于历史版本追溯。

## 个人资料纸张插页

`02-profile.png` 的返回、标题、更换头像、微信入口、取消、保存、昵称框和四个头像使用原图完整切图，脚本为 `scripts/slice-profile.py`，坐标在 `docs/design/profile-slices.json`。头像 0 使用上方大头像裁切，避免把示例选中勾固化进头像。昵称保持可编辑；头像选中框/勾独立渲染。纸张底图由内置 image_gen 补齐被遮挡区域，提示词在 `docs/design/profile-paper-prompt.json`，素材均在 `assets/resources/art/profile/`。

首页和资料页共用同一背景纹理及尺寸，背景无位移。资料页全部控件挂在单个纸张节点上：420ms 从右下方、-12° 滑入至正向；300ms 反向退出。关闭界面动效时直接切换。动画中禁用表单和按钮，重绘时续接当前位姿及剩余时长。纸张按安全区域统一等比缩放。

返回/取消放弃草稿；保存校验昵称并等待服务端成功后退回首页，失败保留输入。四个插画头像沿用既有 0–3 ID，历史 4–7 ID 仍可显示并保存。微信授权入口沿用未接入提示，不模拟授权成功。

验证结果：客户端类型检查、Web 构建及微信构建成功。浏览器实测纸张斜向进出、头像选择后取消不保存、昵称编辑、保存后自动退出并同步首页。微信主包 1899.6 KB，资源分包 12902.8 KB；本次尚未进行微信真机软键盘与安全区验收。

### 转场与微信按钮修正

原 420ms 转场使用构建界面前的墙上时钟截止时间，首帧准备和重绘可能消耗动画预算。现改为 `update(dt)` 按渲染帧推进：进场 800ms、退场 550ms，倾角 16°，前两帧保持起始位姿，单帧推进上限 50ms，重绘不重置进度。仍遵循设置中的“界面动效”开关。

微信资料按钮改用贴合原始圆角与底部阴影的曲线 alpha 轮廓，修复多边形裁边造成的切角和背景残留。浏览器真实转场截图序列及录制时间在 `docs/verification/profile-transition-frames/`，动态预览为 `profile-slide-in.gif`，最终页面为 `profile-paper-fixed.png`。类型检查、Web 构建、微信构建均通过，微信主包 1900.2 KB。

### 首页到个人资料的重叠转场

按用户确认的时序：背景不动，首页内容独立成组，在 0–0.5s 内缩放 1→0.5、透明度 1→0。资料主体在 0.3s 开始右侧倾斜入场，沿用 0.8s 入场时长，缩放 1.2→1、透明度 0.8→1。返回按钮从主体拆出，作为独立同级图层，在 0.3s 起从左侧入场，透明度 0→1。所有缩放均相对安全区适配后的静态尺寸。总时长 1.1s，动画中阻挡首页交互并禁用资料编辑。退出仍为 0.55s，主体向右、返回按钮向左收回。

数学时序集中在 `assets/scripts/shared/profile-transition.ts`，由 `tests/profile-transition.test.ts` 验证起点、0.3s 延迟、0.5s 首页消失、重叠区间、完成状态和退出时序。仍尊重现有动效开关，不覆盖已保存的用户设置。

### 转场参数微调

首页内容缩放终点调整为 0.8，淡出时长仍为 0.5s。资料主体与返回按钮取消 0.3s 延迟，和首页淡出同时开始，入场总时长改为 0.8s。其余透明度、主体缩放和进出方向保持不变。

### 返回反推动画

返回、取消及保存成功后的退出，改为对当前 0.8s 入场时间轴精确倒放。主体从右退出，缩放 1→1.2、透明度 1→0.8；返回按钮从左退出、透明度 1→0。首页同时在底层保留，倒放前 0.3s 隐藏，随后 0.5s 内缩放 0.8→1、透明度 0→1。背景保持原位。测试逐个比较正反时间点的全部视觉属性，确保时序对称。

### 独立头像装饰素材

基于 `02-profile.png`，用内置 image_gen 生成头像框、罗盘纸纹头像背景、金色勾选徽章。高分辨率原图和完整提示词保存在 `docs/design/profile-avatar-assets/`。运行时 PNG 位于 `assets/resources/art/profile/`：`portrait-frame.png` 512×512（中心及外部透明）、`portrait-background.png` 512×512（纸纹中心和罗盘线稿）、`avatar-selected.png` 128×128（含渐隐光晕）。sips 仅作尺寸归一化，原图保留。

大头像按背景→头像→头像框分层叠加；下方四个头像复用头像框，选中项右下角显示独立徽章。透明通道已检查，头像框中心 alpha=0。页面素材异步加载失败时保留原头像及文字勾的回退。

### 昵称输入定位与焦点修复

昵称改为单行输入，文字节点使用左上锚点、固定尺寸裁切、左对齐和垂直居中，保留左侧内边距与右侧铅笔空间。输入触摸区域覆盖整个昵称框。

触摸开始时即保护输入节点，防止微信打开软键盘同步触发 canvas-resize 后重建页面；编辑中的异步刷新与尺寸调整延后到编辑结束处理。保存、返回、取消及切换头像会先结束编辑并同步草稿。延后的刷新若遇到再次编辑，会继续保留到下一次结束。

验证：客户端类型检查及输入会话/转场 5 项测试通过；浏览器检查昵称居中、点击获得焦点及持续编辑，截图 `docs/verification/profile-nickname-fixed.png`。Web 与微信构建成功，微信主包 1904.8 KB。尚未进行微信真机软键盘验证。
