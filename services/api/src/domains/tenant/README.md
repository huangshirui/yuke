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
