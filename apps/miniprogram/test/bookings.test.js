const test = require('node:test')
const assert = require('node:assert/strict')
const {
  addDays,
  startOfWeek,
  monthGrid,
  threeDayRange,
  timeInTimezone,
  dateTimeInTimezone,
  dateLabel,
  bookingStatusLabel,
  decorateBooking,
  groupAvailabilitySlots,
  groupBookingsByDate
} = require('../lib/bookings')
const {
  buildAgendaSections,
  buildMonthGrid,
  dayTitle,
  dotForDate,
  monthLabel,
  shiftMonth,
  swipeDayDelta
} = require('../lib/calendar')

test('calendar helpers build Monday week, 42-day month grid and three-day range', () => {
  assert.equal(startOfWeek('2026-09-20'), '2026-09-14')
  assert.deepEqual(threeDayRange('2026-09-20'), [
    '2026-09-20',
    '2026-09-21',
    '2026-09-22'
  ])
  assert.equal(addDays('2026-09-30', 1), '2026-10-01')

  const grid = monthGrid('2026-09-20')
  assert.equal(grid.length, 42)
  assert.equal(grid[0], '2026-08-31')
  assert.equal(grid.at(-1), '2026-10-11')
})

test('booking helpers preserve domain status labels and group by local date', () => {
  assert.equal(bookingStatusLabel('booked'), '已预约')
  assert.equal(bookingStatusLabel('completed'), '已完成')
  assert.equal(bookingStatusLabel('cancelled'), '已取消')

  const booking = {
    id: 'bkg_synthetic',
    status: 'booked',
    createdAt: '2026-09-19T12:30:00.000Z',
    updatedAt: '2026-09-20T03:45:00.000Z',
    resource: { id: 'res_synthetic', name: '预约对象 A' },
    participant: { id: 'par_synthetic', name: '参与人甲' },
    slotType: { id: 'sty_synthetic', name: '标准时段' },
    slot: {
      id: 'slot_synthetic',
      localDate: '2026-09-20',
      startAt: '2026-09-20T01:00:00.000Z',
      endAt: '2026-09-20T02:00:00.000Z'
    }
  }

  const groups = groupBookingsByDate(
    [booking],
    ['2026-09-20', '2026-09-21'],
    'Asia/Shanghai'
  )

  assert.equal(groups[0].bookings.length, 1)
  assert.equal(groups[0].bookings[0].displayStart, '09:00')
  assert.equal(groups[0].bookings[0].displayCreatedAt, '2026年9月19日 20:30')
  assert.equal(groups[0].bookings[0].displayUpdatedAt, '2026年9月20日 11:45')
  assert.equal(groups[1].bookings.length, 0)
})

test('booking detail decorates creation and update times in the space timezone', () => {
  const booking = decorateBooking({
    id: 'bkg_synthetic',
    status: 'booked',
    createdAt: '2026-09-21T01:30:00.000Z',
    updatedAt: '2026-09-21T02:45:00.000Z',
    slot: {
      localDate: '2026-09-22',
      startAt: '2026-09-22T01:00:00.000Z',
      endAt: '2026-09-22T02:00:00.000Z'
    }
  }, 'Asia/Shanghai')

  assert.equal(booking.displayCreatedAt, '2026年9月21日 09:30')
  assert.equal(booking.displayUpdatedAt, '2026年9月21日 10:45')
})

test('availability groups keep unavailable slots visible and label them', () => {
  const groups = groupAvailabilitySlots([
    {
      id: 'slot_open',
      localDate: '2026-09-21',
      startAt: '2026-09-21T01:00:00.000Z',
      endAt: '2026-09-21T02:00:00.000Z',
      status: 'open',
      bookable: true,
      resource: { name: '预约项目甲' }
    },
    {
      id: 'slot_frozen',
      localDate: '2026-09-21',
      startAt: '2026-09-21T03:00:00.000Z',
      endAt: '2026-09-21T04:00:00.000Z',
      status: 'frozen',
      bookable: false,
      resource: { name: '预约项目甲' }
    }
  ], 'Asia/Shanghai')

  assert.equal(groups[0].slots.length, 2)
  assert.equal(groups[0].slots[0].availabilityLabel, '')
  assert.equal(groups[0].slots[1].availabilityLabel, '已暂停')
  assert.equal(groups[0].slots[1].resourceName, '预约项目甲')
})

