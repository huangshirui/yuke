# Yu言在线 Web Admin

Vue 3 + Vite + TypeScript 的运营管理后台。

所有页面视觉与交互实现遵循仓库根目录 [DESIGN.md](../../DESIGN.md)。

## MVP 当前能力

Issue #19 提供 Space / Invite 的第一版管理界面：

- Space 列表、创建、启用/停用
- Space 预约/取消截止规则
- Space Admin 分配/移除
- Invite 创建、撤销、复制及来源用户查看

## 数据模式

为允许前后端并行，Admin 使用统一 `AdminApi` adapter。默认使用：

```text
VITE_ADMIN_DATA_MODE=mock
```

Mock 仅包含仓库内 Synthetic Data，不访问真实后端。

后端 #15～#17 就绪后可切换：

```text
VITE_ADMIN_DATA_MODE=api
VITE_API_BASE_URL=https://<public-api-host>
```

不要把真实基础设施地址、Token、用户数据写入仓库或示例。

## 当前 Contract 缺口

Space Admin 的现有 Contract 允许用 `adminUserId` 分配管理员，但尚未定义管理员目录/搜索接口。
因此当前 UI 严格按 Contract 使用管理员 ID 输入，不私自增加 API；后续由 #15/#16 决定是否补充可搜索的管理员目录。

## 开发

```bash
pnpm --filter @yuke/admin dev
pnpm --filter @yuke/admin build
pnpm --filter @yuke/admin test
```

Cloudflare Access 负责 Web 登录；Admin 前端不实现自己的密码登录页。
