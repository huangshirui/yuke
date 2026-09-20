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

function threeDayRange(date) {
  return [date, addDays(date, 1), addDays(date, 2)]
}

function dateInTimezone(value, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(value)
    const read = (type) => parts.find((part) => part.type === type)?.value
    return `${read('year')}-${read('month')}-${read('day')}`
  } catch {
    return value.toISOString().slice(0, 10)
  }
}

function today(timezone) {
  return dateInTimezone(new Date(), timezone)
}

function timeInTimezone(iso, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(iso))
    const read = (type) => parts.find((part) => part.type === type)?.value
    return `${read('hour')}:${read('minute')}`
  } catch {
    return String(iso).slice(11, 16)
  }
}

function dateLabel(date, options = {}) {
  const format = options.compact
    ? { month: 'numeric', day: 'numeric', weekday: 'short' }
    : { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }

  return new Intl.DateTimeFormat('zh-CN', format)
    .format(new Date(String(date) + 'T12:00:00Z'))
}

function bookingStatusLabel(status) {
  if (status === 'completed') return '已完成'
  if (status === 'cancelled') return '已取消'
  return '已预约'
}

function decorateBooking(booking, timezone) {
  return {
    ...booking,
    statusLabel: bookingStatusLabel(booking.status),
    displayDate: dateLabel(booking.slot.localDate),
    displayStart: timeInTimezone(booking.slot.startAt, timezone),
    displayEnd: timeInTimezone(booking.slot.endAt, timezone)
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
  dateLabel,
  bookingStatusLabel,
  decorateBooking,
  groupBookingsByDate
}
