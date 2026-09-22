const {
  addDays,
  startOfWeek,
  monthGrid,
  threeDayRange,
  decorateBooking
} = require('./bookings')

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const DATE_WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function isoDate(value) {
  return new Date(String(value) + 'T00:00:00Z')
}

function monthLabel(date) {
  const value = isoDate(date)
  return `${value.getUTCFullYear()}年${value.getUTCMonth() + 1}月`
}

function shiftMonth(date, delta) {
  const value = isoDate(String(date).slice(0, 7) + '-01')
  value.setUTCMonth(value.getUTCMonth() + delta)
  return value.toISOString().slice(0, 10)
}

// 企业微信风格标题：「9月21日 周一（今天）」。
function dayTitle(date, todayDate) {
  const value = isoDate(date)
  const label = `${value.getUTCMonth() + 1}月${value.getUTCDate()}日 周${DATE_WEEKDAY_LABELS[value.getUTCDay()]}`
  return date === todayDate ? `${label}（今天）` : label
}

// 一天只显示一个圆点：有预约且日期不早于今天为 green，否则为 gray。
// 这里按 Space 本地日期判断，不依赖预约状态或具体结束时间。
function dotForDate(bookings, date, todayDate) {
  const hasBooking = bookings.some((booking) => booking.slot.localDate === date)
  if (!hasBooking) return ''
  return date < todayDate ? 'gray' : 'green'
}

function buildDays(dates, bookings, selectedDate, anchorDate, todayDate) {
  const anchorMonth = String(anchorDate).slice(0, 7)
  return dates.map((date) => ({
    date,
    day: String(isoDate(date).getUTCDate()),
    dot: dotForDate(bookings, date, todayDate),
    selected: date === selectedDate,
    otherMonth: !date.startsWith(anchorMonth),
    isToday: date === todayDate
  }))
}

function buildMonthGrid(anchorDate, selectedDate, bookings, todayDate) {
  return buildDays(monthGrid(anchorDate), bookings, selectedDate, anchorDate, todayDate)
}

function buildWeekGrid(anchorDate, selectedDate, bookings, todayDate) {
  const from = startOfWeek(anchorDate)
  const dates = Array.from({ length: 7 }, (_, index) => addDays(from, index))
  return buildDays(dates, bookings, selectedDate, anchorDate, todayDate)
}

function threeDayColumns(selectedDate, bookings, timezone, todayDate) {
  return threeDayRange(selectedDate).map((date) => ({
    date,
    day: String(isoDate(date).getUTCDate()),
    weekday: `周${DATE_WEEKDAY_LABELS[isoDate(date).getUTCDay()]}`,
    isToday: date === todayDate,
    bookings: bookings
      .filter((item) => item.slot.localDate === date)
      .map((item) => decorateBooking(item, timezone))
      .sort((a, b) => a.slot.startAt.localeCompare(b.slot.startAt))
  }))
}

function agendaSectionId(date) {
  return `agenda-${String(date).replace(/-/g, '')}`
}

function swipeDayDelta(start, end, threshold = 44) {
  if (!start || !end) return 0
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return 0
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) {
    return 0
  }
  return deltaX < 0 ? 1 : -1
}

// 日程流只展示有记录的日期，同时保留当前选中的空日期作为明确反馈。
function buildAgendaSections(bookings, selectedDate, timezone, todayDate) {
  const dates = new Set(
    bookings
      .map((booking) => booking.slot?.localDate)
      .filter(Boolean)
  )
  if (selectedDate) dates.add(selectedDate)

  return [...dates]
    .sort()
    .map((date) => ({
      id: agendaSectionId(date),
      date,
      title: dayTitle(date, todayDate),
      bookings: bookings
        .filter((item) => item.slot.localDate === date)
        .map((item) => decorateBooking(item, timezone))
        .sort((a, b) => a.slot.startAt.localeCompare(b.slot.startAt))
    }))
}

function timeAxis(fromHour, toHour) {
  const slots = []
  for (let hour = fromHour; hour <= toHour; hour += 1) {
    slots.push(`${String(hour).padStart(2, '0')}:00`)
  }
  return slots
}

module.exports = {
  WEEKDAY_LABELS,
  monthLabel,
  shiftMonth,
  dayTitle,
  dotForDate,
  buildMonthGrid,
  buildWeekGrid,
  threeDayColumns,
  agendaSectionId,
  swipeDayDelta,
  buildAgendaSections,
  timeAxis
}
