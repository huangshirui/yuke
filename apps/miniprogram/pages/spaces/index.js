const { loadUser, saveUser } = require('../../lib/storage')
const { markTab, TAB_ROUTES } = require('../../lib/onboarding')

function activeSpaces(user) {
  return Array.isArray(user?.spaces)
    ? user.spaces.filter((space) => space.status === 'active')
    : []
}

Page({
  data: {
    spaces: [],
    currentSpaceId: '',
    switchingSpaceId: '',
    selectionRequired: false,
    loading: true
  },

  onLoad(options) {
    this.setData({ selectionRequired: options?.required === '1' })
  },

  async onShow() {
    await this.refresh()
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const user = await getApp().globalData.api.getMe()
      saveUser(wx, user)
      const spaces = activeSpaces(user)
      this.setData({
        spaces,
        currentSpaceId: spaces.some((space) => space.id === user.currentSpaceId)
          ? user.currentSpaceId
          : ''
      })
    } catch {
      const user = loadUser(wx)
      const spaces = activeSpaces(user)
      this.setData({
        spaces,
        currentSpaceId: spaces.some((space) => space.id === user?.currentSpaceId)
          ? user.currentSpaceId
          : ''
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  addSpace() {
    wx.navigateTo({ url: '/pages/invite/index?mode=add' })
  },

  async switchSpace(event) {
    const spaceId = event.currentTarget.dataset.spaceId
    if (!spaceId || spaceId === this.data.currentSpaceId || this.data.switchingSpaceId) return

    this.setData({ switchingSpaceId: spaceId })
    try {
      const selectionRequired = this.data.selectionRequired
      const api = getApp().globalData.api
      await api.switchSpace(spaceId)
      const user = await api.getMe()
      saveUser(wx, user)
      this.setData({ currentSpaceId: spaceId, selectionRequired: false })
      wx.showToast({ title: '已切换服务方', icon: 'success' })

      if (!selectionRequired) return
      markTab(wx, TAB_ROUTES.schedule)
      setTimeout(() => wx.switchTab({ url: TAB_ROUTES.schedule }), 300)
    } catch (error) {
      wx.showToast({
        title: error.message || '切换失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ switchingSpaceId: '' })
    }
  }
})
