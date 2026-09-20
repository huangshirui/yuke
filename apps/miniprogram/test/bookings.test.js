const test = require('node:test')
const assert = require('node:assert/strict')
const {
  addDays,
  startOfWeek,
  monthGrid,
  threeDayRange,
  bookingStatusLabel,
  groupBookingsByDate
} = require('../lib/bookings')

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
  assert.equal(groups[1].bookings.length, 0)
})
