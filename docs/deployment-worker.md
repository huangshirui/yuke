# Yu言在线 · Worker 首次线上部署 Runbook

> 对应 GitHub #54。目标是建立第一个真实 Cloudflare Worker + D1 + R2 在线环境。  
> **本页不会要求把任何 Secret、D1 UUID、Cloudflare Account/Zone ID 发到聊天、Issue 或 Git。**

## 1. 当前边界

Phase 0 的 `services/api/wrangler.toml` 只用于 Local / CI，包含明显的 synthetic 占位符，不能直接用于生产部署。

线上环境使用本机生成的：

```text
services/api/.wrangler/production.toml
```

根目录 `.gitignore` 已排除整个 `.wrangler/`，因此真实 D1 UUID / R2 bucket name 不进入公开 Git 历史。

API Custom Domain 固定为：

```text
api.yuke.verinasci.com
```

## 2. #54 中必须人工完成的步骤

以下操作需要项目所有者的 Cloudflare Account 权限，因此必须人工执行。

### M1 · 登录正确的 Cloudflare Account

在仓库根目录：

```bash
pnpm --filter @yuke/api exec wrangler whoami
```

如果没有登录：

```bash
pnpm --filter @yuke/api exec wrangler login
```

确认终端显示的是准备承载 Yu言在线的 Cloudflare Account。

> 不要把 Account ID 粘贴到公开 Issue、PR 或聊天。

### M2 · 创建远程 D1

示例名称可以使用 `yuke-prod`，也可以按账号现有命名规范选择：

```bash
pnpm --filter @yuke/api exec wrangler d1 create yuke-prod
```

命令会输出数据库名称与 UUID。**只保存在本机**。

### M3 · 创建 private R2 bucket

例如：

```bash
pnpm --filter @yuke/api exec wrangler r2 bucket create yuke-avatars-prod
```

R2 bucket 默认不是公开 bucket；头像继续只通过 Worker 鉴权读取。

### M4 · 在当前终端临时设置资源变量

PowerShell：

```powershell
$env:YUKE_D1_DATABASE_NAME="<刚创建的数据库名称>"
$env:YUKE_D1_DATABASE_ID="<刚创建的 D1 UUID>"
$env:YUKE_R2_BUCKET_NAME="<刚创建的 R2 bucket 名称>"
```

macOS / Linux：

```bash
export YUKE_D1_DATABASE_NAME="<刚创建的数据库名称>"
export YUKE_D1_DATABASE_ID="<刚创建的 D1 UUID>"
export YUKE_R2_BUCKET_NAME="<刚创建的 R2 bucket 名称>"
```

这些值不要写进 tracked `.env`、README、Issue 或 PR。

## 3. GitHub Actions 受控生产发布

生产 API 使用独立 Workflow：

```text
.github/workflows/deploy-api.yml
```

当前策略刻意保持为 **manual-only / 仅手动触发**，不在 merge 到 `main` 后自动发布。原因是 API 可能与 D1 migration 同时变化，发布风险高于 Admin。

Job 使用 GitHub Environment `production-api`。建议在该 Environment 配置 required reviewer，并录入：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `YUKE_D1_DATABASE_NAME`
- `YUKE_D1_DATABASE_ID`
- `YUKE_R2_BUCKET_NAME`

这些值均属于受保护部署配置，不进入 Git。Wrangler 的 deploy / remote migration 输出也不进入公开 CI Log，避免暴露 deployment/resource metadata。

手动运行 `Deploy API Production` 时有一个布尔输入：

```text
apply_migrations
```

- 无 D1 schema 变化：保持 `false`；
- 本次发布包含尚未执行的 migration：明确选择 `true`，先 remote migration，再 deploy Worker；
- migration 或 deploy 任一步失败都会停止后续步骤；
- Worker 发布成功后自动执行 `/health` smoke。

Runtime Secrets（例如微信 Secret、Cloudflare Access AUD、Super Admin 邮箱）继续保存在 Worker Secret 中；普通 `wrangler deploy` 不应把它们写入 GitHub Secrets 或仓库配置。

## 4. 本机受控发布 fallback

上述四步完成后仍可在本机执行：

### A1 · 生成受控生产配置

```bash
pnpm --filter @yuke/api production:config
```

输出：

```text
services/api/.wrangler/production.toml
```

可以在本机检查，但不要提交。

### A2 · 远程执行 D1 migrations

```bash
pnpm --filter @yuke/api d1:migrate:remote
```

Wrangler 会只应用尚未执行的 migration。

### A3 · 首次部署 Worker + Custom Domain

```bash
pnpm --filter @yuke/api deploy:production
```

生产配置声明 `api.yuke.verinasci.com` 为 Worker Custom Domain。若该 hostname 已有冲突 DNS / Worker route，需要先在 Cloudflare 控制台处理冲突，再重试。

### A4 · Smoke

```bash
pnpm --filter @yuke/api smoke:production
```

预期：

```text
Production health check passed: https://api.yuke.verinasci.com/health
```

## 5. Runtime Secret 不在 #54 首次 health deploy 中强制

Worker 的 `/health` 不依赖微信或 Access Secret，因此 #54 不与 #55/#56 形成循环依赖。

后续分阶段录入：

### #55 Admin / Cloudflare Access

- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUD`
- `SUPER_ADMIN_EMAIL`

### #56 WeChat 真机联调

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `USER_TOKEN_SECRET`

录入 Secret 时使用 Wrangler 的交互式 prompt，例如：

```bash
pnpm --filter @yuke/api exec wrangler secret put WECHAT_APP_SECRET --config .wrangler/production.toml
```

不要通过命令行 `--value`、shell history、Git 或聊天传 Secret。

> Wrangler 的 `secret put` 会创建并立即部署一个新的 Worker version，因此首个基础 Worker 先由 #54 部署，再由 #55/#56 按功能依赖补 Secret。

## 6. #54 完成 Gate

- 真实 D1 已创建；
- 真实 private R2 已创建；
- production.toml 仅存在本机 ignored 路径；
- D1 migrations 已远程应用；
- Worker 已部署；
- `https://api.yuke.verinasci.com/health` 返回正常；
- Git / PR / CI log 未出现真实 D1 UUID、Secret、Access subject 或用户数据。

完成本 Gate 后，#55 与 #56 才进行真实身份链路 smoke。
