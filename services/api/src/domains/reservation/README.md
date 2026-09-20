# Reservation Domain

预约核心领域。

当前职责：
- Participant：用户在 SpaceMembership 下维护参与人，支持 `YYYY-MM` 出生年月、用户备注与启停。
- Participant 的 `admin_note` 不进入用户侧 Contract。
- Booking creation：校验 Membership / Participant / Space / Resource / Slot / booking cutoff，并由 D1 partial unique index 对 `capacity=1` 做最终并发裁决。
- 用户 Booking：按日期/状态查询本人预约、读取详情、按 Space cancellation cutoff 取消。
- Admin Booking：按 Resource / Participant / Slot Type / 状态 / 日期筛选，修改 Slot / Participant，取消与完成。
- Booking mutation 与对应 `booking_history` 使用同一 D1 batch，避免业务状态与审计记录分离提交。
- Booking 并发冲突稳定映射为 `SLOT_ALREADY_BOOKED`；Frozen Slot 映射为 `SLOT_FROZEN`。
- Booking Message 在 Phase 5 实现。

数据层约束：
- `ux_bookings_slot_occupancy`：一个 Slot 只能有一个 `booked|completed` Booking。
- `trg_bookings_require_open_slot_*`：有效 Booking 只能指向 `open` Slot。
- Booking 取消后不再占用 capacity；Frozen Slot 即使已有 Booking 被取消，也仍不能重新预约。
