# Resource Domain / 预约资源领域

负责可预约对象、Slot 类型，以及后续 Slot / Slot Series。

## Catalog / Issue #21

### Resource

Resource 是通用“预约对象”，不绑定老师、教室等具体业务称谓。

Admin API：

- `GET /v1/admin/spaces/:spaceId/resources`
- `POST /v1/admin/spaces/:spaceId/resources`
- `PATCH /v1/admin/spaces/:spaceId/resources/:resourceId`
- `POST .../:resourceId/deactivate`
- `POST .../:resourceId/activate`

规则：

- Space Admin 只能管理自己有权限的 Space；
- Super Admin 继承所有 Space Admin 权限；
- 停用不删除历史；
- Admin 列表同时返回 active / inactive；
- Resource 名称在 MVP 不要求 Space 内唯一。

小程序 API：

- `GET /v1/spaces/:spaceId/resources`

只允许该 Space 的 active Membership 调用，并且只返回 active Resource。

### Slot Type

Admin API：

- `GET /v1/admin/spaces/:spaceId/slot-types`
- `POST /v1/admin/spaces/:spaceId/slot-types`
- `PATCH /v1/admin/spaces/:spaceId/slot-types/:slotTypeId`
- `POST .../:slotTypeId/deactivate`
- `POST .../:slotTypeId/activate`

规则：

- Slot Type 名称在同一 Space 内唯一；
- 已使用的类型不物理删除，只停用；
- 停用类型仍保留在 Admin 管理列表与历史关联中。

## 后续

Issue #24 起在此领域实现具体 Slot、冻结和时间重叠约束；Issue #25/#26 实现周期规则、物化与三种周期编辑范围。
