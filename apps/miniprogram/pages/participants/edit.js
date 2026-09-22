const { loadUser } = require('../../lib/storage')
const { normalizeParticipantInput } = require('../../lib/participants')

function currentSpaceFromUser(user) {
  if (!user?.currentSpaceId || !Array.isArray(user.spaces)) {
    return null
  }

  return user.spaces.find(
    (space) => space.id === user.currentSpaceId && space.status === 'active'
  ) || null
}

function todayDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

Page({
  data: {
    participantId: '',
    currentSpace: null,
    name: '',
    birthMonth: '',
    note: '',
    today: todayDate(),
    loading: false,
    submitting: false,
    editMode: false,
    hasSpace: true
  },

  async onLoad(options) {
    const user = loadUser(wx)
    const currentSpace = currentSpaceFromUser(user)
    if (!currentSpace) {
      this.setData({ hasSpace: false })
      return
    }

    const participantId = String(options?.id || '')
    this.setData({
      currentSpace,
      hasSpace: true,
      participantId,
      editMode: Boolean(participantId)
    })

    if (participantId) {
      await this.loadParticipant(participantId)
    }
  },

  async loadParticipant(participantId) {
    this.setData({ loading: true })
    try {
      const participants = await getApp().globalData.api.listParticipants(this.data.currentSpace.id)
      const participant = participants.find((item) => item.id === participantId)
      if (!participant) {
        wx.showToast({ title: '预约人不存在', icon: 'none' })
        setTimeout(() => this.leave(), 300)
        return
      }

      this.setData({
        name: participant.name || '',
        birthMonth: participant.birthMonth || '',
        note: participant.note || ''
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

  leave() {
    wx.navigateBack()
  },

  onNameInput(event) {
    this.setData({ name: event.detail.value })
  },

  onBirthMonthChange(event) {
    this.setData({ birthMonth: event.detail.value })
  },

  onNoteInput(event) {
    this.setData({ note: event.detail.value })
  },

  async submit() {
    if (this.data.submitting || this.data.loading) return

    let input
    try {
      input = normalizeParticipantInput({
        name: this.data.name,
        birthMonth: this.data.birthMonth,
        note: this.data.note
      })
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const api = getApp().globalData.api
      if (this.data.editMode) {
        await api.updateParticipant(
          this.data.currentSpace.id,
          this.data.participantId,
          input
        )
      } else {
        await api.createParticipant(this.data.currentSpace.id, input)
      }

      wx.showToast({
        title: this.data.editMode ? '已保存' : '已新增',
        icon: 'success'
      })
      setTimeout(() => this.leave(), 250)
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
