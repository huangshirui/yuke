# Yu言在线 MVP API Contract

> Base path: `/v1`。所有响应使用 `ApiResponse<T>`。本文定义稳定的 HTTP 语义，具体路由框架可后续替换。

## 1. 通用规则

### 1.1 时间

- API 时间戳：ISO 8601 UTC，例如 `2026-09-20T08:00:00Z`。
- 日期：`YYYY-MM-DD`。
- 出生年月：`YYYY-MM`。
- 周期本地时间：`HH:mm`。
- weekday：ISO weekday，`1 = Monday ... 7 = Sunday`。

### 1.2 Space Scope

小程序和管理员的 Space 级请求都显式包含 `spaceId`。

服务端必须验证当前身份对该 Space 的 Membership / Admin 权限，不信任客户端只传一个 ID。

### 1.3 错误

常见错误码：

| HTTP | code | 含义 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 请求字段非法 |
| 401 | `UNAUTHENTICATED` | 未登录或令牌失效 |
| 403 | `SPACE_ACCESS_DENIED` | 无 Space 权限 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `SLOT_ALREADY_BOOKED` | Slot 已被他人占用 |
| 409 | `SLOT_OVERLAP` | Resource 时间冲突 |
| 409 | `SLOT_FROZEN` | Slot 已冻结 |
| 409 | `SLOT_NOT_BOOKABLE` | Slot 不可预约 |
| 409 | `BOOKING_CUTOFF_REACHED` | 已超过最晚预约时间 |
| 409 | `CANCELLATION_CUTOFF_REACHED` | 已超过用户可取消时间 |
| 409 | `SERIES_BOOKING_CONFLICT` | 周期批量修改碰到已有预约 |
| 409 | `INVITE_EXPIRED` | 邀请码过期 |
| 409 | `INVITE_REVOKED` | 邀请码已撤销 |
| 409 | `SPACE_DISABLED` | Space 已停用 |
| 500 | `INTERNAL_ERROR` | 未预期的服务端错误；不向客户端暴露内部异常细节 |

对于用户并发预约失败，小程序可将 `SLOT_ALREADY_BOOKED` 映射为：
“这个时间刚刚被预约了，请选择其他时间。”

## 2. 小程序认证与用户

### POST /auth/wechat/session

Body:

```json
{ "code": "wx-login-temporary-code" }
```

Worker 使用运行时 Secret 调用微信 `code2Session`，只持久化 OpenID / 可选 UnionID；微信 `session_key` 不落库、不记录日志、不返回客户端。

返回 24 小时项目 Bearer Token 与用户初始化状态：

```json
{
  "tokenType": "Bearer",
  "accessToken": "<signed-project-token>",
  "expiresAt": "2026-09-21T08:00:00.000Z",
  "user": {
    "id": "usr_synthetic",
    "nickname": "",
    "avatarUrl": null,
    "profileInitialized": false,
    "currentSpaceId": null,
    "spaces": []
  }
}
```

除登录接口外，小程序用户接口使用：

```http
Authorization: Bearer <signed-project-token>
```

### GET /me

返回当前用户头像、昵称、Profile 初始化状态、当前 Space 与已加入 Space 摘要。

`profileInitialized = true` 仅当昵称非空且已设置头像。

### PATCH /me/profile

可更新：

```json
{
  "nickname": "示例昵称"
}
```

昵称长度 1–64。

### POST /me/avatar

multipart 上传已经在小程序端压缩的头像，字段名固定为 `file`。

MVP 服务端限制：

- JPEG / PNG / WebP；
- 最大 1 MiB；
- 写入私有 R2；
- D1 只保存 `avatar_object_key`；
- 上传新头像成功后替换 D1 引用，并尽力清理旧 R2 对象。

返回更新后的 `UserProfile`。

### GET /me/avatar

认证后读取当前用户头像。头像不要求配置公开 R2 URL；响应使用 private/no-cache 策略与对象 ETag。

### PUT /me/current-space

```json
{ "spaceId": "sp_xxx" }
```

仅允许切换到当前用户已有 active Membership 的 Space。

## 3. Space 与邀请

### POST /spaces/join

