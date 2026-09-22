import type {
  AdminBookingDetail,
  Booking,
  BookingCompletionSource,
  BookingDetail,
  BookingReconciliationSource,
  BookingReconciliationStatus,
  BookingStatus,
  CutoffMinutes,
  SlotStatus
} from '@yuke/shared'
import type { D1StatementLike } from '../../resource/catalog/repository'

export type BookingDatabase = {
  prepare(query: string): D1StatementLike
  batch(statements: D1StatementLike[]): Promise<unknown[]>
}

export type BookingCreationContext = {
  slotId: string
  startAt: number
  slotStatus: SlotStatus
  resourceStatus: 'active' | 'inactive'
  spaceStatus: 'active' | 'disabled'
  bookingCutoffMinutes: CutoffMinutes
  occupied: boolean
}

export type BookingState = {
  booking: Booking
  membershipId: string
  slotStartAt: number
  slotStatus: SlotStatus
  cancellationCutoffMinutes: CutoffMinutes
}

export type BookingListFilters = {
  from?: string
  to?: string
  status?: BookingStatus
  resourceId?: string
  participantId?: string
  slotTypeId?: string
  membershipId?: string
  reconciliationStatus?: BookingReconciliationStatus
}

type BookingContextRow = {
  slot_id: string
  start_at: number
  slot_status: SlotStatus
  resource_status: 'active' | 'inactive'
  space_status: 'active' | 'disabled'
  booking_cutoff_minutes: CutoffMinutes
  occupied: number
}

type BookingRow = {
  id: string
  space_id: string
  slot_id: string
  participant_id: string
  status: BookingStatus
  created_at: number
  updated_at: number
}

type BookingDetailRow = BookingRow & {
  membership_id: string
  user_nickname: string
  invited_by_admin_display_name: string | null
  invited_by_admin_email: string
  completed_at: number | null
  completion_source: BookingCompletionSource | null
  completion_external_reference: string | null
  completion_batch_id: string | null
  reconciliation_status: BookingReconciliationStatus | null
  reconciliation_settlement_source: BookingReconciliationSource | null
  reconciliation_settled_at: number | null
  reconciliation_settled_by_admin_id: string | null
  reconciliation_batch_id: string | null
  reconciliation_note: string | null
  participant_name: string
  participant_birth_month: string
  participant_status: 'active' | 'inactive'
  resource_id: string
  resource_name: string
  resource_status: 'active' | 'inactive'
  slot_type_id: string
  slot_type_name: string
  slot_type_status: 'active' | 'inactive'
  start_at: number
  end_at: number
  local_date: string
  slot_status: SlotStatus
}

type BookingStateRow = BookingRow & {
  membership_id: string
  start_at: number
  slot_status: SlotStatus
  cancellation_cutoff_minutes: CutoffMinutes
}

function mapBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    spaceId: row.space_id,
    slotId: row.slot_id,
    participantId: row.participant_id,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  }
}

function mapBookingDetail(row: BookingDetailRow): BookingDetail {
  return {
    ...mapBooking(row),
    participant: {
      id: row.participant_id,
      name: row.participant_name,
      birthMonth: row.participant_birth_month,
      status: row.participant_status
    },
    resource: {
      id: row.resource_id,
      name: row.resource_name,
      status: row.resource_status
    },
    slotType: {
      id: row.slot_type_id,
      name: row.slot_type_name,
      status: row.slot_type_status
    },
    slot: {
      id: row.slot_id,
      startAt: new Date(row.start_at).toISOString(),
      endAt: new Date(row.end_at).toISOString(),
      localDate: row.local_date,
      status: row.slot_status
    }
  }
}

function mapAdminBookingDetail(row: BookingDetailRow): AdminBookingDetail {
  return {
    ...mapBookingDetail(row),
    membershipId: row.membership_id,
    userNickname: row.user_nickname,
    invitedByAdminDisplayName: row.invited_by_admin_display_name,
    invitedByAdminEmail: row.invited_by_admin_email,
    completion:
      row.status === 'completed' && row.completed_at !== null
        ? {
            completedAt: new Date(row.completed_at).toISOString(),
            source: row.completion_source,
            externalReference: row.completion_external_reference,
            batchId: row.completion_batch_id
          }
        : null,
    reconciliation: row.reconciliation_status
      ? {
          status: row.reconciliation_status,
          settledAt:
            row.reconciliation_settled_at === null
              ? null
              : new Date(row.reconciliation_settled_at).toISOString(),
          source: row.reconciliation_settlement_source,
          settledByAdminId: row.reconciliation_settled_by_admin_id,
          batchId: row.reconciliation_batch_id,
          note: row.reconciliation_note
        }
      : null
  }
}

