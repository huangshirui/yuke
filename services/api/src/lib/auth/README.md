# Admin authentication / 管理端认证

## Boundary / 边界

Cloudflare Access 负责**认证（authentication）**，Yu言在线 D1 负责**授权（authorization）**。

- Worker 从 `Cf-Access-Jwt-Assertion` 读取 Access application token。
- Worker 验证 RS256 签名、issuer、application audience、`exp` / `nbf`。
- JWT `sub` 映射 `admin_users.access_subject`。
- 有效 Access JWT **不会自动创建 AdminUser**。
- 未分配 AdminUser 或 AdminUser 已停用：403 `SPACE_ACCESS_DENIED`。
- 缺失 / 无效 JWT：401 `UNAUTHENTICATED`。

## Runtime configuration / 运行时配置

Worker 需要以下运行时变量：

- `CF_ACCESS_TEAM_DOMAIN`：例如 `https://<team>.cloudflareaccess.com`
- `CF_ACCESS_AUD`：Access Application Audience tag

真实值属于部署环境配置，不得写入公开仓库。

## Authorization / 授权

路由 middleware：

- `requireAdminAccess`：要求已认证且 D1 中存在 active AdminUser。
- `requireSuperAdmin`：要求 `platform_role = super_admin`。
- `requireSpaceAdmin()`：Super Admin 自动通过；普通管理员必须存在对应 `space_admins` 关系。

典型用法：

```ts
app.get(
  '/v1/admin/spaces/:spaceId/settings',
  handler,
  [requireAdminAccess, requireSpaceAdmin()]
)
```

Super Admin-only：

```ts
app.post(
  '/v1/admin/spaces',
  handler,
  [requireAdminAccess, requireSuperAdmin]
)
```

## Security notes / 安全说明

- 不信任 JWT payload，必须先校验签名与 issuer/audience。
- 使用稳定的 `sub` 做身份键，不使用 email 作为授权键。
- JWK 按 team domain 短时缓存；遇到未知 `kid` 会强制刷新一次，以支持 Cloudflare signing-key rotation。
- 对客户端不返回 JWT 校验的内部失败细节。
