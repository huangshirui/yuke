function toDate(value) {
  return new Date(String(value) + 'T00:00:00Z')
}

function addDays(date, days) {
  const value = toDate(date)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function startOfWeek(date) {
  const value = toDate(date)
  const weekday = value.getUTCDay() || 7
  value.setUTCDate(value.getUTCDate() - weekday + 1)
  return value.toISOString().slice(0, 10)
}

function monthGrid(date) {
  const first = String(date).slice(0, 7) + '-01'
  const firstValue = toDate(first)
  const weekday = firstValue.getUTCDay() || 7
  const from = addDays(first, -(weekday - 1))
  return Array.from({ length: 42 }, (_, index) => addDays(from, index))
}

const DATE_WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const FIXED_TIMEZONE_OFFSETS = {
  'Asia/Shanghai': 8 * 60,
  'Asia/Hong_Kong': 8 * 60,
  UTC: 0
}

function supportsDateTimeFormat() {
  return typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
}

function fixedTimezoneDate(value, timezone) {
  const offsetMinutes = FIXED_TIMEZONE_OFFSETS[timezone || 'UTC']
  if (offsetMinutes === undefined) return value
  return new Date(value.getTime() + offsetMinutes * 60_000)
}

function threeDayRange(date) {
  return [date, addDays(date, 1), addDays(date, 2)]
}

function dateInTimezone(value, timezone) {
  try {
    if (!supportsDateTimeFormat()) throw new Error('Intl.DateTimeFormat unavailable')
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(value)
    const read = (type) => parts.find((part) => part.type === type)?.value
    return `${read('year')}-${read('month')}-${read('day')}`
  } catch {
    return fixedTimezoneDate(value, timezone).toISOString().slice(0, 10)
  }
}

function today(timezone) {
  return dateInTimezone(new Date(), timezone)
}

function timeInTimezone(iso, timezone) {
  const value = new Date(iso)
  try {
    if (!supportsDateTimeFormat()) throw new Error('Intl.DateTimeFormat unavailable')
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(value)
    const read = (type) => parts.find((part) => part.type === type)?.value
    return `${read('hour')}:${read('minute')}`
  } catch {
    return fixedTimezoneDate(value, timezone).toISOString().slice(11, 16)
  }
}

function dateTimeInTimezone(iso, timezone) {
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return ''

  try {
    if (!supportsDateTimeFormat()) throw new Error('Intl.DateTimeFormat unavailable')
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(value)
    const read = (type) => parts.find((part) => part.type === type)?.value
    return `${read('year')}年${read('month')}月${read('day')}日 ${read('hour')}:${read('minute')}`
  } catch {
    const localValue = fixedTimezoneDate(value, timezone)
    const year = localValue.getUTCFullYear()
    const month = localValue.getUTCMonth() + 1
    const day = localValue.getUTCDate()
    const hour = String(localValue.getUTCHours()).padStart(2, '0')
    const minute = String(localValue.getUTCMinutes()).padStart(2, '0')
    return `${year}年${month}月${day}日 ${hour}:${minute}`
  }
}

function dateLabel(date, options = {}) {
  const value = new Date(String(date) + 'T12:00:00Z')
  const datePart = `${value.getUTCMonth() + 1}月${value.getUTCDate()}日`
  const weekdayPrefix = options.weekday === 'long' ? '星期' : '周'
  const weekday = `${weekdayPrefix}${DATE_WEEKDAY_LABELS[value.getUTCDay()]}`
  return options.compact
    ? `${datePart} ${weekday}`
    : `${value.getUTCFullYear()}年${datePart} ${weekday}`
}

function bookingStatusLabel(status) {
  if (status === 'completed') return '已完成'
  if (status === 'cancelled') return '已取消'
  return '已预约'
}

function slotAvailabilityLabel(slot) {
  if (slot?.bookable) return ''
  if (slot?.status === 'frozen') return '已暂停'
  return '不可预约'
}

function groupAvailabilitySlots(slots, timezone, fallbackResourceName = '') {
  const groups = new Map()

  for (const slot of Array.isArray(slots) ? slots : []) {
    const items = groups.get(slot.localDate) || []
    items.push({
      ...slot,
      resourceName: slot.resource?.name || fallbackResourceName,
      displayDate: dateLabel(slot.localDate, { compact: true }),
      displayStart: timeInTimezone(slot.startAt, timezone),
      displayEnd: timeInTimezone(slot.endAt, timezone),
      availabilityLabel: slotAvailabilityLabel(slot)
    })
    groups.set(slot.localDate, items)
  }

  return [...groups.entries()].map(([date, items]) => ({
    date,
    label: dateLabel(date, { compact: true }),
    slots: items.sort((left, right) => left.startAt.localeCompare(right.startAt))
  }))
}

function decorateBooking(booking, timezone) {
  return {
    ...booking,
    statusLabel: bookingStatusLabel(booking.status),
    displayDate: dateLabel(booking.slot.localDate),
    displayStart: timeInTimezone(booking.slot.startAt, timezone),
    displayEnd: timeInTimezone(booking.slot.endAt, timezone),
    displayCreatedAt: dateTimeInTimezone(booking.createdAt, timezone),
    displayUpdatedAt: dateTimeInTimezone(booking.updatedAt, timezone)
  }
}

function groupBookingsByDate(bookings, dates, timezone) {
  return dates.map((date) => ({
    date,
    label: dateLabel(date, { compact: true }),
    bookings: bookings
      .filter((item) => item.slot.localDate === date)
      .map((item) => decorateBooking(item, timezone))
      .sort((a, b) => a.slot.startAt.localeCompare(b.slot.startAt))
  }))
}

module.exports = {
  addDays,
  startOfWeek,
  monthGrid,
  threeDayRange,
  today,
  timeInTimezone,
  dateTimeInTimezone,
  dateLabel,
  bookingStatusLabel,
  slotAvailabilityLabel,
  groupAvailabilitySlots,
  decorateBooking,
  groupBookingsByDate
}