const BOOKING_DETAIL_SELECT = `
  SELECT bookings.id,
         bookings.space_id,
         bookings.slot_id,
         bookings.membership_id,
         users.nickname AS user_nickname,
         invited_admins.display_name AS invited_by_admin_display_name,
         invited_admins.email AS invited_by_admin_email,
         bookings.participant_id,
         bookings.status,
         bookings.completed_at,
         bookings.completion_source,
         bookings.completion_external_reference,
         bookings.completion_batch_id,
         bookings.created_at,
         bookings.updated_at,
         booking_reconciliations.status AS reconciliation_status,
         booking_reconciliations.settlement_source AS reconciliation_settlement_source,
         booking_reconciliations.settled_at AS reconciliation_settled_at,
         booking_reconciliations.settled_by_admin_id AS reconciliation_settled_by_admin_id,
         booking_reconciliations.batch_id AS reconciliation_batch_id,
         booking_reconciliations.note AS reconciliation_note,
         participants.name AS participant_name,
         participants.birth_month AS participant_birth_month,
         participants.status AS participant_status,
         resources.id AS resource_id,
         resources.name AS resource_name,
         resources.status AS resource_status,
         slot_types.id AS slot_type_id,
         slot_types.name AS slot_type_name,
         slot_types.status AS slot_type_status,
         slots.start_at,
         slots.end_at,
         slots.local_date,
         slots.status AS slot_status
  FROM bookings
  LEFT JOIN booking_reconciliations
    ON booking_reconciliations.booking_id = bookings.id
   AND booking_reconciliations.space_id = bookings.space_id
  JOIN space_memberships
    ON space_memberships.id = bookings.membership_id
   AND space_memberships.space_id = bookings.space_id
  JOIN users
    ON users.id = space_memberships.user_id
  JOIN admin_users AS invited_admins
    ON invited_admins.id = space_memberships.invited_by_admin_id
  JOIN participants
    ON participants.id = bookings.participant_id
   AND participants.membership_id = bookings.membership_id
   AND participants.space_id = bookings.space_id
  JOIN slots
    ON slots.id = bookings.slot_id
   AND slots.space_id = bookings.space_id
  JOIN resources
    ON resources.id = slots.resource_id
   AND resources.space_id = slots.space_id
  JOIN slot_types
    ON slot_types.id = slots.slot_type_id
   AND slot_types.space_id = slots.space_id
`

function buildListQuery(
  filters: BookingListFilters,
  scopedToMembership: boolean
): { sql: string; values: unknown[] } {
  const where = ['bookings.space_id = ?']
  const values: unknown[] = []

  if (scopedToMembership) {
    where.push('bookings.membership_id = ?')
  }
  if (filters.from) {
    where.push('slots.local_date >= ?')
  }
  if (filters.to) {
    where.push('slots.local_date <= ?')
  }
  if (filters.status) {
    where.push('bookings.status = ?')
  }
  if (filters.resourceId) {
    where.push('resources.id = ?')
  }
  if (filters.participantId) {
    where.push('participants.id = ?')
  }
  if (filters.slotTypeId) {
    where.push('slot_types.id = ?')
  }
  if (filters.membershipId && !scopedToMembership) {
    where.push('bookings.membership_id = ?')
  }
  if (filters.reconciliationStatus && !scopedToMembership) {
    where.push('booking_reconciliations.status = ?')
  }

  return {
    sql: `${BOOKING_DETAIL_SELECT}
      WHERE ${where.join('\n        AND ')}
      ORDER BY slots.start_at ASC, bookings.id ASC
    `,
    values
  }
}

