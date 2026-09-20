# Admin authentication / 管理端认证

## Boundary / 边界

Cloudflare Access 负责**认证（authentication）**，Yu言在线 D1 负责**授权（authorization）**。

- Worker 从 `Cf-Access-Jwt-Assertion` 读取 Access application token。
- Worker 验证 RS256 签名、issuer、application audience、`exp` / `nbf`。
- 已绑定管理员使用 JWT `sub` 映射 `admin_users.access_subject`。
- 普通管理员必须由 Super Admin 先按邮箱预置；首次 Access 登录才把已预置 AdminUser 绑定到稳定 `sub`。
- 配置为 `SUPER_ADMIN_EMAIL` 的邮箱可在首次 Access 登录时自动 bootstrap 为唯一稳定的 Super Admin identity。
- 未预置普通邮箱不会自动注册为 Admin。
- AdminUser 已停用：403 `SPACE_ACCESS_DENIED`。
- 缺失 / 无效 JWT：401 `UNAUTHENTICATED`。

## Runtime configuration / 运行时配置

Worker 需要以下运行时变量：

- `CF_ACCESS_TEAM_DOMAIN`：例如 `https://<team>.cloudflareaccess.com`
- `CF_ACCESS_AUD`：Access Application Audience tag
- `SUPER_ADMIN_EMAIL`：实际 Super Admin 邮箱，仅存在受控运行时配置

真实值属于部署环境配置，不得写入公开仓库。

## Admin identity lifecycle / 管理员身份生命周期

`admin_users.identity_status`：

- `pending`：Super Admin 已按邮箱创建，但该用户尚未完成首次 Access 登录绑定。
- `bound`：已经绑定到稳定 Access `sub`。

预置普通 Admin 时会立即生成稳定项目 `admin_users.id`，因此可以在其首次登录前分配 Space；首次登录只绑定 Access identity，不改变项目 Admin ID。

Super Admin-only API：

- `GET /v1/admin/admin-users`
- `POST /v1/admin/admin-users`，Body: `{ "email": "..." }`

## Authorization / 授权

路由 middleware：

- `requireAdminAccess`：要求 Access JWT 有效，并可解析为 active + bound AdminUser。
- `requireSuperAdmin`：要求 `platform_role = super_admin`。
- `requireSpaceAdmin()`：Super Admin 自动通过；普通管理员必须存在对应 `space_admins` 关系。

## Security notes / 安全说明

- 不信任 JWT payload，必须先校验签名与 issuer/audience。
- email **只用于首次 bootstrap / pending identity 匹配**；完成绑定后授权仍以稳定 `sub` 为身份键。
- 已 bound 的 AdminUser 不会因为另一个 Access `sub` 使用相同 email 而自动重绑。
- JWK 按 team domain 短时缓存；遇到未知 `kid` 会强制刷新一次，以支持 Cloudflare signing-key rotation。
- 对客户端不返回 JWT 校验的内部失败细节。
