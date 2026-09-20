# Yu言在线 · Admin Worker Static Assets + Service Binding + Cloudflare Access Runbook

> 对应 GitHub #55。Admin 浏览器只访问 `yuke.verinasci.com`；`yuke-admin` 同时承载 Vue Static Assets 和极薄的 Admin Gateway，Gateway 通过 Cloudflare Service Binding 内部调用独立 `yuke-api`。

## 1. 最终拓扑

```text
WeChat Mini
  │ HTTPS + project Bearer token
  ▼
https://api.yuke.verinasci.com/v1/*
  │
  ▼
yuke-api Worker
  ├─ D1
  └─ R2


Admin Browser
  │ HTTPS + Cloudflare Access
  ▼
https://yuke.verinasci.com
  │
  ├─ Static Assets
  │
  └─ /api/v1/admin/*
       │ yuke-admin Gateway
       │ Service Binding: API -> yuke-api
       ▼
     yuke-api /v1/admin/*
       ├─ verify Cf-Access-Jwt-Assertion
       └─ D1 AdminUser / Space RBAC
```

核心边界：

- Mini 继续使用公开 `api.yuke.verinasci.com`。
- Admin 浏览器**不再直接请求** `api.yuke.verinasci.com`。
- Admin 只使用同源 `/api/*`。
- `yuke-admin` 不实现业务逻辑，只做 Admin 路径收口、Access JWT 必需检查和 Service Binding 转发。
- `yuke-api` 仍是唯一业务 API 与授权实现。
- 不再需要 Admin 浏览器 CORS。

## 2. yuke-admin Worker

`apps/admin/wrangler.toml`：

```toml
name = "yuke-admin"
main = "./worker/index.js"
workers_dev = false
preview_urls = false

[assets]
directory = "./dist"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]

[[services]]
binding = "API"
service = "yuke-api"

[[routes]]
pattern = "yuke.verinasci.com"
custom_domain = true
```

只有 `/api/*` 必须先运行 Worker script；静态文件继续直接由 Static Assets 服务。

Gateway 只接受 `/api/v1/admin` 与其子路径：

1. 必须存在 `Cf-Access-Jwt-Assertion`；
2. 去掉 `/api` 前缀；
3. 不把 Access Cookie / Origin / Referer 下传；
4. 显式保留 Access JWT；
5. 通过 `env.API.fetch()` Service Binding 调用 `yuke-api`。

## 3. Production build / deploy

Git Bash：

```bash
git switch main
git pull --ff-only
pnpm install

export VITE_ADMIN_DATA_MODE=api
export VITE_API_BASE_URL=/api

pnpm --filter @yuke/admin deploy:production
```

生产构建会拒绝：

- mock mode；
- `https://api.yuke.verinasci.com` 等公网直连；
- 任何不是精确 `/api` 的 API base。

## 4. Cloudflare Access（人工）

Access Application 只需要：

```text
yuke.verinasci.com
```

Identity provider：

- One-time PIN / Email OTP

授权规则仍是：

- Access = authentication；
- Yu言在线 D1 AdminUser / Space RBAC = authorization。

### 从旧 multi-domain 配置收敛

如果 #55 前一步已经添加：

```text
api.yuke.verinasci.com/v1/admin/*
```

从同一 Access Application 中删除这个第二 hostname。

以下设置不再是必需条件，可以恢复默认/关闭：

- Eager redirect cookie；
- Bypass OPTIONS requests to origin。

原因：浏览器不再跨域访问 API，也不会再产生 Admin CORS preflight。

## 5. yuke-api Access runtime values

`yuke-api` 仍负责验证 Access JWT，因此保留：

- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUD`
- `SUPER_ADMIN_EMAIL`

其中 AUD 对应保护 `yuke.verinasci.com` 的 Access Application。

真实值继续使用 Wrangler secret prompt，不进入 Git、Issue 或聊天。

```bash
pnpm --filter @yuke/api exec wrangler secret put CF_ACCESS_TEAM_DOMAIN --config .wrangler/production.toml
pnpm --filter @yuke/api exec wrangler secret put CF_ACCESS_AUD --config .wrangler/production.toml
pnpm --filter @yuke/api exec wrangler secret put SUPER_ADMIN_EMAIL --config .wrangler/production.toml
```

## 6. 发布顺序

架构切换时建议：

1. 先部署包含 CORS 清理但仍保持公开 Mini API 的 `yuke-api`；
2. 再部署带 Service Binding Gateway 的 `yuke-admin`；
3. Access Application 删除 API hostname；
4. 浏览器 smoke。

对应命令：

```bash
pnpm --filter @yuke/api production:config
pnpm --filter @yuke/api deploy:production

export VITE_ADMIN_DATA_MODE=api
export VITE_API_BASE_URL=/api
pnpm --filter @yuke/admin deploy:production
```

## 7. Smoke

登录 `https://yuke.verinasci.com` 后，在 DevTools Network 验证：

```text
GET /api/v1/admin/spaces
```

预期：

- 请求 Host 只有 `yuke.verinasci.com`；
- 不出现浏览器对 `api.yuke.verinasci.com` 的 Admin 请求；
- 不需要 OPTIONS CORS preflight；
- API 正常返回真实 D1 数据；
- `yuke-api` 继续验证 Access JWT。

再验证公网 API：

```bash
curl -i https://api.yuke.verinasci.com/v1/admin/spaces
```

未提供有效 Access JWT 时应返回 API 侧未认证语义，而不是 Access 登录页；Mini 的非 Admin API 保持公开网络可达。

## 8. Gate

- `yuke-admin` Static Assets 正常；
- `/api/*` selective `run_worker_first` 正常；
- `API -> yuke-api` Service Binding 正常；
- Admin production build 固定同源 `/api`；
- Access 只保护 `yuke.verinasci.com`；
- Admin 浏览器无跨域请求、无 CORS 依赖；
- Access JWT 经 Gateway 传递并由 `yuke-api` 验证；
- Super Admin bootstrap 正常；
- 未预置普通邮箱仍返回 403；
- Mini 继续通过 `api.yuke.verinasci.com` 正常使用。