test('date and time labels work when the mini program runtime has no Intl', () => {
  const originalIntl = global.Intl
  global.Intl = undefined
  try {
    assert.equal(dateLabel('2026-09-21', { compact: true }), '9月21日 周一')
    assert.equal(dateLabel('2026-09-21', { compact: true, weekday: 'long' }), '9月21日 星期一')
    assert.equal(timeInTimezone('2026-09-21T01:30:00.000Z', 'Asia/Shanghai'), '09:30')
    assert.equal(timeInTimezone('2026-09-21T01:30:00.000Z', 'Asia/Hong_Kong'), '09:30')
    assert.equal(dateTimeInTimezone('2026-09-21T16:30:00.000Z', 'Asia/Shanghai'), '2026年9月22日 00:30')
  } finally {
    global.Intl = originalIntl
  }
})

test('schedule calendar uses one date-based dot regardless of booking status', () => {
  const bookings = [
    { status: 'cancelled', slot: { localDate: '2026-09-20' } },
    { status: 'completed', slot: { localDate: '2026-09-21' } },
    { status: 'booked', slot: { localDate: '2026-09-21' } }
  ]

  assert.equal(dotForDate(bookings, '2026-09-19', '2026-09-21'), '')
  assert.equal(dotForDate(bookings, '2026-09-20', '2026-09-21'), 'gray')
  assert.equal(dotForDate(bookings, '2026-09-21', '2026-09-21'), 'green')
  assert.equal(dotForDate(bookings, '2026-09-22', '2026-09-21'), '')

  const grid = buildMonthGrid('2026-09-20', '2026-09-21', bookings, '2026-09-21')
  assert.equal(grid.find((day) => day.date === '2026-09-20').dot, 'gray')
  assert.equal(grid.find((day) => day.date === '2026-09-21').dot, 'green')
  assert.equal(monthLabel('2026-09-21'), '2026年9月')
  assert.equal(shiftMonth('2026-01-31', -1), '2025-12-01')
  assert.equal(shiftMonth('2026-12-31', 1), '2027-01-01')
  assert.equal(dayTitle('2026-09-20', '2026-09-21'), '9月20日 周日')
  assert.equal(dayTitle('2026-09-21', '2026-09-21'), '9月21日 周一（今天）')
})

test('agenda builds a continuous stream of booked dates plus the selected empty date', () => {
  const bookings = [
    {
      id: 'bkg_future',
      status: 'booked',
      resource: { name: '预约对象 A' },
      participant: { name: '参与人甲' },
      slotType: { name: '标准时段' },
      slot: {
        localDate: '2026-09-23',
        startAt: '2026-09-23T02:00:00.000Z',
        endAt: '2026-09-23T03:00:00.000Z'
      }
    },
    {
      id: 'bkg_past',
      status: 'completed',
      resource: { name: '预约对象 B' },
      participant: { name: '参与人乙' },
      slotType: { name: '标准时段' },
      slot: {
        localDate: '2026-09-19',
        startAt: '2026-09-19T01:00:00.000Z',
        endAt: '2026-09-19T02:00:00.000Z'
      }
    }
  ]

  const sections = buildAgendaSections(
    bookings,
    '2026-09-21',
    'Asia/Shanghai',
    '2026-09-21'
  )

  assert.deepEqual(sections.map((section) => section.date), [
    '2026-09-19',
    '2026-09-21',
    '2026-09-23'
  ])
  assert.equal(sections[1].id, 'agenda-20260921')
  assert.equal(sections[1].bookings.length, 0)
  assert.equal(sections[2].bookings[0].displayStart, '10:00')
})

test('three-day swipe direction follows the horizontal finger gesture', () => {
  assert.equal(swipeDayDelta({ x: 240, y: 100 }, { x: 120, y: 104 }), 1)
  assert.equal(swipeDayDelta({ x: 120, y: 100 }, { x: 240, y: 96 }), -1)
  assert.equal(swipeDayDelta({ x: 200, y: 100 }, { x: 178, y: 102 }), 0)
  assert.equal(swipeDayDelta({ x: 200, y: 100 }, { x: 130, y: 210 }), 0)
})
