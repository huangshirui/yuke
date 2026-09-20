const { compressAvatar } = require('../../lib/session')
const { loadUser, saveUser } = require('../../lib/storage')
const { routeToEntry } = require('../../lib/navigation')

Page({
  data: {
    nickname: '',
    avatarPath: '',
    savedAvatarPath: '',
    hasSavedAvatar: false,
    submitting: false,
    editMode: false
  },

  async onLoad(options) {
    const user = loadUser(wx)
    this.setData({
      nickname: user?.nickname || '',
      hasSavedAvatar: Boolean(user?.avatarUrl),
      editMode: options?.mode === 'edit'
    })

    if (user?.avatarUrl) {
      try {
        const savedAvatarPath = await getApp().globalData.api.downloadAvatar()
        this.setData({ savedAvatarPath })
      } catch {
        this.setData({ savedAvatarPath: '' })
      }
    }
  },

  onNicknameInput(event) {
    this.setData({ nickname: event.detail.value })
  },

  async onChooseAvatar(event) {
    const source = event.detail.avatarUrl
    if (!source) return

    try {
      wx.showLoading({ title: '处理中', mask: true })
      const compressed = await compressAvatar(wx, source)
      this.setData({ avatarPath: compressed })
    } catch {
      wx.showToast({ title: '头像处理失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async submit() {
    const nickname = this.data.nickname.trim()
    if (!nickname) {
      wx.showToast({ title: '请填写昵称', icon: 'none' })
      return
    }

    if (!this.data.avatarPath && !this.data.hasSavedAvatar) {
      wx.showToast({ title: '请选择头像', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const api = getApp().globalData.api
      let user = await api.updateProfile(nickname)
      if (this.data.avatarPath) {
        user = await api.uploadAvatar(this.data.avatarPath)
      }

      saveUser(wx, user)

      if (this.data.editMode) {
        wx.navigateBack()
        return
      }

      routeToEntry(wx, user)
    } catch (error) {
      wx.showToast({
        title: error.message || '保存失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
