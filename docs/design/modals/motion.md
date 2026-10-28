# 弹窗逐项转场设计

沿用已有分层美术，不增加生成图或贴图。配置位于 `assets/scripts/shared/modal-motion.ts`，运行层位于 `assets/scripts/ModalLayer.ts`。

| 弹窗 | 入场 | 内容层 | 退场 | 时长（入 / 出） | 实际录制 |
| --- | --- | --- | --- | --- | --- |
| 设置 | 从下方轻放，略微缩小与倾斜后归位 | 返回、完成和四个开关按短间隔出现 | 向下收回，淡出 | 380 / 250 ms | [预览](../../verification/modal-motion/settings.gif) |
| 怎么玩 | 说明页从右侧带小角度滑入 | 返回与“明白了”稍后出现，静态图文随纸张进入 | 原方向退出 | 480 / 320 ms | [预览](../../verification/modal-motion/rules.gif) |
| 牌桌菜单 | 小距离上浮，快速展开 | 继续与认输按钮逐层出现 | 快速缩回 | 240 / 180 ms | [预览](../../verification/modal-motion/menu.gif) |
| 猜测记录 | 账本从右侧水平抽出，不摇晃数字 | 标签、倒计时与滚动区短暂错峰显现 | 向右收起 | 360 / 250 ms | [预览](../../verification/modal-motion/live.gif) |
| 本局记录 | 从左侧轻放账本，带轻微转角 | 标签与最终记录渐显 | 向左收起 | 440 / 300 ms | [预览](../../verification/modal-motion/result.gif) |
| 锁定底牌 | 从稍上方以 1.045 倍落定，强调确定性 | 四位真实数字轻落显现 | 向上淡出 | 320 / 220 ms | [预览](../../verification/modal-motion/lock.gif) |
| 重复猜测 | 短距离横向轻晃一次提示 | 数字与操作按钮短暂错峰 | 轻向左退出 | 360 / 220 ms | [预览](../../verification/modal-motion/repeat.gif) |
| 离开准备 | 从左下方轻斜移入 | 两个选择稍后显现 | 左下方收回 | 360 / 260 ms | [预览](../../verification/modal-motion/leave.gif) |
| 关闭房间 | 从下方升起，轻微负向转角 | “留在房间”与“关闭房间”错峰 | 下沉退出 | 400 / 280 ms | [预览](../../verification/modal-motion/close.gif) |
| 确认认输 | 克制的短距离上浮与小幅展开，不弹跳 | 保留继续对局的视觉优先级 | 小幅下沉收起 | 300 / 240 ms | [预览](../../verification/modal-motion/resign.gif) |
| 连接中断 | 原位淡入，仅 1.5% 的尺度变化 | 重连入口同步渐显，不闪烁、不循环摇晃 | 恢复后原位淡出 | 220 / 200 ms | [预览](../../verification/modal-motion/reconnect.gif) |

## 状态与交互

- 弹窗层是 `Interface` 的同级节点，背景保持原位；普通重绘只更新内容，时间轴保留。开关、数字状态、网络同步与记录标签切换不重播入场。
- 退场保留当前纸面；新弹窗入场与旧纸面退场可交叠，共享一层遮罩。快速切换最多保留一个入场和一个退场节点。
- 被系统状态打断时，从当前位姿退出，不先跳到完整展开状态。大帧间隔上限 50 ms，避免切回前台时直接跳过整个动画。
- 入退场期间阻挡触摸和物理数字键；退场结束后才重新开放底层交互。确认动作立即提交，不为了播放动画延迟网络命令。
- 尊重本地“界面动效”设置。关闭动效立即到位或移除，重新打开动效不会重播已展开的弹窗。
- 动画结束后不再反复写入内容节点的位置，记录滚动条仍由 ScrollView 控制。

## 验证

`npm test` 33 项通过；服务端和客户端类型检查通过。Web 中实际检查了 11 类入场和退场、重绘续接、系统打断、快速替换、动效关闭、退出期间键盘阻挡、原有按钮与滚动回归。

复现：启动本地服务器与 Web 预览后，执行 `node scripts/verify-modals.cjs --motion`，再执行 `python3 scripts/pack-modal-motion.py`。Playwright 模块位置可用 `PLAYWRIGHT_MODULE` 指定。连续截图使用运行中的真实画面，GIF 的帧时长来自实际采集时间戳，没有插值生成画面；采集帧率低于游戏实际帧率。`docs/verification/modal-motion-checks.json` 保存时序和检查结果，逐帧条带位于同目录 `modal-motion/*.jpg`。

微信本地导出到 `build/wechatgame/`；尚未做微信开发者工具真机验证或正式发布。
