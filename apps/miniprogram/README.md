# Yu言在线微信小程序

微信原生小程序，面向通用预约用户。

## MVP 范围

- 微信登录与项目用户身份
- 头像 / 昵称初始化与编辑
- 邀请码加入空间
- 无 Space Membership 时的进入门禁
- 多空间切换
- 参与人、预约对象、可预约时段、预约创建、日程/三日视图、预约详情与取消

小程序不使用微信云开发，统一通过 Cloudflare Worker HTTPS API 使用后端能力。

## Design

全局设计基线见仓库根目录 [DESIGN.md](../../DESIGN.md)。

小程序采用轻量、原生感的通用工具风格，并统一使用“用户 / 空间 / 参与人 / 预约对象 / 时段 / 预约”等通用术语。

## 用户状态与本地缓存

登录后的服务端 User Profile 是头像、昵称、Space Membership 和当前 Space 的事实源。

- 小程序进入需要用户状态的页面时，优先通过 `GET /v1/me` 获取服务端最新 Profile。
- 本地 Storage 中的 `yuke.currentUser` 只作为显示降级缓存，不用于覆盖服务端的初始化状态判断。
- 如果本地没有有效项目 Token，或者服务端返回 `UNAUTHENTICATED`，客户端重新执行 `wx.login -> /v1/auth/wechat/session` 建立会话。
- 因此真机、开发者工具、清理 Storage 或直接打开资料页，只要使用同一个真实小程序 AppID 和微信账号，都应恢复到同一个服务端 User。

## 微信开发者工具本地配置

仓库提交的 `project.config.json` 只保存团队共享的开发者工具配置，并固定使用 `touristappid` 作为公开占位值。

需要使用真实小程序联调、预览或上传时，在微信开发者工具「详情 → 基本信息」中选择真实 AppID。开发者工具会把本机覆盖写入 `project.private.config.json`；该文件已被 `.gitignore` 忽略，不得提交到公开仓库。

真实 AppID 不应写回受版本控制的 `project.config.json`。

## Online runtime

小程序运行配置已切换到真实 Worker：

```text
apiMode=remote
apiBaseUrl=https://api.yuke.verinasci.com
```

Mock adapter 只保留给隔离单元测试使用，不再作为开发版 / 体验版 / 正式版默认运行时。

真实 `WECHAT_APP_ID`、`WECHAT_APP_SECRET` 和 `USER_TOKEN_SECRET` 只存在 Cloudflare Worker runtime，不得写入小程序代码、Git、Issue 或日志。

首次微信后台服务器域名与 Worker Secret 配置见 [docs/deployment-miniprogram.md](../../docs/deployment-miniprogram.md)。
