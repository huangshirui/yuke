import type {
  AdminBookingDetail,
  Booking,
  BookingDetail,
  CreateBookingInput,
  UpdateAdminBookingInput
} from '@yuke/shared'
import { AppError, ValidationError } from '../../../lib/errors'
import type { IdentityEnv } from '../../identity/env'
import { requireCurrentUser } from '../../identity/service'
import { findMembershipByUserAndSpace } from '../../tenant/membership/repository'
import type { TenantDatabase } from '../../tenant/invite/repository'
import { findParticipantForMembership } from '../participant/repository'
import {
  cancelBookingForAdmin,
  cancelBookingForMember,
  completeBookingForAdmin,
  findBookingById,
  findBookingCreationContext,
  findAdminBookingDetailById,
  findBookingDetailById,
  findBookingStateById,
  insertBookingIfEligible,
  listBookingsForAdmin,
  listBookingsForMembership,
  updateBookingForAdmin,
  type BookingCreationContext,
  type BookingDatabase,
  type BookingListFilters,
  type BookingState
} from './repository'

export type BookingEnv = IdentityEnv

function bookingDb(env: BookingEnv): BookingDatabase {
  return env.DB as unknown as BookingDatabase
}

function assertSlotBookable(context: BookingCreationContext, now: number): void {
  if (context.spaceStatus !== 'active') {
    throw new AppError('SPACE_DISABLED', 'Space is disabled')
  }
  if (context.resourceStatus !== 'active') {
    throw new AppError('SLOT_NOT_BOOKABLE', '预约对象已停用，不能创建预约。')
  }
  if (context.slotStatus === 'frozen') {
    throw new AppError('SLOT_FROZEN', '这个时间已冻结，暂时不能预约。')
  }
  if (context.slotStatus !== 'open') {
    throw new AppError('SLOT_NOT_BOOKABLE', '这个时间当前不可预约。')
  }
  if (context.occupied) {
    throw new AppError('SLOT_ALREADY_BOOKED', '这个时间刚刚被预约了，请选择其他时间。')
  }

  const cutoffAt =
    context.bookingCutoffMinutes === null
      ? context.startAt
      : context.startAt - context.bookingCutoffMinutes * 60_000

  if (now >= cutoffAt) {
    throw new AppError('BOOKING_CUTOFF_REACHED', '这个时间已经超过最晚预约时间。')
  }
}

async function requireActiveMembership(
  env: BookingEnv,
  request: Request,
  spaceId: string
): Promise<{ userId: string; membershipId: string }> {
  const user = await requireCurrentUser(env, request)
  const membership = await findMembershipByUserAndSpace(
    env.DB as unknown as TenantDatabase,
    user.id,
    spaceId
  )

  if (!membership || membership.status !== 'active') {
    throw new AppError('SPACE_ACCESS_DENIED', 'Active Space membership is required')
  }

  return {
    userId: user.id,
    membershipId: membership.id
  }
}

async function requireBookingInputs(
  env: BookingEnv,
  request: Request,
  spaceId: string,
  input: CreateBookingInput,
  now: number
): Promise<{
  userId: string
  membershipId: string
  context: BookingCreationContext
}> {
  const membership = await requireActiveMembership(env, request, spaceId)
  const participant = await findParticipantForMembership(env.DB, {
    spaceId,
    membershipId: membership.membershipId,
    participantId: input.participantId
  })

  if (!participant) {
    throw new AppError('NOT_FOUND', 'Participant not found')
  }
  if (participant.status !== 'active') {
    throw new ValidationError('Inactive participant cannot be used for a new booking', {
      path: 'participantId'
    })
  }

  const context = await findBookingCreationContext(
    bookingDb(env),
    spaceId,
    input.slotId
  )
  if (!context) {
    throw new AppError('NOT_FOUND', 'Slot not found')
  }
  assertSlotBookable(context, now)

  return {
    ...membership,
    context
  }
}

function isDatabaseError(error: unknown, needle: string): boolean {
  return error instanceof Error && error.message.includes(needle)
}

function mapDatabaseBookingError(error: unknown): never {
  if (
    isDatabaseError(error, 'UNIQUE constraint failed: bookings.slot_id') ||
    isDatabaseError(error, 'ux_bookings_slot_occupancy')
  ) {
    throw new AppError(
      'SLOT_ALREADY_BOOKED',
      '这个时间刚刚被预约了，请选择其他时间。'
    )
  }

  if (isDatabaseError(error, 'SLOT_NOT_BOOKABLE')) {
    throw new AppError('SLOT_NOT_BOOKABLE', '这个时间当前不可预约。')
  }

  throw error
}

function bookingAfter(
  current: Booking,
  patch: Partial<Pick<Booking, 'slotId' | 'participantId' | 'status'>>,
  now: number
): Booking {
  return {
    ...current,
    ...patch,
    updatedAt: new Date(now).toISOString()
  }
}

