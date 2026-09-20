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

## D1 migration

本地验证示例：

```bash
wrangler d1 migrations apply <DATABASE_NAME> --local
```

远程 migration 必须通过受控环境执行，不得将真实 Database ID、Token 或导出数据提交到仓库。
