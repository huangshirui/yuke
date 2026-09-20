# Reservation Domain

预约核心领域。

当前职责：
- Participant：用户在 SpaceMembership 下维护参与人，支持 `YYYY-MM` 出生年月、用户备注与启停。
- Participant 的 `admin_note` 不进入用户侧 Contract。
- `findActiveParticipantForMembership` 是后续 Booking 创建时校验 inactive Participant 的领域查询。
- Booking 创建、查询与状态流转将在 Phase 4 实现。
