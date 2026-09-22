const { loadUser } = require('../../lib/storage')
const { TAB_ROUTES } = require('../../lib/onboarding')
const {
  addDays,
  startOfWeek,
  today,
  dateLabel,
  decorateBooking
} = require('../../lib/bookings')

const UPCOMING_LIMIT = 5
const RECENT_LIMIT = 3

function activeSpace(user) {
  return user?.spaces?.find(
    (space) => space.id === user.currentSpaceId && space.status === 'active'
  ) || null
}

function resourceNameOf(booking) {
  return booking.resource?.name || '预约项目'
}

function buildUpcoming(bookings, timezone, currentDate) {
  return bookings
    .filter((item) => item.status === 'booked' && item.slot.localDate >= currentDate)
    .map((item) => decorateBooking(item, timezone))
    .sort((a, b) => a.slot.startAt.localeCompare(b.slot.startAt))
    .slice(0, UPCOMING_LIMIT)
}

Page({
  data: {
    hasSpace: false,
    currentSpace: null,
    todayLabel: '',
    loading: true,
    stats: {
      today: 0,
      week: 0,
      upcoming: 0,
      participants: 0,
      activeParticipants: 0,
      resources: 0
    },
    upcoming: [],
    recent: []
  },

  onShow() {
    const user = loadUser(wx)
    const currentSpace = activeSpace(user)
    if (!currentSpace) {
      this.setData({ hasSpace: false, currentSpace: null, loading: false })
      return
    }

    this.setData({
      hasSpace: true,
      currentSpace,
      todayLabel: dateLabel(today(currentSpace.timezone), {
        compact: true,
        weekday: 'long'
      })
    })
    this.loadOverview()
  },

  async loadOverview() {
    const { currentSpace } = this.data
    if (!currentSpace) return

    const api = getApp().globalData.api
    const currentDate = today(currentSpace.timezone)
    const weekFrom = startOfWeek(currentDate)
    const weekTo = addDays(weekFrom, 6)

    this.setData({ loading: true })

    const bookingsPromise = api
      .listBookings(currentSpace.id, { from: addDays(currentDate, -90), to: addDays(currentDate, 180) })
      .catch(() => [])

    const [bookings, participants, resources] = await Promise.all([
      bookingsPromise,
      api.listParticipants(currentSpace.id).catch(() => []),
      api.listResources(currentSpace.id).catch(() => [])
    ])

    const activeBookings = bookings.filter((item) => item.status === 'booked')
    const weekBookings = activeBookings.filter(
      (item) => item.slot.localDate >= weekFrom && item.slot.localDate <= weekTo
    )
    const upcoming = buildUpcoming(bookings, currentSpace.timezone, currentDate)
    const recent = bookings
      .filter((item) => item.slot.localDate < currentDate || item.status !== 'booked')
      .map((item) => decorateBooking(item, currentSpace.timezone))
      .sort((a, b) => b.slot.startAt.localeCompare(a.slot.startAt))
      .slice(0, RECENT_LIMIT)

    this.setData({
      loading: false,
      stats: {
        today: activeBookings.filter((item) => item.slot.localDate === currentDate).length,
        week: weekBookings.length,
        upcoming: activeBookings.filter((item) => item.slot.localDate > currentDate).length,
        participants: participants.length,
        activeParticipants: participants.filter((item) => item.status === 'active').length,
        resources: resources.filter((item) => item.status !== 'inactive').length
      },
      upcoming,
      recent
    })
  },

  openDetail(event) {
    const bookingId = event.currentTarget.dataset.bookingId
    if (!bookingId) return
    wx.navigateTo({
      url: `/pages/schedule/detail?bookingId=${encodeURIComponent(bookingId)}`
    })
  },

  startBooking() {
    wx.navigateTo({ url: '/pages/booking/index' })
  },

  goSchedule() {
    wx.switchTab({ url: TAB_ROUTES.schedule })
  },

  goParticipants() {
    wx.navigateTo({ url: '/pages/participants/index' })
  },

  goToMe() {
    wx.switchTab({ url: TAB_ROUTES.me })
  }
})
