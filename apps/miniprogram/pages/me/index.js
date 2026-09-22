const { loadUser, saveUser } = require('../../lib/storage')
const { markTab, TAB_ROUTES } = require('../../lib/onboarding')

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
    avatarDisplayUrl: ''
  },

  async onShow() {
    markTab(wx, TAB_ROUTES.me)
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
        avatarDisplayUrl
      })
    } catch {
      const user = loadUser(wx)
      const view = deriveView(user)
      const cachedAvatar = user?.avatarUrl && !String(user.avatarUrl).startsWith('/v1/')
        ? user.avatarUrl
        : ''
      this.setData({
        user,
        spaces: view.spaces,
        currentSpace: view.currentSpace,
        avatarDisplayUrl: cachedAvatar
      })
    }
  },

  editProfile() {
    wx.navigateTo({ url: '/pages/profile/setup?mode=edit' })
  },

  manageParticipants() {
    wx.navigateTo({ url: '/pages/participants/index' })
  },

  manageSpaces() {
    wx.navigateTo({ url: '/pages/spaces/index' })
  }
})
