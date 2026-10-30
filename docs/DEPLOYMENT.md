# 公网体验版部署记录

日期：2026-10-27。地址：https://bomb.aiforevery.cn

## 已部署

- 宝塔站点：bomb.aiforevery.cn，静态目录 /www/wwwroot/bomb.aiforevery.cn。
- 后端：/www/wwwroot/digital-bomb-service，Node.js 24.18.0，用户 www。
- systemd：digital-bomb.service，开机启动、异常自动重启，监听 127.0.0.1:8787。没有开放后端端口。
- 宝塔 Nginx 将 /api/login、/ws、/health 转发到后端，其余为 Cocos 静态构建；HTTP 重定向 HTTPS。
- Nginx 配置：/www/server/panel/vhost/nginx/bomb.aiforevery.cn.conf。
- 反代规则：/www/server/panel/vhost/rewrite/bomb.aiforevery.cn.conf。
- 证书：引用 /www/server/panel/vhost/cert/47.116.177.107/ 的现有泛域名证书；有效期至 2027-01-17。后续由主站续期维护，未复制或输出私钥。
- SiteSSLApply 返回成功但未实际生成或部署证书，实际使用已有泛域名证书并通过外网 TLS 验证。
- 备份：/www/backup/digital-bomb-20261027/，含发布前新站点目录、Nginx、rewrite 配置及本次发布包。
- 数据库：后端 data/digital-bomb.sqlite，目录仅 www 可访问。进行中房间不跨进程重启恢复。
- 日志：journalctl -u digital-bomb.service；Nginx 日志 /www/wwwlogs/bomb.aiforevery.cn*.log。
- 连接器没有 NodeProjectCreate/Info 能力，因此使用独立 systemd；不会出现在宝塔 Node 项目列表，静态站点仍由宝塔管理。

## 微信待配置

AppID：wx3f231fcad8d0170f。

在服务器 /www/wwwroot/digital-bomb-service/.env 的 WECHAT_APP_SECRET= 后填入真实密钥（文件权限已设置为 600）。请在服务器编辑，不要发到聊天或写入仓库。配置后执行 systemctl restart digital-bomb.service。

微信后台服务器域名需要配置：
- request 合法域名：https://bomb.aiforevery.cn
- socket 合法域名：wss://bomb.aiforevery.cn

客户端已调用 wx.login；服务端校验 code 后绑定 OpenID，session_key 不返回给客户端。缺少 AppSecret 返回 503。真实平台登录仍待验证。

## 验证与边界

已通过外网 TLS、HTTP 200、健康检查，以及 scripts/smoke-remote.mjs 的双人完整对局（补猜平局）。本地 16 项测试、双端类型检查、Cocos 两平台构建通过。

本次为公开体验版：浏览器游客登录仍启用，暂无完整内容审核、进程重启恢复或容量压测，不是正式运营发布。无广告。微信构建包尚需包体优化、开发者工具校验与真机验证。

## 回退

停止 digital-bomb.service，仅恢复上述 bomb 站点的备份目录与 nginx/rewrite 配置；nginx -t 通过后再重载 Nginx。不要恢复或更改其他站点。SQLite 独立备份，勿覆盖玩家数据。

## 2026-10-27 匹配时长调整

人机随机兜底由 25～35 秒调整为 3～8 秒，仍优先匹配真人，每张排队凭证仅抽取一次。服务文件备份：/www/backup/digital-bomb-match-20261027/service.js。服务已重启生效。

## 2026-10-27 游戏命名

用户选定“猜数字暗号”。客户端标题、构建名称和展示介绍已更新；线上静态版本为 releases/name-v1，入口备份 /www/backup/digital-bomb-name-20261027/index.html。微信后台名称仍由用户提交查重和审核。

## 2026-10-29 微信资料与分享邀请后端更新

用户已明确确认备份部署及服务重启影响。仅更新现有 digital-bomb.service 的 3 个文件：server/index.js、server/service.js、assets/scripts/shared/wechat-flow.js；未发布 Web 静态资源，未修改域名、Nginx 或密钥。

- 备份目录：`/www/backup/digital-bomb-wechat-20261029/`（目录权限 700）。`original/` 保存原代码与停服后的 SQLite 完整文件；`staged/`、`release.json` 保存本次代码。
- 停服前核对两份旧入口文件 SHA256，预先运行 Node 语法检查；停服备份后原子替换文件、启动服务，并检查健康、迁移字段及用户数。脚本具备失败恢复路径。本次成功，无需回滚。
- users 表新增可空 avatar_url 字段；旧资料仍可使用。接受已校验的微信头像 URL；内置头像可清除该字段。邀请入房额外校验 inviteRoomId，四位口令手动加入仍兼容。
- 独立线上测试账号通过公网 HTTPS/WSS：资料保存并核实 SQLite 落库、拒绝旧房间 ID、有效邀请入房、退出测试房间、清除测试头像。没有输出会话凭据。测试账号保留，不删除用户数据。
- 微信登录配置健康标志为 true，但未读取 AppSecret。用户明确表示微信后台隐私指引和平台授权弹窗尚未配置；这部分不是后端部署即可自动完成，仍须管理员处理后真机验收。
- 回滚时先停服，原代码与数据库须成对恢复；旧 INSERT 语句不兼容新增列，不能仅恢复旧入口而直接使用新结构数据库。恢复部署前数据库会丢失备份后的新数据，实际回滚前应再次备份当前库并评估。

## 2026-10-30 好友房结算返回更新

通过 baota-mcp 将源码提交 `9dc04a4` 编译后的 `server/service.js` 部署到 `/www/wwwroot/digital-bomb-service/server/service.js`，重启 `digital-bomb.service` 生效。仅更新该文件，数据库、密钥、Nginx 和 Web 静态资源未改动。

- 备份：`/www/backup/digital-bomb-friend-9dc04a4/original/service.js`；候选文件和公网验证脚本保存在同目录的 `staged/`。
- 发布前核对旧文件 SHA256，确认 `game.js`、`wechat-flow.js` 与本地依赖一致，校验新文件 SHA256 和 Node 语法。替换及健康检查脚本带失败恢复路径，本次无需回滚。
- 新服务 SHA256：`f79b552fb8f42d5ae4519bd572baeb851add2954d6bf310a4b1f328a26a837c3`。
- 公网 HTTPS/WSS 双人完整对局通过：补猜平局、拒绝旧 rematch 命令、双方独立确认返回、保留口令及原房主、清空底牌和历史，最后退出测试房间。验证脚本：`scripts/smoke-friend-return.mjs`。测试账号保留，不删除用户数据，不输出凭据。
- 服务 active、健康接口正常、NRestarts=0，启动日志无致命错误。微信客户端仍须使用新导出的 `build/wechatgame/` 上传体验版或发布，未做真机验证；旧 Web 客户端未同步更新。
- 本次仅代码变更，可将上述备份原子替换回服务文件并重启服务回退，无需恢复数据库。
