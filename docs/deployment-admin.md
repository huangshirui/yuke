# Yu言在线 · Admin Pages + Cloudflare Access Runbook

> 对应 GitHub #55。代码负责 Pages 生产构建 Gate、SPA fallback、Worker 精确 CORS；Cloudflare Account / Access Application 创建由项目所有者人工完成。

## 1. 目标拓扑

```text
Browser
  │
  ├─ https://yuke.verinasci.com
  │    Cloudflare Access
  │    └─ Pages Admin
  │
  └─ https://api.yuke.verinasci.com/v1/admin/*
       Cloudflare Access
       └─ Worker
            ├─ Cf-Access-Jwt-Assertion validation
            ├─ D1 AdminUser authorization
            └─ exact CORS: https://yuke.verinasci.com
```

Admin 页面和 Admin API 必须放在**同一个 multi-domain self-hosted Access Application** 中。使用两个显式域名/路径，而不是 wildcard。

## 2. Pages 项目（人工）

Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git。

建议：

- Repository: `huangshirui/yuke`
- Production branch: `main`
- Root directory: 仓库根目录
- Build command: `pnpm --filter @yuke/admin build:production`
- Build output directory: `apps/admin/dist`

Production 环境变量：

```text
VITE_ADMIN_DATA_MODE=api
VITE_API_BASE_URL=https://api.yuke.verinasci.com
```

`build:production` 会拒绝 mock 模式或非 HTTPS API origin，防止线上误发 Mock Admin。

绑定 Custom Domain：

```text
yuke.verinasci.com
```

仓库中的 `apps/admin/public/_redirects` 已提供 Vue Router SPA fallback。

## 3. Access Application（人工）

Cloudflare Zero Trust → Access controls → Applications → Add an application → Self-hosted。

在**同一个 Application** 中加入：

1. `yuke.verinasci.com`（全部路径）
2. `api.yuke.verinasci.com/v1/admin/*`

认证方式：

- Identity provider: One-time PIN / Email OTP
- MVP 授权权威仍然是 Yu言在线 D1 AdminUser；Access 负责认证。
- Access policy 可允许完成 OTP 的用户进入认证层；未被 Super Admin 预置的普通邮箱仍会在 Worker D1 授权层返回 403。

关键 Advanced settings：

- **Eager redirect cookie: ON**
  - 登录一个域名后，Access 会为同一 multi-domain application 的另一个显式域名预发 application cookie；
  - 避免 Admin SPA 第一次请求 API 时要求再次登录。
- API 域名的 CORS：
  - **Bypass OPTIONS requests to origin: ON**
  - OPTIONS 不含浏览器 cookie，不能让 Access 按普通请求拦截；
  - Worker 已实现严格 origin / method / header preflight 校验。

不要对 `api.yuke.verinasci.com` 整个 hostname 开 Access；小程序 API 必须保持公网可达，只保护 `/v1/admin/*`。

## 4. Access Runtime values（人工录入，不贴到 Git/聊天）

创建 Application 后获取：

- Team domain：`https://<team>.cloudflareaccess.com`
- Application Audience (AUD) tag
- Super Admin email

确保当前本机仍有 #54 的三个资源环境变量，然后重新生成 production config：

```bash
pnpm --filter @yuke/api production:config
```

交互式录入：

```bash
pnpm --filter @yuke/api exec wrangler secret put CF_ACCESS_TEAM_DOMAIN --config .wrangler/production.toml
pnpm --filter @yuke/api exec wrangler secret put CF_ACCESS_AUD --config .wrangler/production.toml
pnpm --filter @yuke/api exec wrangler secret put SUPER_ADMIN_EMAIL --config .wrangler/production.toml
```

真实值不要贴到 Issue、PR、聊天或 shell command 参数。

随后部署包含 Admin CORS 的 Worker：

```bash
pnpm --filter @yuke/api deploy:production
```

## 5. Smoke

1. 未登录访问 `https://yuke.verinasci.com` → Access 登录页。
2. 用 Super Admin 邮箱 OTP 登录。
3. Admin UI 应通过真实 API 加载，不显示 Mock synthetic 数据。
4. DevTools Network 中：
   - API origin = `https://api.yuke.verinasci.com`
   - preflight OPTIONS = 204（需要 preflight 的写请求）
   - Admin API 请求成功后由 Worker 校验 Access JWT。
5. 未预置的普通邮箱即使通过 Access OTP，也不能获得 Admin API 数据。

## 6. Gate

- Pages production build 使用 API 模式；
- `yuke.verinasci.com` 已绑定；
- 一个 multi-domain Access Application 同时保护 Admin 页面与 Admin API path；
- Eager redirect cookie 开启；
- API Access Application 对 OPTIONS bypass 到 Worker；
- Worker CORS 仅允许 `https://yuke.verinasci.com`，credentials enabled；
- Super Admin 首次登录可 bootstrap；
- 未预置普通邮箱 API 403。
