# Yu言在线 · Admin Worker Static Assets + Cloudflare Access Runbook

> 对应 GitHub #55。Admin Web 使用独立的 `yuke-admin` Cloudflare Worker Static Assets，不使用 Cloudflare Pages；API 继续由独立 `yuke-api` Worker 承载。

## 1. 目标拓扑

```text
Browser
  │
  ├─ https://yuke.verinasci.com
  │    Cloudflare Access
  │    └─ yuke-admin Worker Static Assets
  │         └─ apps/admin/dist
  │
  └─ https://api.yuke.verinasci.com/v1/admin/*
       Cloudflare Access
       └─ yuke-api Worker
            ├─ Cf-Access-Jwt-Assertion validation
            ├─ D1 AdminUser authorization
            └─ exact CORS: https://yuke.verinasci.com
```

Admin UI 与 API 保持两个独立 Worker：
- `yuke-admin`：只负责 Vue SPA 静态资产；
- `yuke-api`：负责 API、D1、R2 与身份授权。

两者独立部署、独立回滚。Admin 页面和 Admin API path 放在**同一个 multi-domain self-hosted Access Application** 中。

## 2. Admin Worker Static Assets

仓库已提交：

```text
apps/admin/wrangler.toml
```

核心配置：

```toml
name = "yuke-admin"
workers_dev = false
preview_urls = false

[assets]
directory = "./dist"
not_found_handling = "single-page-application"

[[routes]]
pattern = "yuke.verinasci.com"
custom_domain = true
```

Vue Router 的 history fallback 由 Workers Static Assets 的 `single-page-application` 模式负责，不依赖 Pages。

### 首次人工部署

Git Bash：

```bash
git switch main
git pull --ff-only
pnpm install

export VITE_ADMIN_DATA_MODE=api
export VITE_API_BASE_URL=https://api.yuke.verinasci.com

pnpm --filter @yuke/admin deploy:production
```

`build:production` 会拒绝 mock 模式或非 HTTPS API origin；随后 Wrangler 会创建/更新 `yuke-admin` Worker、上传 `dist` Static Assets，并为 `yuke.verinasci.com` 配置 Custom Domain。

如果 `yuke.verinasci.com` 已存在冲突 CNAME / Worker Custom Domain，需要先处理冲突 DNS/route 后再部署。

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
  - 登录一个域名后，为同一 multi-domain application 的另一个显式域名预发 application cookie；
  - 避免 Admin SPA 第一次请求 API 时再次要求登录。
- API 域名的 CORS：
  - **Bypass OPTIONS requests to origin: ON**
  - OPTIONS 由 `yuke-api` Worker 的严格 CORS middleware 校验。

不要对 `api.yuke.verinasci.com` 整个 hostname 开 Access；小程序 API 必须保持公网可达，只保护 `/v1/admin/*`。

## 4. Access Runtime values（人工录入，不贴到 Git/聊天）

创建 Application 后获取：

- Team domain：`https://<team>.cloudflareaccess.com`
- Application Audience (AUD) tag
- Super Admin email

确保当前本机仍有 #54 的三个 API 资源环境变量，然后重新生成 API production config：

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

随后重新部署包含 Admin CORS 的 API Worker：

```bash
pnpm --filter @yuke/api deploy:production
```

## 5. Smoke

1. 未登录访问 `https://yuke.verinasci.com` → Access 登录页。
2. 用 Super Admin 邮箱 OTP 登录。
3. Admin UI 应通过真实 API 加载，不显示 Mock synthetic 数据。
4. DevTools Network：
   - API origin = `https://api.yuke.verinasci.com`
   - preflight OPTIONS = 204（需要 preflight 的写请求）
   - Admin API 请求由 `yuke-api` Worker 校验 Access JWT。
5. 未预置的普通邮箱即使通过 Access OTP，也不能获得 Admin API 数据。

## 6. Gate

- `yuke-admin` Worker Static Assets 已部署；
- `yuke.verinasci.com` Custom Domain Active；
- Static Assets 使用 SPA fallback；
- 一个 multi-domain Access Application 同时保护 Admin 页面与 Admin API path；
- Eager redirect cookie 开启；
- API Access Application 对 OPTIONS bypass 到 origin；
- `yuke-api` CORS 仅允许 `https://yuke.verinasci.com`，credentials enabled；
- Super Admin 首次登录可 bootstrap；
- 未预置普通邮箱 API 403。
