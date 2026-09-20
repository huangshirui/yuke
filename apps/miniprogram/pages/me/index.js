const { loadUser, saveUser } = require('../../lib/storage')

function deriveView(user) {
  const spaces = Array.isArray(user?.spaces)
    ? user.spaces.filter((space) => space.status === 'active')
    : []
  const currentSpace = spaces.find((space) => space.id === user?.currentSpaceId) || null
  return { spaces, currentSpace }
}

Page({
  data: {
    user: null,
    spaces: [],
    currentSpace: null,
    currentSpaceId: '',
    avatarDisplayUrl: '',
    switchingSpaceId: '',
    selectSpaceRequired: false
  },

  onLoad(options) {
    this.setData({
      selectSpaceRequired: options?.selectSpace === '1'
    })
  },

  async onShow() {
    await this.refresh()
  },

  async refresh() {
    try {
      const api = getApp().globalData.api
      const user = await api.getMe()
      saveUser(wx, user)
      const view = deriveView(user)
      let avatarDisplayUrl = ''
      if (user.avatarUrl) {
        try {
          avatarDisplayUrl = await api.downloadAvatar()
        } catch {
          avatarDisplayUrl = ''
        }
      }
      this.setData({
        user,
        spaces: view.spaces,
        currentSpace: view.currentSpace,
        currentSpaceId: view.currentSpace?.id || '',
        avatarDisplayUrl
      })
    } catch {
      const user = loadUser(wx)
      const view = deriveView(user)
      this.setData({
        user,
        spaces: view.spaces,
        currentSpace: view.currentSpace
      })
    }
  },

  editProfile() {
    wx.navigateTo({ url: '/pages/profile/setup?mode=edit' })
  },

  addSpace() {
    wx.navigateTo({ url: '/pages/invite/index?mode=add' })
  },

  async switchSpace(event) {
    const spaceId = event.currentTarget.dataset.spaceId
    if (!spaceId || spaceId === this.data.currentSpace?.id || this.data.switchingSpaceId) {
      return
    }

    this.setData({ switchingSpaceId: spaceId })
    try {
      const api = getApp().globalData.api
      await api.switchSpace(spaceId)
      const user = await api.getMe()
      saveUser(wx, user)
      const view = deriveView(user)
      this.setData({
        user,
        spaces: view.spaces,
        currentSpace: view.currentSpace,
        currentSpaceId: view.currentSpace?.id || '',
        selectSpaceRequired: false
      })
      wx.showToast({ title: '已切换空间', icon: 'success' })
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
