# 微信流程接入与验收

日期：2026-10-29。AppID：wx3f231fcad8d0170f。平台为微信小游戏（非 WXML 小程序）。

## 已实现

- 首次登录给出一次可跳过的资料完善入口；默认资料可直接游戏，不在启动时强制读取头像昵称。
- 资料页“使用微信头像昵称”：先通过 requirePrivacyAuthorize 请求平台隐私授权，再创建覆盖现有美术按钮的 createUserInfoButton。按屏幕坐标定位；出现提示后点该按钮获取资料。页面退出、刷新、退后台时销毁原生按钮，迟到回调不修改其他页面。
- 取得昵称、头像后仅填入编辑草稿，保存才同步后端；取消不落库。拒绝、匿名返回、旧版 API 不支持保留当前资料。昵称不符合当前 2～12 字校验时保留原昵称并提示手填。
- 后端新增 users.avatar_url（兼容旧库，启动幂等增加列），保存并在登录/WS 快照中返回；只接受 HTTPS 微信头像域名 thirdwx.qlogo.cn、wx.qlogo.cn。选择内置头像并保存会清除远程头像。头像加载失败使用内置头像兜底。没有新增任意照片上传能力。
- 大厅、资料、匹配、好友等待和局内本人头像使用真实头像，保留圆形裁剪和原有美术框。
- 资料页提供“隐私保护指引”入口，调用 openPrivacyContract。使用微信平台隐私弹窗，不注册一个伪造同意的自定义授权回调。
- 好友等待页增加“邀请微信好友”，胶囊分享菜单同步当前等待房间；分享内容不带登录 token、OpenID、底牌。没有发送成功奖励或虚假的“分享成功”。
- 分享参数携带四位 code 和 roomId；处理 getLaunchOptionsSync 与 onShow 的冷/热启动。登录成功后加入，已在其他房间/匹配中则保留当前操作并提示；无效/满房/过期显示现有提示。服务端校验 inviteRoomId，防止旧邀请进入口令复用后的新房。
- 复制口令等待真实成功回调后才提示成功，拒绝/失败提示手动输入。
- 修复微信存储缺省值为空串时动效/声音/振动默认开关失效的问题。

## 平台后台前置配置

1. 在微信公众平台填写《用户隐私保护指引》，按实际用途声明获取用户头像、昵称用于游戏资料展示，并开启平台“隐私授权弹窗”。实际声明及联系人等经营者信息须由管理员核实，不能由代码虚构。
2. 保持 request 域名 https://bomb.aiforevery.cn、socket 域名 wss://bomb.aiforevery.cn。真机验证头像 CDN 图片下载；若开发者工具报告下载域名限制，按报错核实实际 wx.qlogo.cn / thirdwx.qlogo.cn 域名配置。
3. 服务端继续使用既有 WECHAT_APP_SECRET 环境变量；无需重新生成，也不应放进客户端。
4. 本次尝试通过 Safari 核查后台，但计算机工具明确禁止访问该 URL，已停止浏览器后台操作。尚未确认后台隐私配置，需管理员完成。

## 验证

- 46 项单元测试通过，含邀请码合法性、前导零、冷/热启动去重、用户拒绝、授权期间离开、过期回调、头像地址白名单、邀请房间身份校验。
- 服务端/客户端类型检查通过。
- scripts/verify-wechat-server.cjs：隔离临时 SQLite 旧库迁移、真实 HTTP/WS 保存、重启恢复、清除头像、拒绝旧邀请及有效入房通过。不打印凭据；不修改线上数据库。
- scripts/verify-wechat-ui.cjs：Cocos Web 内模拟微信 API，验证授权按钮屏幕坐标、资料预览与保存、隐私入口、按钮清理、分享参数及入房命令。头像图片使用本地夹具，截图不代表真实微信授权成功。
- 真机仍需验收：首次/再次授权、拒绝、后台隐私弹窗、头像 CDN、分享卡片点入、账号重登、双机不同用户与安全区。

## 参考接口

- [小游戏用户信息获取](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/user-info.html)
- [createUserInfoButton](https://developers.weixin.qq.com/minigame/dev/api/open-api/user-info/wx.createUserInfoButton.html)
- [requirePrivacyAuthorize](https://developers.weixin.qq.com/minigame/dev/api/open-api/privacy/wx.requirePrivacyAuthorize.html)
- [shareAppMessage](https://developers.weixin.qq.com/minigame/dev/api/share/wx.shareAppMessage.html)

2026-10-29 实际读取官方 HTML 核实接口；网站正文可通过 HTTP 获取，但浏览器后台的受限访问不被替代或绕过。

## 当前交付状态

微信构建已导出到 build/wechatgame/，主包 1974.2 KB，资源分包 37803.4 KB；场景/反馈贴图完整性检查通过。后端部署输入已生成在忽略目录 temp/wechat-service/release.json，可通过 scripts/prepare-wechat-deploy.mjs 重建。

线上仅进行了只读侦察：digital-bomb.service 健康，微信登录密钥配置标志为 true（未读取密钥）。尚未改动线上代码或数据库，正在等待管理员确认备份部署与短暂重启。未经部署，线上旧服务不会保存新增头像字段，也没有邀请房间 ID 校验。
