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

对于用户并发预约失败，小程序可将 `SLOT_ALREADY_BOOKED` 映射为：
“这个时间刚刚被预约了，请选择其他时间。”

## 2. 小程序认证与用户

### POST /auth/wechat/session

Body:

```json
{ "code": "wx-login-temporary-code" }
```

返回项目访问令牌与用户初始化状态。

### GET /me

返回当前用户头像、昵称、当前 Space、已加入 Space 摘要。

### PATCH /me/profile

可更新：

```json
{
  "nickname": "示例昵称"
}
```

### POST /me/avatar

multipart 上传已经在小程序端压缩的头像。服务端写入 R2，并更新 `avatar_object_key`。

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

成功后建立 Membership，并固化 `inviteCodeId` 与 `invitedByAdminId`。

### GET /me/spaces

列出当前用户已加入的 Space。

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

日程视图与三日视图都由相同列表接口驱动，不为 UI 视图定义两个后端模型。

### GET /spaces/{spaceId}/bookings/{bookingId}

返回预约详情、Participant、Resource、Slot Type 与留言。

### POST /spaces/{spaceId}/bookings/{bookingId}/cancel

无 Body。

用户取消需满足 Space cancellation cutoff。管理员取消不受该用户规则限制。

### GET /spaces/{spaceId}/bookings/{bookingId}/messages
### POST /spaces/{spaceId}/bookings/{bookingId}/messages

```json
{ "body": "示例留言" }
```

用户只能操作自己 Membership 下的 Booking。

## 7. Admin Auth

`/admin/*` 由 Cloudflare Access 保护。

Worker 必须验证 Access JWT，并将 `sub` 映射到 `admin_users.access_subject`。

## 8. Super Admin

### GET /admin/spaces
### POST /admin/spaces
### PATCH /admin/spaces/{spaceId}
### POST /admin/spaces/{spaceId}/disable
### POST /admin/spaces/{spaceId}/activate

创建 Space 时同时创建 Space Settings，并明确设置：

- timezone
- bookingCutoffMinutes
- cancellationCutoffMinutes

### GET /admin/spaces/{spaceId}/admins
### POST /admin/spaces/{spaceId}/admins

```json
{ "adminUserId": "adm_xxx" }
```

### DELETE /admin/spaces/{spaceId}/admins/{adminUserId}

只删除管理权限关系，不删除管理员身份，也不破坏历史邀请来源。

## 9. Space Settings

### GET /admin/spaces/{spaceId}/settings
### PATCH /admin/spaces/{spaceId}/settings

```json
{
  "bookingCutoffMinutes": 60,
  "cancellationCutoffMinutes": 240
}
```

`null` 表示不限。

## 10. Invite Code / Admin

### GET /admin/spaces/{spaceId}/invites
### POST /admin/spaces/{spaceId}/invites

```json
{
  "label": "示例渠道 A",
  "expiresAt": "2026-10-31T15:59:59Z"
}
```

服务端生成至少 96-bit 随机熵的邀请码。

### POST /admin/spaces/{spaceId}/invites/{inviteId}/revoke

### GET /admin/spaces/{spaceId}/invites/{inviteId}/members

查看通过该邀请码加入的 Membership。

## 11. Resource / Admin

### GET /admin/spaces/{spaceId}/resources
### POST /admin/spaces/{spaceId}/resources
### PATCH /admin/spaces/{spaceId}/resources/{resourceId}
### POST /admin/spaces/{spaceId}/resources/{resourceId}/deactivate
### POST /admin/spaces/{spaceId}/resources/{resourceId}/activate

## 12. Slot Type / Admin

### GET /admin/spaces/{spaceId}/slot-types
### POST /admin/spaces/{spaceId}/slot-types
### PATCH /admin/spaces/{spaceId}/slot-types/{slotTypeId}
### POST /admin/spaces/{spaceId}/slot-types/{slotTypeId}/deactivate
### POST /admin/spaces/{spaceId}/slot-types/{slotTypeId}/activate

## 13. 单次 Slot / Admin

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

有有效 Booking 的 Slot 不能直接 cancel。

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

- `single`：只改当前 Slot。
- `this_and_future`：切断 Series 并创建 superseding Series。
- `entire_series`：修改当前 Series 的未来部分。

如果批量变化触及已有 Booking，返回 `SERIES_BOOKING_CONFLICT`，响应中列出冲突 Booking / Slot IDs，管理员必须单独处理。

## 15. Booking / Admin

### GET /admin/spaces/{spaceId}/bookings

Query：

- from / to
- resourceId
- participantId
- slotTypeId
- status

### PATCH /admin/spaces/{spaceId}/bookings/{bookingId}

MVP 允许修改：

- slotId
- participantId

修改 slotId 时重新执行所有 Slot 校验和 capacity=1 最终约束。

### POST /admin/spaces/{spaceId}/bookings/{bookingId}/cancel
### POST /admin/spaces/{spaceId}/bookings/{bookingId}/complete
### GET /admin/spaces/{spaceId}/bookings/{bookingId}/messages
### POST /admin/spaces/{spaceId}/bookings/{bookingId}/messages

所有管理修改都写 `booking_history`。

## 16. 用户与参与人 / Admin

### GET /admin/spaces/{spaceId}/members

支持按来源管理员、邀请码筛选。

### GET /admin/spaces/{spaceId}/members/{membershipId}

返回：

- 用户资料摘要
- 邀请来源
- Participant 列表
- Booking 摘要
- 管理员内部备注

### PATCH /admin/spaces/{spaceId}/members/{membershipId}

仅修改管理员内部备注等运营字段。

### PATCH /admin/spaces/{spaceId}/participants/{participantId}

管理员可维护内部备注；用户可见备注与 admin note 分离。

## 17. 对账 / Reconciliation

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
