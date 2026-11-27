# 本地验证记录

2026-10-26，Cocos Creator 3.8.8，Node.js 26.4.0。

- `npm test`：16 项通过，包含实际 HTTP/WebSocket 双客户端完整流程。
- `npm run typecheck`：通过。
- `npm run typecheck:client`：通过。
- `npm run build:web`：成功生成 Cocos web-mobile 构建。
- 浏览器实际点测：大厅、好友入口/四位口令、准备输入/锁定确认、AI 匹配、猜测提交/反馈、记录展开、查看记录同时输入、准备超时结算。
- 点测修正：场景脚本 UUID 编码、背景纹理资源加载、背景尺寸、开局时清除准备草稿、开场计时提示。

`records-input.png` 是 Cocos 实际运行截图，不是设计概念图。为便于人工布局检查，该截图使用单独的本机 8788 测试服务和 `DEV_SLOW_TIMERS=1`（准备/行动 600 秒）。正常 8787 服务保持 PRD 的准备 60 秒、行动 30 秒，自动化测试也验证正常计时。

微信 Android/iOS 真机、真实资料授权、线上负载、服务重启恢复尚未验收。未提供微信 AppID，因此未构建微信发布包。