```json
{ "inviteCode": "high-entropy-invite-code" }
```

规则：

- 需要小程序 Bearer Token；
- InviteCode 只限制有效期，不限制使用人数；
- 成功后建立 Membership，并固化最初的 `inviteCodeId` 与 `invitedByAdminId`；
- 同一 User 再次加入同一 Space 为幂等操作，不创建第二条 Membership，也不覆盖原来源；
- 成功加入后自动把该 Space 设为当前 Space；
- revoked → `INVITE_REVOKED`；
- expired → `INVITE_EXPIRED`；
- Space disabled → `SPACE_DISABLED`。

返回 Membership、Space 摘要和 `currentSpaceId`。

### GET /me/spaces

需要小程序 Bearer Token。列出当前用户所有 active Membership 对应的 Space；Space 本身可能是 disabled，以便客户端显示停用状态。

### PUT /me/current-space

```json
{ "spaceId": "sp_xxx" }
```

只允许切换到当前用户已有 active Membership 的 Space；不满足时返回 `SPACE_ACCESS_DENIED`。

## 4. Participant

### GET /spaces/{spaceId}/participants
### POST /spaces/{spaceId}/participants

```json
{
  "name": "示例参与人",
  "birthMonth": "2012-09",
  "note": "合成示例备注"
}
```

### PATCH /spaces/{spaceId}/participants/{participantId}

修改名称、出生年月、用户备注。

### POST /spaces/{spaceId}/participants/{participantId}/deactivate
### POST /spaces/{spaceId}/participants/{participantId}/activate

不提供物理删除。

## 5. Resource 与可预约 Slot

### GET /spaces/{spaceId}/resources

仅返回 active Resource。

### GET /spaces/{spaceId}/resources/{resourceId}/slots?from=YYYY-MM-DD&to=YYYY-MM-DD

服务端在读取前确保指定日期范围内的周期 Slot 已幂等物化。

默认仅返回用户可见 Slot；每条包含：

- Slot ID
- Resource 摘要
- Slot Type
- start/end
- status
- bookable

`bookable` 同时考虑：

- Space active
- Resource active
- Slot open
- 尚无有效 Booking
- 未超过 booking cutoff

## 6. Booking / 小程序

### POST /spaces/{spaceId}/bookings

```json
{
  "slotId": "slot_xxx",
  "participantId": "par_xxx"
}
```

服务端按顺序校验：

1. Membership active；
2. Participant 属于当前 Membership 且 active；
3. Space / Resource active；
4. Slot open；
5. 未超过 booking cutoff；
6. 尝试写入 Booking。

第 6 步数据库 partial unique index 是并发下的最终裁决。

### GET /spaces/{spaceId}/bookings

Query 可用：

- `from`
- `to`
- `status`

`from/to` 使用 Slot 的 Space 本地日期（`YYYY-MM-DD`）。接口只返回当前 active Membership 自己创建的 Booking。

日程视图与三日视图都由相同列表接口驱动，不为 UI 视图定义两个后端模型。

列表与详情均返回 Booking 基础字段以及 Participant、Resource、Slot Type、具体 Slot 时间摘要。

### GET /spaces/{spaceId}/bookings/{bookingId}

只允许读取当前 Membership 自己的 Booking；其他 Membership 的 Booking 按 `NOT_FOUND` 处理，避免泄漏存在性。

### POST /spaces/{spaceId}/bookings/{bookingId}/cancel

无 Body。

规则：
- 仅 `booked` 状态可由用户取消；
- Space `cancellationCutoffMinutes` 非 null 时，达到截止点后返回 `CANCELLATION_CUTOFF_REACHED`；
- null 表示不设置取消时间限制；
- Slot 是否 Frozen 不改变已有 Booking 的取消规则；
- 取消后 Booking 不再占用 capacity；如果 Slot 仍为 Frozen，则依然不能产生新预约；
- 成功取消写入 `booking_history`。

### GET /spaces/{spaceId}/bookings/{bookingId}/messages
### POST /spaces/{spaceId}/bookings/{bookingId}/messages

```json
{ "body": "示例留言" }
```

