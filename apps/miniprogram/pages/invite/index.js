const { loadUser, saveUser } = require('../../lib/storage')
const { routeToEntry } = require('../../lib/navigation')

Page({
  data: {
    inviteCode: '',
    submitting: false,
    addMode: false
  },

  onLoad(options) {
    const user = loadUser(wx)
    this.setData({
      addMode: options?.mode === 'add' || Boolean(user?.spaces?.length)
    })
  },

  onCodeInput(event) {
    this.setData({ inviteCode: event.detail.value })
  },

  async submit() {
    const inviteCode = this.data.inviteCode.trim()
    if (!inviteCode) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const api = getApp().globalData.api
      await api.joinSpace(inviteCode)
      const user = await api.getMe()
      saveUser(wx, user)
      wx.showToast({ title: '已加入空间', icon: 'success' })

      if (this.data.addMode) {
        setTimeout(() => wx.navigateBack(), 300)
        return
      }

      routeToEntry(wx, user)
    } catch (error) {
      const messages = {
        INVITE_EXPIRED: '邀请码已过期',
        INVITE_REVOKED: '邀请码已失效',
        SPACE_DISABLED: '该空间当前不可加入'
      }
      wx.showToast({
        title: messages[error.code] || error.message || '加入失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
