# Yu言在线 API Service

Cloudflare Workers Backend。

## 领域

- `identity`：微信用户与 Cloudflare Access 管理员身份
- `tenant`：Space、Membership、Admin、Invite、Settings
- `resource`：Resource、Slot Type、Slot Series、Slot
- `reservation`：Participant、Booking、Message、History、Reconciliation

稳定设计：

- [领域模型](../../docs/domain-model.md)
- [API Contract](../../docs/api-contract.md)
- [首版 D1 Schema](migrations/0001_initial.sql)

## Runtime foundation

Worker 运行时基础位于 `src/lib`：

- `router.ts`：轻量 Router，支持参数路由、全局 middleware 与 route middleware。
- `errors.ts`：稳定 API error code → HTTP status 映射与 `AppError`。
- `http.ts`：统一 `ApiResponse<T>` JSON 响应。
- `validation.ts`：JSON Body 和基础字段解析；校验失败统一为 `VALIDATION_ERROR`。
- `middleware.ts`：错误边界与 request ID middleware。

`/health` 通过正式 Router 提供，不再绕过运行时基础设施。

当前 P0 不引入第三方 Router / Schema 库；领域路由直接复用上述基础能力与 `@yuke/shared` Contract。后续若框架收益明确，再通过 ADR 评估替换。

## D1 local binding

公开仓库中的 `wrangler.toml` 定义了统一绑定名 `DB`，数据库名为 `yuke-local`。

`database_id` 使用全零 UUID 作为**合成占位符**。它不是任何真实 Cloudflare Resource ID。所有本地命令都显式使用 `--local`，因此访问的是 Wrangler/Miniflare 的本地 D1 状态，不会访问远程数据库。

真实远程 D1 ID 必须在后续部署流程中通过受控环境提供，不得提交到公开仓库。

## D1 migration

在仓库根目录安装依赖后：

```bash
pnpm --filter @yuke/api d1:migrate:local
```

该命令把 `services/api/migrations` 中尚未执行的 migrations 应用到本地持久化 D1。

要从**全新临时数据库**验证全部 migration、外键、Trigger 与关键唯一索引：

```bash
pnpm --filter @yuke/api d1:verify:local
```

验证脚本会：

1. 创建临时 local D1 state；
2. 连续执行两次 migration，验证可重复执行；
3. 检查 `d1_migrations`、代表性 table/index/trigger；
4. 验证 foreign key enforcement；
5. 验证 `SLOT_OVERLAP` Trigger；
6. 验证 Booking `capacity=1` partial unique index；
7. 删除临时 state。

仓库根目录执行 `pnpm test` 时也会执行这项验证。

> 不要把 `--local` 改成 `--remote` 作为日常开发命令。远程 migration 必须通过后续受控发布流程执行，并明确指定真实数据库与环境。


## Mini Program identity runtime

Issue #14 使用以下运行时 binding / secret：

- `DB` — D1
- `AVATARS` — private R2 bucket
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `USER_TOKEN_SECRET` — 至少 32 bytes 的随机值

公开 `wrangler.toml` 里的 R2 bucket name 仅为 local/CI 合成占位符。生产环境必须使用受控部署配置与 Secret。

当前小程序身份接口：

- `POST /v1/auth/wechat/session`
- `GET /v1/me`
- `PATCH /v1/me/profile`
- `POST /v1/me/avatar`
- `GET /v1/me/avatar`
