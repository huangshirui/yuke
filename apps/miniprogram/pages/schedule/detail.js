const { loadUser } = require('../../lib/storage')
const { decorateBooking, addDays, today } = require('../../lib/bookings')

function activeSpace(user) {
  return user?.spaces?.find(
    (space) => space.id === user.currentSpaceId && space.status === 'active'
  ) || null
}

Page({
  data: {
    currentSpace: null,
    hasSpace: true,
    bookingId: '',
    booking: null,
    loading: true,
    cancelling: false
  },

  onLoad(options) {
    this.setData({ bookingId: options?.bookingId || '' })
  },

  async onShow() {
    const user = loadUser(wx)
    const currentSpace = activeSpace(user)
    if (!currentSpace) {
      this.setData({ hasSpace: false, loading: false })
      return
    }
    this.setData({ currentSpace, hasSpace: true })
    await this.loadBooking()
  },

  async loadBooking() {
    if (!this.data.currentSpace || !this.data.bookingId) return
    this.setData({ loading: true })
    try {
      const booking = await getApp().globalData.api.getBooking(
        this.data.currentSpace.id,
        this.data.bookingId
      )
      this.setData({
        booking: decorateBooking(booking, this.data.currentSpace.timezone)
      })
    } catch (error) {
      wx.showToast({ title: error.message || '预约加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  goToSpaces() {
    wx.navigateTo({ url: '/pages/spaces/index' })
  },

  async cancelBooking() {
    if (!this.data.booking || this.data.booking.status !== 'booked' || this.data.cancelling) return

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '取消预约',
        content: '取消后会释放这个预约名额。是否继续？',
        confirmText: '取消预约',
        confirmColor: '#B43C3C',
        success(result) { resolve(Boolean(result.confirm)) },
        fail() { resolve(false) }
      })
    })
    if (!confirmed) return

    this.setData({ cancelling: true })
    try {
      const booking = await getApp().globalData.api.cancelBooking(
        this.data.currentSpace.id,
        this.data.booking.id
      )
      this.setData({
        booking: decorateBooking(booking, this.data.currentSpace.timezone)
      })
      wx.showToast({ title: '预约已取消', icon: 'success' })
    } catch (error) {
      wx.showToast({
        title: error.code === 'CANCELLATION_CUTOFF_REACHED'
          ? '已超过可取消时间，如需调整请联系管理员'
          : (error.message || '取消失败'),
        icon: 'none'
      })
    } finally {
      this.setData({ cancelling: false })
    }
  }
})
