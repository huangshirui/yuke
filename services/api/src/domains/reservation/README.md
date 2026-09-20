# Reservation Domain

预约核心领域。

当前职责：
- Participant：用户在 SpaceMembership 下维护参与人，支持 `YYYY-MM` 出生年月、用户备注与启停。
- Participant 的 `admin_note` 不进入用户侧 Contract。
- Booking creation：校验 Membership / Participant / Space / Resource / Slot / booking cutoff，并由 D1 partial unique index 对 `capacity=1` 做最终并发裁决。
- Booking 并发冲突稳定映射为 `SLOT_ALREADY_BOOKED`；Frozen Slot 映射为 `SLOT_FROZEN`。
- Booking 查询、取消、管理员修改与状态流转由 Phase 4 后续 Issue 实现。

数据层约束：
- `ux_bookings_slot_occupancy`：一个 Slot 只能有一个 `booked|completed` Booking。
- `trg_bookings_require_open_slot_*`：有效 Booking 只能指向 `open` Slot。
