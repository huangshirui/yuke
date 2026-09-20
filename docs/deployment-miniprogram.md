# Yu言在线 · 微信小程序真实环境 Runbook

> 对应 GitHub #56。代码已固定使用 `https://api.yuke.verinasci.com`，本页只处理微信公众平台与 Cloudflare runtime 的真实配置。

## 1. 线上链路

```text
WeChat Mini Program
  │
  ├─ wx.login()
  │    └─ POST https://api.yuke.verinasci.com/v1/auth/wechat/session
  │         └─ Worker 调微信 code2session
  │
  ├─ wx.request()
  │    └─ Bearer project token
  │
  ├─ wx.uploadFile()
  │    └─ /v1/me/avatar
  │
  └─ wx.downloadFile()
       └─ /v1/me/avatar
```

Mini API 不经过 Cloudflare Access；用户身份由 `wx.login` + Yu言在线短期项目 token 负责。

## 2. 微信公众平台服务器域名（人工）

在微信公众平台的小程序后台进入开发设置 / 服务器域名。

将下面**同一个 HTTPS origin** 分别加入：

### request 合法域名

```text
https://api.yuke.verinasci.com
```

### uploadFile 合法域名

```text
https://api.yuke.verinasci.com
```

### downloadFile 合法域名

```text
https://api.yuke.verinasci.com
```

不要填写 `/v1` 或具体 path。

保存后在微信开发者工具重新编译；真机调试应使用平台保存后的正式域名配置，不依赖“忽略合法域名校验”。

## 3. Worker 微信 Runtime Secret（人工）

不要把下面真实值发到聊天、Issue 或 Git：

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `USER_TOKEN_SECRET`

确保本机已有 #54 生成的：

```text
services/api/.wrangler/production.toml
```

通过 Wrangler 的交互式 prompt 录入：

```bash
pnpm --filter @yuke/api exec wrangler secret put WECHAT_APP_ID --config .wrangler/production.toml
pnpm --filter @yuke/api exec wrangler secret put WECHAT_APP_SECRET --config .wrangler/production.toml
pnpm --filter @yuke/api exec wrangler secret put USER_TOKEN_SECRET --config .wrangler/production.toml
```

`USER_TOKEN_SECRET` 必须是高熵随机值，至少 32 bytes。Git Bash 可先生成一个随机值：

```bash
openssl rand -hex 32
```

只把输出粘贴到 Wrangler 的 secret prompt；不要写入 shell 命令、仓库文件或聊天。

如果未来旋转 `USER_TOKEN_SECRET`，已有项目 Bearer token 会失效，需要用户重新 `wx.login`。

## 4. 首次真实 Smoke

按顺序验证：

1. 微信开发者工具启动小程序；
2. 首次进入调用 `wx.login`；
3. `POST /v1/auth/wechat/session` 返回项目 Bearer token；
4. 设置昵称；
5. 选择头像并通过 `wx.uploadFile` 上传；
6. 头像通过 `wx.downloadFile` 读取；
7. 输入有效 Invite Code 加入 Space；
8. “我的”页面可读取已加入 Space；
9. 多 Space 场景可切换 current Space；
10. 真机重复以上关键路径。

## 5. 故障边界

- “url not in domain list / 不在以下 request 合法域名列表中”：微信后台服务器域名未保存或开发工具缓存未刷新。
- `/v1/auth/wechat/session` 返回 401 且微信 code 无效：检查真实 AppID/AppSecret 是否属于当前小程序。
- Worker 返回内部配置错误：检查三个 runtime secret 是否已写入生产 Worker。
- 普通 Mini API 不应出现 Cloudflare Access 登录页；如果出现，说明 #55 错误保护了整个 API hostname，而不是只保护 `/v1/admin/*`。

## 6. #56 Gate

- 小程序默认 runtime = remote；
- request / uploadFile / downloadFile 合法域名均包含 production API origin；
- Worker 已配置 AppID / AppSecret / User Token Secret；
- 微信开发者工具完成真实 `wx.login`；
- 至少一台真机完成 profile / avatar / join Space / switch Space。
