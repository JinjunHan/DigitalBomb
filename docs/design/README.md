# 猜数字暗号 · 视觉设计

使用内置 image_gen 生成，2026-10-26。共八张 9:16 竖屏概念稿。

统一方向：暖木桌面、墨绿桌布、奶油纸牌、橙色主按钮、第一视角。

这些图片是视觉概念，不是已实现的界面或可直接切片的最终资产。正式实现需独立排版文字、按钮、卡牌与背景，适配微信安全区；对局图中的数字微调箭头为生成细节，首版按 PRD 使用数字键盘。形象为虚构素材，不关联真实用户。结算图展示先手猜中、后手补猜未中。

- [大厅](/Volumes/ExtraDisk/Projects-Godot/DigitalBomb/docs/design/01-lobby-v3.png)
- [个人资料](/Volumes/ExtraDisk/Projects-Godot/DigitalBomb/docs/design/02-profile.png)
- [在线匹配](/Volumes/ExtraDisk/Projects-Godot/DigitalBomb/docs/design/07-matching.png)
- [输入口令](/Volumes/ExtraDisk/Projects-Godot/DigitalBomb/docs/design/08-join-room.png)
- [好友房等待](/Volumes/ExtraDisk/Projects-Godot/DigitalBomb/docs/design/03-friend-room.png)
- [设置底牌](/Volumes/ExtraDisk/Projects-Godot/DigitalBomb/docs/design/04-preparation.png)
- [局内猜测](/Volumes/ExtraDisk/Projects-Godot/DigitalBomb/docs/design/05-gameplay-v2.png)
- [胜利结算](/Volumes/ExtraDisk/Projects-Godot/DigitalBomb/docs/design/06-result.png)

[完整生成提示词](prompts.json) · [浏览全部页面](index.html)

## 第二轮更新

首页移除右上角设置和装饰牌，设置改至左下；局内在本次猜测上方常驻最近三次记录，缩小装饰及手牌。全部记录展开规范见 PRD。原版图片保留作比较。

[第二轮提示词](prompts-v2.json)。新版猜测输入已移除上下箭头，以数字键盘为准。微信胶囊区域须在实现时动态适配，概念稿留白不代表所有设备验收通过。

## 第三轮首页更新

2026-10-27 使用内置 image_gen，基于 v2 生成「猜数字暗号」新版首页。保留暖木书房、墨绿桌布和原有入口布局；标题改为五字版，炸弹装饰改为密码锁，匹配按钮使用钥匙图标。新稿为 `01-lobby-v3.png`，v2 保留。仅更新视觉概念稿，未替换运行时 UI。

[第三轮完整提示词](prompts-v3.json)。
