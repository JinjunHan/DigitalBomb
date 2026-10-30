# 微信登录失败排查

## 2026-10-30：开发者工具登录凭据失效

用户截图停在启动页，提示“微信登录失败”。在当前微信开发者工具直接调用 `wx.login`，仅输出是否收到 code 或失败原因，观测到：

`login:fail INVALID_TOKEN,invalid credential, access_token is invalid or not latest`

错误发生在 `wx.login` 阶段，客户端尚未向游戏后端 `/api/login` 发送请求。现有构建 AppID 为 `wx3f231fcad8d0170f`。这次证据指向开发者工具登录凭据失效；不能据此认定后端 AppSecret 或域名配置有误。

用户选择稍后自行退出开发者工具账号并重新扫码登录，当前未验证登录恢复。重新登录后重新编译当前 `build/wechatgame/`，再点击启动页重试；若仍失败，按新提示继续排查。不要通过关闭域名校验、使用假 code 或回退游客身份绕过微信登录。

## 代码改进

- `shared/wechat-login.ts` 将已知错误转换为可操作提示，不输出原始响应、登录 code 或 token。
- 开发者工具 INVALID_TOKEN 提示“开发者工具登录已失效，请重新扫码登录后编译”；真机提示退出小游戏重新进入。
- 单独识别网络、超时、AppID/权限错误、空 code；不在客户端猜测后端鉴权结果。
- API timeout 与本地 10 秒截止时间并用，SDK 不回调也能退出等待；迟到回调不改变结果。
- 已停止连接在异步登录或后端认证返回后，不再发起下一阶段请求、保存 token 或打开 socket。

验证：62 项测试通过；服务端、客户端类型检查通过；微信导出和包体检查通过。没有修改服务器配置、微信账号凭据或权限。尚未进行重新登录后的模拟器验证及真机验证。

## 2026-10-30：开发者工具运行实例 JSON 解析失败

另一次启动出现 `Uncaught SyntaxError: Unexpected end of JSON input`，堆栈为 `new l / 1981 / index.js`。在开发者工具 Sources 中点开对应调用并格式化，实际抛错代码位于工具运行层：

```js
const t = __global.prompt("GET_RUNTIME_INSTANCE_INFO");
this.runtimeInstanceInfo = JSON.parse(t);
```

这是运行实例信息的解析，发生在该层 `loadAppService()` 之前；不是游戏 WebSocket 消息或后端登录响应的 JSON 解析。游戏中的两处 JSON.parse 均已有 try/catch。导出的 project.config.json、game.json 和 src/settings.json 均通过解析检查。

环境为开发者工具 2.02.2609240 Stable / 基础库 3.17.5。重新编译、退出并重启工具、重新打开当前项目均仍复现。此前能进入游戏时为基础库 3.17.4；已确认本地设置下拉列表仍提供 3.17.4，但版本因素尚未得到对照实验验证，不应据此断言 3.17.5 是根因。

本次未修改游戏代码、工具内部 JavaScript、用户存储或安全校验。重新执行微信导出与包体检查成功；本地导出成功不代表当前异常的模拟器已恢复。下一步是经用户确认后切换本地调试基础库做对照。
