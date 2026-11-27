# 猜数字暗号

Cocos Creator **3.8.8** + TypeScript 客户端，Node.js + WebSocket 权威服务端。

当前已有公网体验版：https://bomb.aiforevery.cn 。尚未完成微信真机接入或正式上线验收。核心游戏已实际接入服务端，不是设计图热点演示。

## 启动

需要 Node.js 22.13+（使用内置 SQLite）和 Cocos Creator 3.8.8。

```sh
npm install
npm run server
```

另一个终端：

```sh
npm run build:web
npm run preview
```

打开 [本地预览](http://127.0.0.1:8080)。服务器在 `127.0.0.1:8787`，预览在 `127.0.0.1:8080`。构建脚本默认使用本机 `/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator`；其他安装位置通过 `COCOS_CREATOR` 环境变量指定。

也可在 Cocos Dashboard 中导入本项目根目录，打开 `assets/scenes/Main.scene` 后预览。服务端须单独启动。

### 体验两位玩家

普通窗口与无痕窗口各打开预览，或者分别打开 `http://127.0.0.1:8080` 和 `http://localhost:8080`。同源普通标签页会共享账号，只能一个连接在线；第二个连接会接管旧连接。

- 好友对战：一人创建房间，另一人输入四位口令加入。
- 在线匹配：两人同时排队优先相互匹配；只有一人时，服务器随机等待 3～8 秒分配自动对手。
- 可用鼠标/触摸输入，也可使用数字键、Backspace、Enter。
- 确认四位底牌后不可修改；先手猜中后，后手本轮补猜也中为平局。
- 最近三次历史常驻；全部记录按页查看，并保留猜测输入与键盘。

## 验证

```sh
npm test
npm run typecheck
npm run typecheck:client
```

客户端类型检查依赖 Cocos 第一次打开/构建生成的 `temp/declarations`。测试涵盖纯规则、服务端房间/匹配，以及启动独立服务的 HTTP/WebSocket 双客户端完整对局、补猜、再战和重连。测试使用临时数据目录，不修改开发数据。

## 目录

- `assets/scripts/GameApp.ts`：Cocos 原生 UI、输入、记录、页面切换。
- `assets/scripts/Connection.ts`：连接、确认、断线重连与状态同步。
- `assets/scripts/Platform.ts`：本地存储、HTTP、微信平台适配边界。
- `server/game.ts`：权威对局状态机、判定、超时及 AI 推理。
- `server/service.ts`：排队、口令分配、席位、操作幂等、再战。
- `server/index.ts`：本地 HTTP/WebSocket 服务与 SQLite 用户/结算摘要。
- `docs/IMPLEMENTATION.md`：已实现范围、局限与微信接入清单。
- `docs/design/index.html`：设计概念图；与当前可运行版本分开保存。

`data/` 保存本地账号和结算摘要，`library/`、`temp/`、`build/` 是生成目录，均不提交。不要把 `.env`、微信 AppSecret 或玩家数据提交到仓库。

## 公网部署与微信配置

见 [部署记录](docs/DEPLOYMENT.md)。AppID 已写入构建脚本，运行 `npm run build:wechat` 生成微信工程。AppSecret 仅在服务器配置，不放客户端。