function listValues(
  spaceId: string,
  filters: BookingListFilters,
  membershipId?: string
): unknown[] {
  const values: unknown[] = [spaceId]
  if (membershipId) values.push(membershipId)
  if (filters.from) values.push(filters.from)
  if (filters.to) values.push(filters.to)
  if (filters.status) values.push(filters.status)
  if (filters.resourceId) values.push(filters.resourceId)
  if (filters.participantId) values.push(filters.participantId)
  if (filters.slotTypeId) values.push(filters.slotTypeId)
  if (filters.membershipId && !membershipId) values.push(filters.membershipId)
  if (filters.reconciliationStatus && !membershipId) values.push(filters.reconciliationStatus)
  return values
}

export async function findBookingCreationContext(
  db: BookingDatabase,
  spaceId: string,
  slotId: string,
  excludeBookingId: string | null = null
): Promise<BookingCreationContext | null> {
  const row = await db.prepare(`
    SELECT slots.id AS slot_id,
           slots.start_at,
           slots.status AS slot_status,
           resources.status AS resource_status,
           spaces.status AS space_status,
           space_settings.booking_cutoff_minutes,
           EXISTS (
             SELECT 1
             FROM bookings
             WHERE bookings.slot_id = slots.id
               AND bookings.status IN ('booked', 'completed')
               AND (? IS NULL OR bookings.id <> ?)
           ) AS occupied
    FROM slots
    JOIN resources
      ON resources.id = slots.resource_id
     AND resources.space_id = slots.space_id
    JOIN spaces
      ON spaces.id = slots.space_id
    JOIN space_settings
      ON space_settings.space_id = spaces.id
    WHERE slots.id = ?
      AND slots.space_id = ?
    LIMIT 1
  `).bind(
    excludeBookingId,
    excludeBookingId,
    slotId,
    spaceId
  ).first<BookingContextRow>()

  return row
    ? {
        slotId: row.slot_id,
        startAt: row.start_at,
        slotStatus: row.slot_status,
        resourceStatus: row.resource_status,
        spaceStatus: row.space_status,
        bookingCutoffMinutes: row.booking_cutoff_minutes,
        occupied: row.occupied === 1
      }
    : null
}

export async function insertBookingIfEligible(
  db: BookingDatabase,
  input: {
    id: string
    spaceId: string
    slotId: string
    membershipId: string
    participantId: string
    userId: string
    now: number
    afterJson: string
  }
): Promise<void> {
  const historyId = `bkh_${crypto.randomUUID().replace(/-/g, '')}`

  await db.batch([
    db.prepare(`
      INSERT INTO bookings (
        id,
        space_id,
        slot_id,
        membership_id,
        participant_id,
        status,
        cancelled_at,
        completed_at,
        created_at,
        updated_at
      )
      SELECT ?,
             slots.space_id,
             slots.id,
             space_memberships.id,
             participants.id,
             'booked',
             NULL,
             NULL,
             ?,
             ?
      FROM slots
      JOIN spaces
        ON spaces.id = slots.space_id
      JOIN space_settings
        ON space_settings.space_id = spaces.id
      JOIN resources
        ON resources.id = slots.resource_id
       AND resources.space_id = slots.space_id
      JOIN space_memberships
        ON space_memberships.id = ?
       AND space_memberships.space_id = slots.space_id
       AND space_memberships.user_id = ?
      JOIN participants
        ON participants.id = ?
       AND participants.membership_id = space_memberships.id
       AND participants.space_id = slots.space_id
      WHERE slots.id = ?
        AND slots.space_id = ?
        AND slots.status = 'open'
        AND spaces.status = 'active'
        AND resources.status = 'active'
        AND space_memberships.status = 'active'
        AND participants.status = 'active'
        AND slots.start_at > ?
        AND (
          space_settings.booking_cutoff_minutes IS NULL
          OR ? < slots.start_at - space_settings.booking_cutoff_minutes * 60000
        )
    `).bind(
      input.id,
      input.now,
      input.now,
      input.membershipId,
      input.userId,
      input.participantId,
      input.slotId,
      input.spaceId,
      input.now,
      input.now
    ),
    db.prepare(`
      INSERT INTO booking_history (
        id,
        space_id,
        booking_id,
        actor_kind,
        actor_user_id,
        actor_admin_id,
        action,
        before_json,
        after_json,
        created_at
      )
      SELECT ?,
             bookings.space_id,
             bookings.id,
             'user',
             ?,
             NULL,
             'created',
             NULL,
             ?,
             ?
      FROM bookings
      WHERE bookings.id = ?
        AND bookings.space_id = ?
    `).bind(
      historyId,
      input.userId,
      input.afterJson,
      input.now,
      input.id,
      input.spaceId
    )
  ])
}

