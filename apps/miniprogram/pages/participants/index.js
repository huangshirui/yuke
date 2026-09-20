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
    participants: [],
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
      wx.redirectTo({ url: '/pages/me/index?selectSpace=1' })
      return
    }

    this.setData({ currentSpace, loading: true })

    try {
      const participants = await getApp().globalData.api.listParticipants(currentSpace.id)
      this.setData({ participants: sortParticipants(participants) })
    } catch (error) {
      wx.showToast({
        title: error.message || '参与人加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
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
          title: '停用参与人',
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
