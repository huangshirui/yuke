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
