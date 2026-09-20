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

## D1 migration

本地验证示例：

```bash
wrangler d1 migrations apply <DATABASE_NAME> --local
```

远程 migration 必须通过受控环境执行，不得将真实 Database ID、Token 或导出数据提交到仓库。