用户只能操作自己 Membership 下的 Booking。

## 7. Admin Auth

`/admin/*` 由 Cloudflare Access 保护。

Worker 必须验证 Access JWT。管理员身份生命周期：

- 已绑定 AdminUser：按稳定 Access `sub` 映射。
- Super Admin：运行时 `SUPER_ADMIN_EMAIL` 命中的 Access 身份首次登录时自动 bootstrap，并绑定稳定 `sub`。
- 普通 Admin：必须由 Super Admin 先按邮箱预置；首次 Access 登录时只绑定到该既有 AdminUser，不创建新的项目身份。
- 未预置普通邮箱返回 403；已经 bound 的 AdminUser 不自动改绑到不同 `sub`。

### GET /admin/admin-users

仅 Super Admin。列出后台用户，包括：

- id（内部关联字段，不在运营 UI 展示）
- displayName（友好用户名称，可为空以兼容历史数据）
- email（登录邮箱）
- platformRole
- status
- identityStatus: `pending | bound`

### POST /admin/admin-users

仅 Super Admin。按邮箱显式创建/读取普通 AdminUser：

```json
{ "displayName": "Synthetic Operator", "email": "synthetic-admin@example.invalid" }
```

新建普通后台用户的 `identityStatus = pending`；稳定内部 ID 在首次登录前即存在，因此可提前分配 Space。运营 UI 以 `displayName` 为主、邮箱为次级信息。

### PATCH /admin/admin-users/{adminUserId}

仅超级用户。修改后台用户的友好名称：

```json
{ "displayName": "Synthetic Operator Renamed" }
```

名称用于运营界面主要展示，不改变登录邮箱或空间授权关系。

## 8. Space / Admin

### GET /admin/spaces

所有 active AdminUser 均可调用：

- Super Admin 返回全部 Space；
- 普通 Admin 只返回 `space_admins` 已分配的 Space。

该接口仅提供“当前管理员可见 Space 列表”，不会因为能看到 Space 就授予 Space 管理权限；后续 Space-scoped API 仍独立执行 RBAC。

### POST /admin/spaces

仅 Super Admin。

```json
{
  "name": "Synthetic Space",
  "timezone": "Asia/Shanghai",
  "bookingCutoffMinutes": 60,
  "cancellationCutoffMinutes": 240
}
```

- `timezone` 必须是有效 IANA time zone；
- 两个 cutoff 必须显式提供，`null` 表示不限；
- 创建 Space 与 Space Settings 必须原子完成。

### PATCH /admin/spaces/{spaceId}

仅 Super Admin，可修改：

```json
{
  "name": "Synthetic Renamed Space",
  "timezone": "Europe/Paris"
}
```

至少提供一个字段。

### POST /admin/spaces/{spaceId}/disable
### POST /admin/spaces/{spaceId}/activate

仅 Super Admin。停用不删除 Space 或历史数据。

### GET /admin/spaces/{spaceId}/admins

Super Admin 或该 Space 的 Space Admin 可读取，用于管理员列表与用户邀请来源展示。

### POST /admin/spaces/{spaceId}/admins

仅 Super Admin。底层 Space 授权关系继续按稳定 `adminUserId` 保存。Web Admin 的“分配管理员”交互按邮箱输入：先调用 `POST /admin/admin-users` 幂等预置/读取 AdminUser，再用返回的 ID 调用本接口，因此运营人员不需要输入 `adm_* ` 内部 ID。

POST：

```json
{ "adminUserId": "adm_xxx" }
```

目标必须是已经存在且 active 的 AdminUser。Access 登录本身不会自动创建 AdminUser。

### DELETE /admin/spaces/{spaceId}/admins/{adminUserId}

仅 Super Admin。只删除管理权限关系，不删除管理员身份，也不破坏历史邀请来源。

## 9. Space Settings

### GET /admin/spaces/{spaceId}/settings
### PATCH /admin/spaces/{spaceId}/settings

Super Admin 或该 Space 的 Space Admin 可以访问。

```json
{
  "bookingCutoffMinutes": 60,
  "cancellationCutoffMinutes": 240
}
```

