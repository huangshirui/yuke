import type { ApiErrorCode } from '@yuke/shared'

export const ERROR_STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  SPACE_ACCESS_DENIED: 403,
  NOT_FOUND: 404,
  SLOT_ALREADY_BOOKED: 409,
  SLOT_OVERLAP: 409,
  SLOT_FROZEN: 409,
  SLOT_NOT_BOOKABLE: 409,
  BOOKING_CUTOFF_REACHED: 409,
  CANCELLATION_CUTOFF_REACHED: 409,
  SERIES_BOOKING_CONFLICT: 409,
  INVITE_EXPIRED: 409,
  INVITE_REVOKED: 409,
  SPACE_DISABLED: 409,
  INTERNAL_ERROR: 500
}

export class AppError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = ERROR_STATUS_BY_CODE[code]
    this.details = details
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request', details?: unknown) {
    super('VALIDATION_ERROR', message, details)
    this.name = 'ValidationError'
  }
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  return new AppError('INTERNAL_ERROR', 'Internal Server Error')
}
