import { ValidationError } from '../../../lib/errors'

type LocalParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export function parseDateOnly(value: string, path = 'date'): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new ValidationError(`${path} must use YYYY-MM-DD`, { path })
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    throw new ValidationError(`${path} is not a valid date`, { path })
  }
  return { year, month, day }
}

export function parseLocalTime(value: string, path: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new ValidationError(`${path} must use HH:mm`, { path })
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) {
    throw new ValidationError(`${path} is not a valid local time`, { path })
  }
  return { hour, minute }
}

export function addDays(date: string, days: number): string {
  const { year, month, day } = parseDateOnly(date)
  const value = new Date(Date.UTC(year, month - 1, day + days))
  return value.toISOString().slice(0, 10)
}

export function isoWeekday(date: string): number {
  const { year, month, day } = parseDateOnly(date)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

function zonedParts(epochMs: number, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(epochMs))
  const number = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return {
    year: number('year'),
    month: number('month'),
    day: number('day'),
    hour: number('hour'),
    minute: number('minute')
  }
}

export function localDateTimeToEpochMs(
  date: string,
  time: string,
  timezone: string
): number {
  const dateParts = parseDateOnly(date)
  const timeParts = parseLocalTime(time, 'time')
  const targetUtc = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute
  )

  let guess = targetUtc
  for (let index = 0; index < 4; index += 1) {
    const current = zonedParts(guess, timezone)
    const representedAsUtc = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute
    )
    const offset = representedAsUtc - guess
    const next = targetUtc - offset
    if (next === guess) break
    guess = next
  }

  const roundTrip = zonedParts(guess, timezone)
  if (
    roundTrip.year !== dateParts.year ||
    roundTrip.month !== dateParts.month ||
    roundTrip.day !== dateParts.day ||
    roundTrip.hour !== timeParts.hour ||
    roundTrip.minute !== timeParts.minute
  ) {
    throw new ValidationError('Local date/time does not exist in the Space timezone', {
      date,
      time,
      timezone
    })
  }

  return guess
}

export function localDateForEpochMs(epochMs: number, timezone: string): string {
  const parts = zonedParts(epochMs, timezone)
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0')
  ].join('-')
}
