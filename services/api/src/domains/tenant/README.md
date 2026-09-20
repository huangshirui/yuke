# Tenant Domain / 租户领域

负责 Space、租户隔离与后续 Membership / Invite 能力。

## Space

Issue #16 实现：

- Super Admin 创建、修改、停用、启用 Space；
- Space 创建时原子创建 `space_settings`；
- Space timezone 必须是有效 IANA time zone；
- booking / cancellation cutoff 使用共享固定枚举；
- Super Admin 分配 / 移除 Space Admin；
- Space Admin 可读取和修改自己 Space 的 Settings；
- `GET /v1/admin/spaces`：Super Admin 返回全部 Space，普通 Admin 只返回 `space_admins` 已分配的 Space。

Space `disabled` 不删除历史数据。是否允许终端用户预约由后续 booking/resource domain 检查；管理员仍可查看和维护 Settings。

## Admin provisioning

本 Issue 只管理已有 `admin_users` 与 Space 的授权关系，不负责创建 AdminUser。AdminUser 的 bootstrap / provisioning 属于管理身份生命周期，不通过“有效 Access JWT 自动注册”隐式完成。

## Invite / Membership

Issue #17 实现：

- Space Admin 创建多个邀请码；邀请码只限制有效期，不限制加入人数；
- InviteCode 保存创建管理员，Membership 固化 `invited_by_admin_id` 与 `invite_code_id`；
- 邀请码撤销后已加入 Membership 不受影响；
- 过期邀请码返回 `INVITE_EXPIRED`，撤销邀请码返回 `INVITE_REVOKED`；
- Disabled Space 不接受新的邀请码加入，返回 `SPACE_DISABLED`；
- 同一 User 重复加入同一 Space 为幂等操作，不创建第二条 Membership，也不覆盖最初邀请来源；
- 加入 Space 后把该 Space 设为当前 Space；
- `GET /v1/me/spaces` 与 `PUT /v1/me/current-space` 为小程序 Space 切换提供后端能力；
- Invite member 查询返回来源管理员、来源邀请码和参与人数，供 Admin UI 展示。

Invite code 使用 Web Crypto 生成 144-bit 随机值；仓库 Fixture 不使用任何真实邀请码。
