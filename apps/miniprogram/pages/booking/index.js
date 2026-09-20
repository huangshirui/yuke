const { loadUser } = require('../../lib/storage')
const { addDays, today, timeInTimezone } = require('../../lib/bookings')

function activeSpace(user) {
  return user?.spaces?.find(
    (space) => space.id === user.currentSpaceId && space.status === 'active'
  ) || null
}

function groupSlots(slots, timezone) {
  const map = new Map()
  for (const slot of slots.filter((item) => item.bookable)) {
    const list = map.get(slot.localDate) || []
    list.push({
      ...slot,
      displayStart: timeInTimezone(slot.startAt, timezone),
      displayEnd: timeInTimezone(slot.endAt, timezone)
    })
    map.set(slot.localDate, list)
  }

  return [...map.entries()].map(([date, items]) => ({
    date,
    label: new Intl.DateTimeFormat('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    }).format(new Date(date + 'T12:00:00Z')),
    slots: items.sort((a, b) => a.startAt.localeCompare(b.startAt))
  }))
}

function findSlot(groups, slotId) {
  for (const group of groups) {
    const slot = group.slots.find((item) => item.id === slotId)
    if (slot) return slot
  }
  return null
}

Page({
  data: {
    currentSpace: null,
    resources: [],
    selectedResourceId: '',
    groups: [],
    loading: true,
    loadingSlots: false,
    selectedSlot: null,
    participants: [],
    selectedParticipantId: '',
    loadingParticipants: false,
    submitting: false
  },

  async onShow() {
    const user = loadUser(wx)
    const currentSpace = activeSpace(user)
    if (!currentSpace) {
      wx.redirectTo({ url: '/pages/me/index?selectSpace=1' })
      return
    }

    this.setData({ currentSpace, loading: true })
    try {
      const resources = await getApp().globalData.api.listResources(currentSpace.id)
      const selectedResourceId = resources[0]?.id || ''
      this.setData({ resources, selectedResourceId })
      if (selectedResourceId) await this.loadSlots()
    } catch (error) {
      wx.showToast({ title: error.message || '预约对象加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  viewSchedule() {
    wx.navigateTo({ url: '/pages/schedule/index' })
  },

  async selectResource(event) {
    const resourceId = event.currentTarget.dataset.resourceId
    if (!resourceId || resourceId === this.data.selectedResourceId) return
    this.setData({
      selectedResourceId: resourceId,
      groups: [],
      selectedSlot: null,
      selectedParticipantId: ''
    })
    await this.loadSlots()
  },

  async loadSlots() {
    const { currentSpace, selectedResourceId } = this.data
    if (!currentSpace || !selectedResourceId) return

    this.setData({ loadingSlots: true })
    const from = today(currentSpace.timezone)
    const to = addDays(from, 13)
    try {
      const slots = await getApp().globalData.api.listResourceSlots(
        currentSpace.id,
        selectedResourceId,
        from,
        to
      )
      this.setData({ groups: groupSlots(slots, currentSpace.timezone) })
    } catch (error) {
      wx.showToast({ title: error.message || '可预约时间加载失败', icon: 'none' })
    } finally {
      this.setData({ loadingSlots: false })
    }
  },

  async chooseSlot(event) {
    const slotId = event.currentTarget.dataset.slotId
    const selectedSlot = findSlot(this.data.groups, slotId)
    if (!selectedSlot || this.data.loadingParticipants) return

    this.setData({
      selectedSlot,
      participants: [],
      selectedParticipantId: '',
      loadingParticipants: true
    })

    try {
      const participants = await getApp().globalData.api.listParticipants(
        this.data.currentSpace.id
      )
      const activeParticipants = participants.filter((item) => item.status === 'active')
      this.setData({
        participants: activeParticipants,
        selectedParticipantId: activeParticipants[0]?.id || ''
      })
    } catch (error) {
      wx.showToast({ title: error.message || '参与人加载失败', icon: 'none' })
      this.setData({ selectedSlot: null })
    } finally {
      this.setData({ loadingParticipants: false })
    }
  },

  selectParticipant(event) {
    const participantId = event.currentTarget.dataset.participantId
    if (!participantId) return
    this.setData({ selectedParticipantId: participantId })
  },

  noop() {},

  closeConfirm() {
    if (this.data.submitting) return
    this.setData({
      selectedSlot: null,
      participants: [],
      selectedParticipantId: ''
    })
  },

  addParticipant() {
    wx.navigateTo({ url: '/pages/participants/edit' })
  },

  async submitBooking() {
    const { currentSpace, selectedSlot, selectedParticipantId, submitting } = this.data
    if (!currentSpace || !selectedSlot || !selectedParticipantId || submitting) return

    this.setData({ submitting: true })
    try {
      const booking = await getApp().globalData.api.createBooking(currentSpace.id, {
        slotId: selectedSlot.id,
        participantId: selectedParticipantId
      })

      wx.showToast({ title: '预约成功', icon: 'success' })
      this.setData({
        selectedSlot: null,
        participants: [],
        selectedParticipantId: ''
      })
      wx.navigateTo({
        url: `/pages/schedule/detail?bookingId=${encodeURIComponent(booking.id)}`
      })
    } catch (error) {
      if (error.code === 'SLOT_ALREADY_BOOKED') {
        wx.showToast({
          title: '这个时间刚刚被预约了，请选择其他时间',
          icon: 'none'
        })
        this.setData({
          selectedSlot: null,
          participants: [],
          selectedParticipantId: ''
        })
        await this.loadSlots()
      } else {
        wx.showToast({
          title: error.message || '预约失败，请重试',
          icon: 'none'
        })
      }
    } finally {
      this.setData({ submitting: false })
    }
  }
})