export async function findBookingById(
  db: BookingDatabase,
  spaceId: string,
  bookingId: string
): Promise<Booking | null> {
  const row = await db.prepare(`
    SELECT id,
           space_id,
           slot_id,
           participant_id,
           status,
           created_at,
           updated_at
    FROM bookings
    WHERE id = ?
      AND space_id = ?
    LIMIT 1
  `).bind(bookingId, spaceId).first<BookingRow>()

  return row ? mapBooking(row) : null
}

export async function findBookingStateById(
  db: BookingDatabase,
  spaceId: string,
  bookingId: string
): Promise<BookingState | null> {
  const row = await db.prepare(`
    SELECT bookings.id,
           bookings.space_id,
           bookings.slot_id,
           bookings.membership_id,
           bookings.participant_id,
           bookings.status,
           bookings.created_at,
           bookings.updated_at,
           slots.start_at,
           slots.status AS slot_status,
           space_settings.cancellation_cutoff_minutes
    FROM bookings
    JOIN slots
      ON slots.id = bookings.slot_id
     AND slots.space_id = bookings.space_id
    JOIN space_settings
      ON space_settings.space_id = bookings.space_id
    WHERE bookings.id = ?
      AND bookings.space_id = ?
    LIMIT 1
  `).bind(bookingId, spaceId).first<BookingStateRow>()

  return row
    ? {
        booking: mapBooking(row),
        membershipId: row.membership_id,
        slotStartAt: row.start_at,
        slotStatus: row.slot_status,
        cancellationCutoffMinutes: row.cancellation_cutoff_minutes
      }
    : null
}

export async function findBookingDetailById(
  db: BookingDatabase,
  spaceId: string,
  bookingId: string,
  membershipId?: string
): Promise<BookingDetail | null> {
  const sql = membershipId
    ? `${BOOKING_DETAIL_SELECT}
       WHERE bookings.id = ?
         AND bookings.space_id = ?
         AND bookings.membership_id = ?
       LIMIT 1
      `
    : `${BOOKING_DETAIL_SELECT}
       WHERE bookings.id = ?
         AND bookings.space_id = ?
       LIMIT 1
      `

  const statement = db.prepare(sql)
  const row = membershipId
    ? await statement.bind(bookingId, spaceId, membershipId).first<BookingDetailRow>()
    : await statement.bind(bookingId, spaceId).first<BookingDetailRow>()

  return row ? mapBookingDetail(row) : null
}

export async function findAdminBookingDetailById(
  db: BookingDatabase,
  spaceId: string,
  bookingId: string
): Promise<AdminBookingDetail | null> {
  const row = await db.prepare(`
    ${BOOKING_DETAIL_SELECT}
    WHERE bookings.id = ?
      AND bookings.space_id = ?
    LIMIT 1
  `).bind(bookingId, spaceId).first<BookingDetailRow>()

  return row ? mapAdminBookingDetail(row) : null
}

export async function listBookingsForMembership(
  db: BookingDatabase,
  spaceId: string,
  membershipId: string,
  filters: BookingListFilters
): Promise<BookingDetail[]> {
  const query = buildListQuery(filters, true)
  const result = await db.prepare(query.sql)
    .bind(...listValues(spaceId, filters, membershipId))
    .all<BookingDetailRow>()

  return (result.results ?? []).map(mapBookingDetail)
}

export async function listBookingsForAdmin(
  db: BookingDatabase,
  spaceId: string,
  filters: BookingListFilters
): Promise<AdminBookingDetail[]> {
  const query = buildListQuery(filters, false)
  const result = await db.prepare(query.sql)
    .bind(...listValues(spaceId, filters))
    .all<BookingDetailRow>()

  return (result.results ?? []).map(mapAdminBookingDetail)
}

