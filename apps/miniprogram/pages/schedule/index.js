const { loadUser } = require('../../lib/storage')
const {
  addDays,
  startOfWeek,
  monthGrid,
  threeDayRange,
  today,
  decorateBooking,
  groupBookingsByDate
} = require('../../lib/bookings')

function activeSpace(user) {
  return user?.spaces?.find(
    (space) => space.id === user.currentSpaceId && space.status === 'active'
  ) || null
}

function buildCalendarDays(dates, bookings, selectedDate, anchorDate) {
  const counts = new Map()
  for (const booking of bookings) {
    const date = booking.slot.localDate
    counts.set(date, (counts.get(date) || 0) + 1)
  }
  const month = String(anchorDate).slice(0, 7)
  return dates.map((date) => ({
    date,
    day: String(Number(date.slice(8, 10))),
    weekday: new Intl.DateTimeFormat('zh-CN', { weekday: 'short' })
      .format(new Date(date + 'T12:00:00Z')),
    count: counts.get(date) || 0,
    selected: date === selectedDate,
    otherMonth: !date.startsWith(month)
  }))
}

Page({
  data: {
    currentSpace: null,
    weekdayLabels: ['一', '二', '三', '四', '五', '六', '日'],
    mode: 'calendar',
    selectedDate: '',
    anchorDate: '',
    expandedMonth: false,
    calendarDays: [],
    selectedBookings: [],
    threeGroups: [],
    rangeLabel: '',
    loading: true
  },

  async onShow() {
    const user = loadUser(wx)
    const currentSpace = activeSpace(user)
    if (!currentSpace) {
      wx.redirectTo({ url: '/pages/me/index?selectSpace=1' })
      return
    }

    const selectedDate = this.data.selectedDate || today(currentSpace.timezone)
    this.setData({
      currentSpace,
      selectedDate,
      anchorDate: this.data.anchorDate || selectedDate
    })
    await this.loadBookings()
  },

  startBooking() {
    wx.navigateTo({ url: '/pages/booking/index' })
  },

  async switchMode(event) {
    const mode = event.currentTarget.dataset.mode
    if (!mode || mode === this.data.mode) return
    this.setData({ mode })
    await this.loadBookings()
  },

  async toggleMonth() {
    this.setData({ expandedMonth: !this.data.expandedMonth })
    await this.loadBookings()
  },

  async moveCalendar(event) {
    const delta = Number(event.currentTarget.dataset.delta || 0)
    if (!delta) return

    const next = this.data.expandedMonth
      ? (() => {
          const value = new Date(this.data.anchorDate + 'T00:00:00Z')
          value.setUTCMonth(value.getUTCMonth() + delta, 1)
          return value.toISOString().slice(0, 10)
        })()
      : addDays(this.data.anchorDate, delta * 7)

    this.setData({
      anchorDate: next,
      selectedDate: this.data.expandedMonth
        ? next.slice(0, 7) + '-01'
        : next
    })
    await this.loadBookings()
  },

  async moveThree(event) {
    const delta = Number(event.currentTarget.dataset.delta || 0)
    if (!delta) return
    this.setData({
      selectedDate: addDays(this.data.selectedDate, delta * 3)
    })
    await this.loadBookings()
  },

  selectDate(event) {
    const date = event.currentTarget.dataset.date
    if (!date) return
    const bookings = this._bookings || []
    this.setData({
      selectedDate: date,
      calendarDays: buildCalendarDays(
        this.data.calendarDays.map((item) => item.date),
        bookings,
        date,
        this.data.anchorDate
      ),
      selectedBookings: bookings
        .filter((item) => item.slot.localDate === date)
        .map((item) => decorateBooking(item, this.data.currentSpace.timezone))
    })
  },

  openDetail(event) {
    const bookingId = event.currentTarget.dataset.bookingId
    if (!bookingId) return
    wx.navigateTo({
      url: `/pages/schedule/detail?bookingId=${encodeURIComponent(bookingId)}`
    })
  },

  async loadBookings() {
    const { currentSpace, mode, selectedDate, anchorDate, expandedMonth } = this.data
    if (!currentSpace) return

    this.setData({ loading: true })
    try {
      let dates
      if (mode === 'three') {
        dates = threeDayRange(selectedDate)
      } else if (expandedMonth) {
        dates = monthGrid(anchorDate)
      } else {
        const from = startOfWeek(anchorDate)
        dates = Array.from({ length: 7 }, (_, index) => addDays(from, index))
      }

      const from = dates[0]
      const to = dates[dates.length - 1]
      const bookings = await getApp().globalData.api.listBookings(
        currentSpace.id,
        { from, to }
      )
      this._bookings = bookings

      if (mode === 'three') {
        this.setData({
          threeGroups: groupBookingsByDate(bookings, dates, currentSpace.timezone),
          rangeLabel: `${from} — ${to}`
        })
      } else {
        const selected = dates.includes(selectedDate) ? selectedDate : dates[0]
        this.setData({
          selectedDate: selected,
          calendarDays: buildCalendarDays(dates, bookings, selected, anchorDate),
          selectedBookings: bookings
            .filter((item) => item.slot.localDate === selected)
            .map((item) => decorateBooking(item, currentSpace.timezone)),
          rangeLabel: expandedMonth
            ? anchorDate.slice(0, 7)
            : `${from} — ${to}`
        })
      }
    } catch (error) {
      wx.showToast({ title: error.message || '预约加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  }
})
