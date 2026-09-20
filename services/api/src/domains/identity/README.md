# Identity Domain

用户身份领域。

## MVP 职责

- 微信小程序 `wx.login` 临时代码换取微信身份；
- 微信 OpenID 映射 Yu言在线 `users`；
- 签发短期项目 Access Token；
- 当前用户 Profile；
- 头像写入私有 R2，仅在 D1 保存 object key；
- Cloudflare Access Admin 身份与 RBAC；
- Super Admin 环境邮箱 bootstrap；
- 普通 Admin 按邮箱预置并在首次 Access 登录绑定稳定身份。

## Runtime secrets / bindings

生产环境必须通过受控 Cloudflare 配置提供：

- `DB`：D1 binding；
- `AVATARS`：R2 binding；
- `WECHAT_APP_ID`：Secret / Environment；
- `WECHAT_APP_SECRET`：Secret；
- `USER_TOKEN_SECRET`：至少 32 bytes 的随机 Secret；
- `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD`：Cloudflare Access 校验配置；
- `SUPER_ADMIN_EMAIL`：受控环境中的 Super Admin 邮箱。

公开仓库不得写入任何真实 AppID、AppSecret、OpenID、UnionID 或生产 R2 标识。

## 微信登录安全边界

Worker 调用微信 `code2Session` 后：

- 只使用 `openid` / 可选 `unionid` 建立项目身份；
- `session_key` 不落库、不写日志、不返回客户端；
- 项目 Access Token 使用 HMAC-SHA256 签名，MVP 有效期 24 小时；
- Token payload 只包含版本、User ID、签发时间和过期时间。

## Avatar

客户端应在上传前压缩头像。服务端再次限制：

- MIME：JPEG / PNG / WebP；
- 最大 1 MiB；
- R2 key：`avatars/{userId}/{random}.{ext}`；
- 替换头像时先写新对象并更新 D1，再尽力删除旧对象；
- 头像通过认证后的 `GET /v1/me/avatar` 读取，不暴露 R2 公开 URL。


## Admin provisioning

普通 Admin 不允许通过“任意 Access 登录”自动注册。Super Admin 使用 `POST /v1/admin/admin-users` 按邮箱预置；AdminUser 会先进入 `pending`，但项目 Admin ID 已固定，可提前分配 Space。首次 Access 登录邮箱匹配后绑定 `sub` 并进入 `bound`。

配置为 `SUPER_ADMIN_EMAIL` 的 Access 身份首次登录时可自动建立/绑定 Super Admin 行；真实邮箱与 Access subject 不得进入公开 Fixture 或文档。