PATCH 可以只提供其中一个字段；`null` 表示不限。固定枚举仍为 `15 / 30 / 60 / 240 / 1440 / null`。

Space 即使处于 `disabled`，管理员仍可维护 Settings；终端预约能力由后续 Resource / Booking domain 按 Space 状态阻断。

## 10. Invite Code / Admin

### GET /admin/spaces/{spaceId}/invites
### POST /admin/spaces/{spaceId}/invites

Super Admin 或该 Space 的 Space Admin 可访问。

```json
{
  "label": "示例渠道 A",
  "expiresAt": "2026-10-31T15:59:59Z"
}
```

- `label` 可为 null；
- `expiresAt` 必须是未来时间；
- 服务端使用 Web Crypto 生成 144-bit 随机邀请码；
- 邀请码没有人数/次数上限；
- 每个 Invite 保存 `createdByAdminId` 与累计 `memberCount`。

### POST /admin/spaces/{spaceId}/invites/{inviteId}/revoke

撤销只影响后续加入；既有 Membership 与来源数据保留。重复撤销为幂等操作。

### GET /admin/spaces/{spaceId}/invites/{inviteId}/members

查看通过该邀请码加入的 Membership，返回：

- membershipId
- nickname
- joinedAt
- participantCount
- invitedByAdminId
- inviteCodeId

## 11. Resource / Admin

### GET /admin/spaces/{spaceId}/resources

Super Admin 或该 Space 的 Space Admin 可访问。返回该 Space 的全部 Resource，包括 inactive，供管理和历史查看。

### POST /admin/spaces/{spaceId}/resources

```json
{
  "name": "示例预约对象",
  "note": "可选备注"
}
```

- `name` 必填，1–128 字符；
- `note` 可省略、字符串或 null；
- 新建后状态固定为 `active`；
- MVP 不要求 Resource 名称在 Space 内唯一。

### PATCH /admin/spaces/{spaceId}/resources/{resourceId}

可修改 `name` / `note`，至少提供一个字段。使用 `note: null` 清空备注。

### POST /admin/spaces/{spaceId}/resources/{resourceId}/deactivate
### POST /admin/spaces/{spaceId}/resources/{resourceId}/activate

软停用 / 启用，操作幂等。停用不删除历史关联；后续 Slot / Booking 领域必须阻止 inactive Resource 产生新的预约能力。

小程序 `GET /spaces/{spaceId}/resources` 仅允许 active Membership 调用，并且只返回 active Resource。

## 12. Slot Type / Admin

### GET /admin/spaces/{spaceId}/slot-types

Super Admin 或该 Space 的 Space Admin 可访问。返回 active + inactive Slot Type。

### POST /admin/spaces/{spaceId}/slot-types

```json
{
  "name": "示例类型"
}
```

Slot Type 名称在同一 Space 内唯一；不同 Space 可以同名。

### PATCH /admin/spaces/{spaceId}/slot-types/{slotTypeId}

MVP 仅修改 `name`。若目标名称在当前 Space 已存在，返回 `VALIDATION_ERROR`。

### POST /admin/spaces/{spaceId}/slot-types/{slotTypeId}/deactivate
### POST /admin/spaces/{spaceId}/slot-types/{slotTypeId}/activate

软停用 / 启用，操作幂等。已使用的 Slot Type 不物理删除，历史 Slot / Booking 关联保留。

## 13. Slot / Admin

### GET /admin/spaces/{spaceId}/resources/{resourceId}/slots?from=YYYY-MM-DD&to=YYYY-MM-DD

返回 Admin 日历使用的 Slot 列表。除基础 Slot 字段外，若当前 Slot 被有效 Booking（`booked | completed`）占用，列表项附带轻量 `booking` 投影：

- booking id / status
- membershipId
- userNickname
- participantId / participantName
- reconciliationStatus（仅 completed Booking 为 pending / settled；未完成为 null）

该投影只服务 Admin 运营日历，避免前端为每个 Slot 额外拼接 Booking / Membership / Participant 查询；它不改变 Slot 与 Booking 的领域关系。Slot 新建、编辑、冻结等 mutation 响应可以不携带该投影，客户端应在需要最新运营状态时重新读取日历列表。