function historyStatement(
  db: BookingDatabase,
  input: {
    id: string
    bookingId: string
    spaceId: string
    actorKind: 'user' | 'admin'
    actorId: string
    action: 'updated' | 'cancelled' | 'completed'
    beforeJson: string
    afterJson: string
    now: number
  }
): D1StatementLike {
  return db.prepare(`
    INSERT INTO booking_history (
      id,
      space_id,
      booking_id,
      actor_kind,
      actor_user_id,
      actor_admin_id,
      action,
      before_json,
      after_json,
      created_at
    )
    SELECT ?,
           bookings.space_id,
           bookings.id,
           ?,
           CASE WHEN ? = 'user' THEN ? ELSE NULL END,
           CASE WHEN ? = 'admin' THEN ? ELSE NULL END,
           ?,
           ?,
           ?,
           ?
    FROM bookings
    WHERE bookings.id = ?
      AND bookings.space_id = ?
      AND bookings.updated_at = ?
  `).bind(
    input.id,
    input.actorKind,
    input.actorKind,
    input.actorId,
    input.actorKind,
    input.actorId,
    input.action,
    input.beforeJson,
    input.afterJson,
    input.now,
    input.bookingId,
    input.spaceId,
    input.now
  )
}

export async function cancelBookingForMember(
  db: BookingDatabase,
  input: {
    bookingId: string
    spaceId: string
    membershipId: string
    userId: string
    now: number
    beforeJson: string
    afterJson: string
  }
): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE bookings
      SET status = 'cancelled',
          cancelled_at = ?,
          updated_at = ?
      WHERE id = ?
        AND space_id = ?
        AND membership_id = ?
        AND status = 'booked'
        AND EXISTS (
          SELECT 1
          FROM slots
          JOIN space_settings
            ON space_settings.space_id = slots.space_id
          WHERE slots.id = bookings.slot_id
            AND slots.space_id = bookings.space_id
            AND (
              space_settings.cancellation_cutoff_minutes IS NULL
              OR ? < slots.start_at - space_settings.cancellation_cutoff_minutes * 60000
            )
        )
    `).bind(
      input.now,
      input.now,
      input.bookingId,
      input.spaceId,
      input.membershipId,
      input.now
    ),
    historyStatement(db, {
      id: `bkh_${crypto.randomUUID().replace(/-/g, '')}`,
      bookingId: input.bookingId,
      spaceId: input.spaceId,
      actorKind: 'user',
      actorId: input.userId,
      action: 'cancelled',
      beforeJson: input.beforeJson,
      afterJson: input.afterJson,
      now: input.now
    })
  ])
}

export async function cancelBookingForAdmin(
  db: BookingDatabase,
  input: {
    bookingId: string
    spaceId: string
    adminId: string
    now: number
    beforeJson: string
    afterJson: string
  }
): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE bookings
      SET status = 'cancelled',
          cancelled_at = ?,
          updated_at = ?
      WHERE id = ?
        AND space_id = ?
        AND status = 'booked'
    `).bind(input.now, input.now, input.bookingId, input.spaceId),
    historyStatement(db, {
      id: `bkh_${crypto.randomUUID().replace(/-/g, '')}`,
      bookingId: input.bookingId,
      spaceId: input.spaceId,
      actorKind: 'admin',
      actorId: input.adminId,
      action: 'cancelled',
      beforeJson: input.beforeJson,
      afterJson: input.afterJson,
      now: input.now
    })
  ])
}