function assertBookingCanCancel(state: BookingState, now: number): void {
  if (state.booking.status === 'cancelled') return
  if (state.booking.status !== 'booked') {
    throw new ValidationError('Only a booked Booking can be cancelled')
  }

  const cutoff = state.cancellationCutoffMinutes
  if (cutoff !== null && now >= state.slotStartAt - cutoff * 60_000) {
    throw new AppError(
      'CANCELLATION_CUTOFF_REACHED',
      '这个预约已经超过可取消时间。'
    )
  }
}

export async function createCurrentUserBooking(
  env: BookingEnv,
  request: Request,
  spaceId: string,
  input: CreateBookingInput,
  now = Date.now()
): Promise<Booking> {
  const eligible = await requireBookingInputs(env, request, spaceId, input, now)
  const id = `bkg_${crypto.randomUUID().replace(/-/g, '')}`
  const expected: Booking = {
    id,
    spaceId,
    slotId: eligible.context.slotId,
    participantId: input.participantId,
    status: 'booked',
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString()
  }

  try {
    await insertBookingIfEligible(bookingDb(env), {
      id,
      spaceId,
      slotId: eligible.context.slotId,
      membershipId: eligible.membershipId,
      participantId: input.participantId,
      userId: eligible.userId,
      now,
      afterJson: JSON.stringify(expected)
    })
  } catch (error) {
    if (isDatabaseError(error, 'SLOT_NOT_BOOKABLE')) {
      const latest = await findBookingCreationContext(
        bookingDb(env),
        spaceId,
        input.slotId
      )
      if (latest?.slotStatus === 'frozen') {
        throw new AppError('SLOT_FROZEN', '这个时间已冻结，暂时不能预约。')
      }
    }
    mapDatabaseBookingError(error)
  }

  const booking = await findBookingById(bookingDb(env), spaceId, id)
  if (!booking) {
    await requireBookingInputs(env, request, spaceId, input, Date.now())
    throw new AppError('SLOT_NOT_BOOKABLE', '这个时间当前不可预约。')
  }
  return booking
}

export async function listCurrentUserBookings(
  env: BookingEnv,
  request: Request,
  spaceId: string,
  filters: BookingListFilters
): Promise<BookingDetail[]> {
  const membership = await requireActiveMembership(env, request, spaceId)
  return listBookingsForMembership(
    bookingDb(env),
    spaceId,
    membership.membershipId,
    filters
  )
}

export async function readCurrentUserBooking(
  env: BookingEnv,
  request: Request,
  spaceId: string,
  bookingId: string
): Promise<BookingDetail> {
  const membership = await requireActiveMembership(env, request, spaceId)
  const detail = await findBookingDetailById(
    bookingDb(env),
    spaceId,
    bookingId,
    membership.membershipId
  )

  if (!detail) {
    throw new AppError('NOT_FOUND', 'Booking not found')
  }
  return detail
}

export async function cancelCurrentUserBooking(
  env: BookingEnv,
  request: Request,
  spaceId: string,
  bookingId: string,
  now = Date.now()
): Promise<BookingDetail> {
  const membership = await requireActiveMembership(env, request, spaceId)
  const state = await findBookingStateById(bookingDb(env), spaceId, bookingId)

  if (!state || state.membershipId !== membership.membershipId) {
    throw new AppError('NOT_FOUND', 'Booking not found')
  }
  if (state.booking.status === 'cancelled') {
    return readCurrentUserBooking(env, request, spaceId, bookingId)
  }

  assertBookingCanCancel(state, now)
  const after = bookingAfter(state.booking, { status: 'cancelled' }, now)

  await cancelBookingForMember(bookingDb(env), {
    bookingId,
    spaceId,
    membershipId: membership.membershipId,
    userId: membership.userId,
    now,
    beforeJson: JSON.stringify(state.booking),
    afterJson: JSON.stringify(after)
  })

  const updated = await findBookingStateById(bookingDb(env), spaceId, bookingId)
  if (!updated || updated.booking.status !== 'cancelled') {
    if (updated) assertBookingCanCancel(updated, Date.now())
    throw new AppError('INTERNAL_ERROR', 'Booking cancellation failed')
  }

  return readCurrentUserBooking(env, request, spaceId, bookingId)
}

export async function listVisibleAdminBookings(
  env: BookingEnv,
  spaceId: string,
  filters: BookingListFilters
): Promise<AdminBookingDetail[]> {
  return listBookingsForAdmin(bookingDb(env), spaceId, filters)
}

export async function readAdminBooking(
  env: BookingEnv,
  spaceId: string,
  bookingId: string
): Promise<AdminBookingDetail> {
  const detail = await findAdminBookingDetailById(bookingDb(env), spaceId, bookingId)
  if (!detail) {
    throw new AppError('NOT_FOUND', 'Booking not found')
  }
  return detail
}

async function requireAdminBookingState(
  env: BookingEnv,
  spaceId: string,
  bookingId: string
): Promise<BookingState> {
  const state = await findBookingStateById(bookingDb(env), spaceId, bookingId)
  if (!state) throw new AppError('NOT_FOUND', 'Booking not found')
  return state
}

