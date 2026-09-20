import type { Booking, CreateBookingInput } from '@yuke/shared'
import { AppError, ValidationError } from '../../../lib/errors'
import type { IdentityEnv } from '../../identity/env'
import { requireCurrentUser } from '../../identity/service'
import { findParticipantForMembership } from '../participant/repository'
import { findMembershipByUserAndSpace } from '../../tenant/membership/repository'
import type { TenantDatabase } from '../../tenant/invite/repository'
import {
  findBookingById,
  findBookingCreationContext,
  insertBookingIfEligible,
  type BookingDatabase,
  type BookingCreationContext
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
  const user = await requireCurrentUser(env, request)
  const membership = await findMembershipByUserAndSpace(
    env.DB as unknown as TenantDatabase,
    user.id,
    spaceId
  )
  if (!membership || membership.status !== 'active') {
    throw new AppError('SPACE_ACCESS_DENIED', 'Active Space membership is required')
  }

  const participant = await findParticipantForMembership(env.DB, {
    spaceId,
    membershipId: membership.id,
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
    userId: user.id,
    membershipId: membership.id,
    context
  }
}

function isDatabaseError(error: unknown, needle: string): boolean {
  return error instanceof Error && error.message.includes(needle)
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

  try {
    const inserted = await insertBookingIfEligible(bookingDb(env), {
      id,
      spaceId,
      slotId: eligible.context.slotId,
      membershipId: eligible.membershipId,
      participantId: input.participantId,
      userId: eligible.userId,
      now
    })

    if (!inserted) {
      // A mutable business state changed after the friendly pre-check.
      // Re-read the current state so the client gets the most specific stable error.
      await requireBookingInputs(env, request, spaceId, input, Date.now())
      throw new AppError('SLOT_NOT_BOOKABLE', '这个时间当前不可预约。')
    }
  } catch (error) {
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
      const latest = await findBookingCreationContext(
        bookingDb(env),
        spaceId,
        input.slotId
      )
      if (latest?.slotStatus === 'frozen') {
        throw new AppError('SLOT_FROZEN', '这个时间已冻结，暂时不能预约。')
      }
      throw new AppError('SLOT_NOT_BOOKABLE', '这个时间当前不可预约。')
    }

    throw error
  }

  const booking = await findBookingById(bookingDb(env), spaceId, id)
  if (!booking) {
    throw new AppError('INTERNAL_ERROR', 'Booking creation failed')
  }
  return booking
}
