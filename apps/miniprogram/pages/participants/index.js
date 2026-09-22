const { loadUser } = require('../../lib/storage')
const { sortParticipants } = require('../../lib/participants')

function currentSpaceFromUser(user) {
  if (!user?.currentSpaceId || !Array.isArray(user.spaces)) {
    return null
  }

  return user.spaces.find(
    (space) => space.id === user.currentSpaceId && space.status === 'active'
  ) || null
}

Page({
  data: {
    currentSpace: null,
    hasSpace: false,
    participants: [],
    activeCount: 0,
    loading: true,
    actionParticipantId: ''
  },

  async onShow() {
    await this.refresh()
  },

  async refresh() {
    const user = loadUser(wx)
    const currentSpace = currentSpaceFromUser(user)
    if (!currentSpace) {
      this.setData({ hasSpace: false, currentSpace: null, loading: false })
      return
    }

    this.setData({ currentSpace, hasSpace: true, loading: true })

    try {
      const participants = await getApp().globalData.api.listParticipants(currentSpace.id)
      const sorted = sortParticipants(participants)
      this.setData({
        participants: sorted,
        activeCount: sorted.filter((item) => item.status === 'active').length
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '预约人加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  goToSpaces() {
    wx.navigateTo({ url: '/pages/spaces/index' })
  },

  addParticipant() {
    wx.navigateTo({ url: '/pages/participants/edit' })
  },

  editParticipant(event) {
    const participantId = event.currentTarget.dataset.participantId
    if (!participantId) return
    wx.navigateTo({
      url: `/pages/participants/edit?id=${encodeURIComponent(participantId)}`
    })
  },

  async toggleParticipant(event) {
    const participantId = event.currentTarget.dataset.participantId
    const status = event.currentTarget.dataset.status
    if (!participantId || this.data.actionParticipantId) return

    const deactivate = status === 'active'
    if (deactivate) {
      const confirmed = await new Promise((resolve) => {
        wx.showModal({
          title: '停用预约人',
          content: '停用后仍保留历史记录，但不能再用于新预约。',
          confirmText: '停用',
          confirmColor: '#B43C3C',
          success(result) {
            resolve(Boolean(result.confirm))
          },
          fail() {
            resolve(false)
          }
        })
      })
      if (!confirmed) return
    }

    this.setData({ actionParticipantId: participantId })
    try {
      const api = getApp().globalData.api
      if (deactivate) {
        await api.deactivateParticipant(this.data.currentSpace.id, participantId)
      } else {
        await api.activateParticipant(this.data.currentSpace.id, participantId)
      }

      wx.showToast({
        title: deactivate ? '已停用' : '已启用',
        icon: 'success'
      })
      await this.refresh()
    } catch (error) {
      wx.showToast({
        title: error.message || (deactivate ? '停用失败' : '启用失败'),
        icon: 'none'
      })
    } finally {
      this.setData({ actionParticipantId: '' })
    }
  }
})