### POST /admin/spaces/{spaceId}/slots

```json
{
  "resourceId": "res_xxx",
  "slotTypeId": "sty_xxx",
  "startAt": "2026-09-26T01:00:00Z",
  "endAt": "2026-09-26T04:00:00Z"
}
```

数据库 Trigger 最终保证同 Resource 不重叠。

### PATCH /admin/spaces/{spaceId}/slots/{slotId}

单次 Slot 或周期 Slot “仅本次”修改。

周期 Slot 使用：

```json
{
  "scope": "single",
  "slotTypeId": "sty_xxx",
  "startAt": "2026-09-26T02:00:00Z",
  "endAt": "2026-09-26T05:00:00Z"
}
```

### POST /admin/spaces/{spaceId}/slots/{slotId}/freeze
### POST /admin/spaces/{spaceId}/slots/{slotId}/unfreeze
### POST /admin/spaces/{spaceId}/slots/{slotId}/cancel

有有效 Booking 的 Slot 不能直接 cancel：

- `booked`：必须先取消 Booking，再取消 Slot；
- `completed`：属于已经发生的历史服务事实，Slot 不允许取消；
- 后端 D1 Trigger 做最终约束，不能依赖前端隐藏按钮。

## 14. 周期 Slot / Admin

### POST /admin/spaces/{spaceId}/slot-series

```json
{
  "resourceId": "res_xxx",
  "slotTypeId": "sty_xxx",
  "weekdays": [2, 4],
  "localStartTime": "09:00",
  "localEndTime": "12:00",
  "startsOn": "2026-10-01",
  "endsOn": null
}
```

### PATCH /admin/spaces/{spaceId}/slots/{slotId}

对于某个由 Series 生成的具体 Slot，用该 Slot 作为编辑锚点：

```json
{
  "scope": "single | this_and_future | entire_series",
  "weekdays": [2, 4],
  "localStartTime": "10:00",
  "localEndTime": "12:00",
  "slotTypeId": "sty_xxx"
}
```

- `single`：只改当前 Slot，并将该 occurrence 标记为 Series exception。
- `this_and_future`：以选中 occurrence 为切点；选中项之前的 Series / Slot 保持不变，从该 occurrence 起创建 superseding Series。
- `entire_series`：保持当前 Series ID；已经开始的具体 Slot 不回写，只重算尚未开始且未预约的未来 Slot。

批量 scope 成功后返回：

```json
{
  "scope": "this_and_future",
  "series": {
    "id": "series_xxx",
    "spaceId": "sp_xxx",
    "resourceId": "res_xxx",
    "slotTypeId": "sty_xxx",
    "weekdays": [2, 4],
    "localStartTime": "10:00",
    "localEndTime": "12:00",
    "startsOn": "2026-10-06",
    "endsOn": null,
    "status": "active",
    "supersedesSeriesId": "series_previous"
  },
  "retiredSlotIds": ["slot_old_xxx"],
  "materializedCount": 2
}
```

如果批量变化触及已有 Booking，返回 `SERIES_BOOKING_CONFLICT`，`details.conflicts` 中列出冲突的 `slotId`、`bookingId` 和 `localDate`，管理员必须单独处理；本次批量修改不落库。

## 15. Booking / Admin

### GET /admin/spaces/{spaceId}/bookings

Query：

- from / to
- resourceId
- participantId
- slotTypeId
- membershipId
- status
- reconciliationStatus：`pending | settled`

`membershipId` 供用户详情页读取该 Membership 的预约历史；仅 Admin Contract 支持。对账筛选只匹配已经存在 Reconciliation 的 completed Booking。

返回 Space 内匹配的 Booking 及 Participant / Resource / Slot Type / Slot 摘要。Admin 响应额外包含：

- `membershipId`；
- `userNickname`：该 Booking 所属客户当前昵称；
- `invitedByAdminDisplayName`：该客户加入 Space 时的来源用户友好名称；
- `invitedByAdminEmail`：该来源用户登录邮箱；即使其后续不再拥有该 Space 权限，历史来源仍可展示；
- `completion`：完成时间、来源、外部引用、导入批次；
- `reconciliation`：`pending | settled`、对账时间、来源、操作管理员、batchId、note。