export async function updateAdminBooking(
  env: BookingEnv,
  spaceId: string,
  bookingId: string,
  adminId: string,
  input: UpdateAdminBookingInput,
  now = Date.now()
): Promise<BookingDetail> {
  const state = await requireAdminBookingState(env, spaceId, bookingId)
  if (state.booking.status !== 'booked') {
    throw new ValidationError('Only a booked Booking can be modified')
  }

  const slotId = input.slotId ?? state.booking.slotId
  const participantId = input.participantId ?? state.booking.participantId
  const slotChanged = slotId !== state.booking.slotId
  const participantChanged = participantId !== state.booking.participantId

  if (!slotChanged && !participantChanged) {
    return readAdminBooking(env, spaceId, bookingId)
  }

  if (participantChanged) {
    const participant = await findParticipantForMembership(env.DB, {
      spaceId,
      membershipId: state.membershipId,
      participantId
    })
    if (!participant) {
      throw new AppError('NOT_FOUND', 'Participant not found')
    }
    if (participant.status !== 'active') {
      throw new ValidationError('Inactive participant cannot be used for a Booking', {
        path: 'participantId'
      })
    }
  }

  if (slotChanged) {
    const context = await findBookingCreationContext(
      bookingDb(env),
      spaceId,
      slotId,
      bookingId
    )
    if (!context) throw new AppError('NOT_FOUND', 'Slot not found')
    assertSlotBookable(context, now)
  }

  const after = bookingAfter(state.booking, { slotId, participantId }, now)

  try {
    await updateBookingForAdmin(bookingDb(env), {
      bookingId,
      spaceId,
      slotId,
      participantId,
      slotChanged,
      participantChanged,
      adminId,
      now,
      beforeJson: JSON.stringify(state.booking),
      afterJson: JSON.stringify(after)
    })
  } catch (error) {
    if (isDatabaseError(error, 'SLOT_NOT_BOOKABLE') && slotChanged) {
      const latest = await findBookingCreationContext(
        bookingDb(env),
        spaceId,
        slotId,
        bookingId
      )
      if (latest?.slotStatus === 'frozen') {
        throw new AppError('SLOT_FROZEN', '这个时间已冻结，暂时不能预约。')
      }
    }
    mapDatabaseBookingError(error)
  }

  const updated = await requireAdminBookingState(env, spaceId, bookingId)
  if (
    updated.booking.slotId !== slotId ||
    updated.booking.participantId !== participantId
  ) {
    if (slotChanged) {
      const latest = await findBookingCreationContext(
        bookingDb(env),
        spaceId,
        slotId,
        bookingId
      )
      if (latest) assertSlotBookable(latest, Date.now())
    }
    throw new AppError('SLOT_NOT_BOOKABLE', 'Booking update failed')
  }

  return readAdminBooking(env, spaceId, bookingId)
}

export async function cancelAdminBooking(
  env: BookingEnv,
  spaceId: string,
  bookingId: string,
  adminId: string,
  now = Date.now()
): Promise<BookingDetail> {
  const state = await requireAdminBookingState(env, spaceId, bookingId)
  if (state.booking.status === 'cancelled') {
    return readAdminBooking(env, spaceId, bookingId)
  }
  if (state.booking.status !== 'booked') {
    throw new ValidationError('Completed Booking cannot be cancelled')
  }

  const after = bookingAfter(state.booking, { status: 'cancelled' }, now)
  await cancelBookingForAdmin(bookingDb(env), {
    bookingId,
    spaceId,
    adminId,
    now,
    beforeJson: JSON.stringify(state.booking),
    afterJson: JSON.stringify(after)
  })

  const updated = await requireAdminBookingState(env, spaceId, bookingId)
  if (updated.booking.status !== 'cancelled') {
    throw new AppError('INTERNAL_ERROR', 'Booking cancellation failed')
  }
  return readAdminBooking(env, spaceId, bookingId)
}

export async function completeAdminBooking(
  env: BookingEnv,
  spaceId: string,
  bookingId: string,
  adminId: string,
  now = Date.now()
): Promise<BookingDetail> {
  const state = await requireAdminBookingState(env, spaceId, bookingId)
  if (state.booking.status === 'completed') {
    return readAdminBooking(env, spaceId, bookingId)
  }
  if (state.booking.status !== 'booked') {
    throw new ValidationError('Cancelled Booking cannot be completed')
  }

  const after = bookingAfter(state.booking, { status: 'completed' }, now)
  await completeBookingForAdmin(bookingDb(env), {
    bookingId,
    spaceId,
    adminId,
    now,
    beforeJson: JSON.stringify(state.booking),
    afterJson: JSON.stringify(after)
  })

  const updated = await requireAdminBookingState(env, spaceId, bookingId)
  if (updated.booking.status !== 'completed') {
    throw new AppError('INTERNAL_ERROR', 'Booking completion failed')
  }
  return readAdminBooking(env, spaceId, bookingId)
}
