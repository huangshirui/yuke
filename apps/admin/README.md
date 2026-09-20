# Yu言在线 Web Admin

Vue 3 + Vite + TypeScript 的运营管理后台。

所有页面视觉与交互实现遵循仓库根目录 [DESIGN.md](../../DESIGN.md)。

## MVP 当前能力

Issue #19 提供 Space / Invite 的第一版管理界面，Issue #23 在同一个 Space 上下文中补充基础运营能力：

- Space 列表、创建、启用/停用
- Space 预约/取消截止规则
- Space Admin 分配/移除
- Invite 创建、撤销、复制及来源用户查看
- Resource（预约对象）新建、编辑、停用/启用
- Slot Type（时段类型）新建、编辑、停用/启用
- 用户列表按来源管理员 / 邀请码筛选
- Participant 查看以及用户 / 参与人内部备注维护

## 数据模式

为允许前后端并行，Admin 使用统一 `AdminApi` adapter。默认使用：

```text
VITE_ADMIN_DATA_MODE=mock
```

Mock 仅包含仓库内 Synthetic Data，不访问真实后端。

线上构建只需要：

```text
VITE_ADMIN_DATA_MODE=api
```

生产 Admin 的 API base 已在代码中固定为同源 `/api`，不再通过环境变量配置。这样可以避免 Windows Git Bash / MSYS 将 `/api` 自动转换为本地文件路径，也禁止生产 Admin 误切回公网 API。

不要把真实基础设施地址、Token、用户数据写入仓库或示例。

## Contract 边界

- Space Admin 仍严格按现有 Contract 使用 `adminUserId` 分配，不私自增加管理员目录接口。
- Resource / Slot Type 直接使用 shared Contract 中的领域类型。
- 用户运营页面只调用既有 `/admin/spaces/{spaceId}/members`、成员详情和 admin note API；前端 adapter 负责页面需要的读取模型，不修改领域语义。
- Admin 内部备注与用户可见备注始终分离，内部备注不会进入小程序展示。

## 开发

```bash
pnpm --filter @yuke/admin dev
pnpm --filter @yuke/admin build
pnpm --filter @yuke/admin test
```

Cloudflare Access 负责 Web 登录；Admin 前端不实现自己的密码登录页。


## Online deployment

首次 Workers Static Assets + Cloudflare Access 联调见 [docs/deployment-admin.md](../../docs/deployment-admin.md)。

Cloudflare Access 只保护 `yuke.verinasci.com`。Admin 浏览器请求同源 `/api/v1/admin/*`，由 `yuke-admin` 通过 Service Binding 调用 `yuke-api`；不再需要 Admin 跨域 CORS、第二个 Access hostname、Eager redirect 或 OPTIONS bypass。


### Production deploy / 生产部署

Admin 使用独立的 `yuke-admin` Cloudflare Worker Static Assets，不使用 Pages，也不与 API Worker 合并：

```bash
export VITE_ADMIN_DATA_MODE=api
pnpm --filter @yuke/admin deploy:production
```

`apps/admin/wrangler.toml` 将 `dist` 作为 Static Assets；只有 `/api/*` 使用 `run_worker_first` 进入 Gateway，并通过 `API -> yuke-api` Service Binding 内部转发。其余静态资源继续直接由 Static Assets 提供。