用户侧 Booking Contract 不暴露这些 Admin 运营字段。

### GET /admin/spaces/{spaceId}/bookings/{bookingId}

返回单个 Booking 详情。

### PATCH /admin/spaces/{spaceId}/bookings/{bookingId}

MVP 允许修改：

- slotId
- participantId

规则：
- 仅 `booked` Booking 可修改；
- 修改 Participant 时，目标 Participant 必须属于原 Membership 且为 active；
- 修改 slotId 时重新执行 Space / Resource / Slot / booking cutoff / capacity=1 校验；
- capacity=1 仍由 D1 partial unique index 做最终并发裁决；
- 修改与 `booking_history(updated)` 在同一 D1 batch 中提交。

### POST /admin/spaces/{spaceId}/bookings/{bookingId}/cancel

Admin 取消不受用户 cancellation cutoff 限制，但仅允许从 `booked` 转为 `cancelled`。

### POST /admin/spaces/{spaceId}/bookings/{bookingId}/complete

仅允许从 `booked` 转为 `completed`。

当前 Web Admin 调用无 Body，服务端记录：

- `completion.source = manual`
- `completedAt`
- 自动创建 `reconciliation.status = pending`

服务层已经支持未来由 ClassIn / 外部文件 / 外部 API 写入 completion source、externalReference 与 batchId，但本 PR 不实现文件导入入口。

### POST /admin/spaces/{spaceId}/bookings/{bookingId}/reconcile

当前无 Body，表示运营人员手动确认已对账。

规则：

- 仅 `completed` Booking 可对账；
- `pending → settled`；
- 重复调用幂等；
- 记录 `settledAt`、`settledByAdminId` 与 `source = manual`；
- 未来导入/API 对账可使用 `import | external_api` 来源及 batchId。

### GET /admin/spaces/{spaceId}/bookings/{bookingId}/messages
### POST /admin/spaces/{spaceId}/bookings/{bookingId}/messages

Message API 在 Phase 5 实现。

所有成功的 created / updated / cancelled / completed 操作都写 `booking_history`。

## 16. 用户与参与人 / Admin

### GET /admin/spaces/{spaceId}/members

支持按来源管理员、邀请码筛选。

### GET /admin/spaces/{spaceId}/members/{membershipId}

返回：

- 客户资料摘要
- 邀请来源（包含来源用户名称与邮箱，独立于该用户当前是否仍有 Space 权限）
- Participant 列表
- Booking 摘要
- 管理员内部备注

### PATCH /admin/spaces/{spaceId}/members/{membershipId}

仅修改管理员内部备注等运营字段。

### PATCH /admin/spaces/{spaceId}/participants/{participantId}

管理员可维护内部备注；用户可见备注与 admin note 分离。

## 17. 对账 / Reconciliation

对账状态属于 **Booking 的一对一 Reconciliation**，不属于 SlotStatus。Slot 日历只投影该状态，以便运营人员从时间轴看到“已完成 · 待对账 / 已完成 · 已对账”。

当前已实现：

- completed Booking 自动创建 `pending`；
- `POST /admin/spaces/{spaceId}/bookings/{bookingId}/reconcile` 手动标记 `settled`；
- Booking 列表按 `reconciliationStatus` 筛选。

以下聚合/导出 API 仍是后续对账工作台能力：

### GET /admin/spaces/{spaceId}/reconciliation/summary
### GET /admin/spaces/{spaceId}/reconciliation/resources
### GET /admin/spaces/{spaceId}/reconciliation/participants

通用 Query：

- from / to
- resourceId
- participantId
- slotTypeId
- bookingStatus

只返回计数与分组，不计算金额。

### GET /admin/spaces/{spaceId}/reconciliation/export.csv

同样的过滤条件，导出 CSV。

## 18. 非 MVP

当前 Contract 不包含：

- 微信订阅消息
- 支付
- 课包 / 次卡
- 自动消课
- 预约对象 Web Portal
- 最终用户 Web Portal