export async function completeBookingForAdmin(
  db: BookingDatabase,
  input: {
    bookingId: string
    spaceId: string
    adminId: string
    completionSource: BookingCompletionSource
    externalReference: string | null
    batchId: string | null
    now: number
    beforeJson: string
    afterJson: string
  }
): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE bookings
      SET status = 'completed',
          completed_at = ?,
          completion_source = ?,
          completion_external_reference = ?,
          completion_batch_id = ?,
          updated_at = ?
      WHERE id = ?
        AND space_id = ?
        AND status = 'booked'
    `).bind(
      input.now,
      input.completionSource,
      input.externalReference,
      input.batchId,
      input.now,
      input.bookingId,
      input.spaceId
    ),
    db.prepare(`
      INSERT INTO booking_reconciliations (
        booking_id,
        space_id,
        status,
        settlement_source,
        settled_at,
        settled_by_admin_id,
        batch_id,
        note,
        created_at,
        updated_at
      )
      SELECT bookings.id,
             bookings.space_id,
             'pending',
             NULL,
             NULL,
             NULL,
             NULL,
             NULL,
             ?,
             ?
      FROM bookings
      WHERE bookings.id = ?
        AND bookings.space_id = ?
        AND bookings.status = 'completed'
        AND bookings.updated_at = ?
      ON CONFLICT(booking_id) DO NOTHING
    `).bind(
      input.now,
      input.now,
      input.bookingId,
      input.spaceId,
      input.now
    ),
    historyStatement(db, {
      id: `bkh_${crypto.randomUUID().replace(/-/g, '')}`,
      bookingId: input.bookingId,
      spaceId: input.spaceId,
      actorKind: 'admin',
      actorId: input.adminId,
      action: 'completed',
      beforeJson: input.beforeJson,
      afterJson: input.afterJson,
      now: input.now
    })
  ])
}

export async function settleBookingReconciliationForAdmin(
  db: BookingDatabase,
  input: {
    bookingId: string
    spaceId: string
    adminId: string
    source: BookingReconciliationSource
    batchId: string | null
    note: string | null
    now: number
  }
): Promise<void> {
  await db.batch([
    db.prepare(`
      INSERT INTO booking_reconciliations (
        booking_id,
        space_id,
        status,
        settlement_source,
        settled_at,
        settled_by_admin_id,
        batch_id,
        note,
        created_at,
        updated_at
      )
      SELECT bookings.id,
             bookings.space_id,
             'pending',
             NULL,
             NULL,
             NULL,
             NULL,
             NULL,
             COALESCE(bookings.completed_at, bookings.updated_at),
             bookings.updated_at
      FROM bookings
      WHERE bookings.id = ?
        AND bookings.space_id = ?
        AND bookings.status = 'completed'
      ON CONFLICT(booking_id) DO NOTHING
    `).bind(input.bookingId, input.spaceId),
    db.prepare(`
      UPDATE booking_reconciliations
      SET status = 'settled',
          settlement_source = ?,
          settled_at = ?,
          settled_by_admin_id = ?,
          batch_id = ?,
          note = ?,
          updated_at = ?
      WHERE booking_id = ?
        AND space_id = ?
        AND status = 'pending'
    `).bind(
      input.source,
      input.now,
      input.adminId,
      input.batchId,
      input.note,
      input.now,
      input.bookingId,
      input.spaceId
    )
  ])
}

export async function updateBookingForAdmin(
  db: BookingDatabase,
  input: {
    bookingId: string
    spaceId: string
    slotId: string
    participantId: string
    slotChanged: boolean
    participantChanged: boolean
    adminId: string
    now: number
    beforeJson: string
    afterJson: string
  }
): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE bookings
      SET slot_id = ?,
          participant_id = ?,
          updated_at = ?
      WHERE id = ?
        AND space_id = ?
        AND status = 'booked'
        AND (
          ? = 0
          OR EXISTS (
            SELECT 1
            FROM participants
            WHERE participants.id = ?
              AND participants.membership_id = bookings.membership_id
              AND participants.space_id = bookings.space_id
              AND participants.status = 'active'
          )
        )
        AND (
          ? = 0
          OR EXISTS (
            SELECT 1
            FROM slots
            JOIN resources
              ON resources.id = slots.resource_id
             AND resources.space_id = slots.space_id
            JOIN spaces
              ON spaces.id = slots.space_id
            JOIN space_settings
              ON space_settings.space_id = slots.space_id
            WHERE slots.id = ?
              AND slots.space_id = bookings.space_id
              AND slots.status = 'open'
              AND resources.status = 'active'
              AND spaces.status = 'active'
              AND slots.start_at > ?
              AND (
                space_settings.booking_cutoff_minutes IS NULL
                OR ? < slots.start_at - space_settings.booking_cutoff_minutes * 60000
              )
          )
        )
    `).bind(
      input.slotId,
      input.participantId,
      input.now,
      input.bookingId,
      input.spaceId,
      input.participantChanged ? 1 : 0,
      input.participantId,
      input.slotChanged ? 1 : 0,
      input.slotId,
      input.now,
      input.now
    ),
    historyStatement(db, {
      id: `bkh_${crypto.randomUUID().replace(/-/g, '')}`,
      bookingId: input.bookingId,
      spaceId: input.spaceId,
      actorKind: 'admin',
      actorId: input.adminId,
      action: 'updated',
      beforeJson: input.beforeJson,
      afterJson: input.afterJson,
      now: input.now
    })
  ])
}
