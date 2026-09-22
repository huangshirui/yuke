const { loadUser } = require('../../lib/storage')
const { markTab, TAB_ROUTES } = require('../../lib/onboarding')
const { addDays, today, groupAvailabilitySlots } = require('../../lib/bookings')

function activeSpace(user) {
  return user?.spaces?.find(
    (space) => space.id === user.currentSpaceId && space.status === 'active'
  ) || null
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
    hasSpace: true,
    resources: [],
    selectedResourceId: '',
    groups: [],
    loading: true,
    loadingSlots: false,
    selectedSlot: null,
    participants: [],
    selectedParticipantId: '',
    loadingParticipants: true,
    submitting: false,
    focusDate: '',
    focusHour: ''
  },

  onLoad(options) {
    this.setData({
      focusDate: String(options?.date || ''),
      focusHour: String(options?.hour || '')
    })
  },

  async onShow() {
    const user = loadUser(wx)
    const currentSpace = activeSpace(user)
    if (!currentSpace) {
      this.setData({ hasSpace: false, currentSpace: null, loading: false })
      return
    }

    this.setData({ currentSpace, hasSpace: true, loading: true, loadingParticipants: true })
    try {
      const api = getApp().globalData.api
      const [resources, participants] = await Promise.all([
        api.listResources(currentSpace.id),
        api.listParticipants(currentSpace.id)
      ])
      const activeParticipants = participants.filter((item) => item.status === 'active')
      const previousResourceId = this.data.selectedResourceId
      const selectedResourceId = resources.some((item) => item.id === previousResourceId)
        ? previousResourceId
        : resources[0]?.id || ''
      const previousParticipantId = this.data.selectedParticipantId
      const selectedParticipantId = activeParticipants.some((item) => item.id === previousParticipantId)
        ? previousParticipantId
        : activeParticipants[0]?.id || ''

      this.setData({
        resources,
        selectedResourceId,
        participants: activeParticipants,
        selectedParticipantId,
        loadingParticipants: false
      })
      if (selectedResourceId) await this.loadSlots()
    } catch (error) {
      wx.showToast({ title: error.message || '预约信息加载失败', icon: 'none' })
      this.setData({ loadingParticipants: false })
    } finally {
      this.setData({ loading: false })
    }
  },

  goToSpaces() {
    wx.navigateTo({ url: '/pages/spaces/index' })
  },

  viewSchedule() {
    markTab(wx, TAB_ROUTES.schedule)
    wx.switchTab({ url: TAB_ROUTES.schedule })
  },

  async selectResource(event) {
    const resourceId = event.currentTarget.dataset.resourceId
    if (!resourceId || resourceId === this.data.selectedResourceId) return
    this.setData({
      selectedResourceId: resourceId,
      groups: [],
      selectedSlot: null
    })
    await this.loadSlots()
  },

  async loadSlots() {
    const { currentSpace, selectedResourceId, focusDate } = this.data
    if (!currentSpace || !selectedResourceId) return

    const requestVersion = (this.slotsRequestVersion || 0) + 1
    this.slotsRequestVersion = requestVersion
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
      if (requestVersion !== this.slotsRequestVersion) return
      const resourceName = this.data.resources.find((item) => item.id === selectedResourceId)?.name || ''
      const groups = groupAvailabilitySlots(slots, currentSpace.timezone, resourceName)
      this.setData({ groups })
      this.focusSlot(focusDate)
    } catch (error) {
      if (requestVersion !== this.slotsRequestVersion) return
      wx.showToast({ title: error.message || '可预约时间加载失败', icon: 'none' })
    } finally {
      if (requestVersion === this.slotsRequestVersion) {
        this.setData({ loadingSlots: false })
      }
    }
  },

  // 从日程时间轴带日期/小时进入时，自动定位并展开对应时段。
  focusSlot(focusDate) {
    if (!focusDate) return
    const { focusHour, groups } = this.data
    this.setData({ focusDate: '', focusHour: '' })
    const group = groups.find((item) => item.date === focusDate)
    if (!group || !group.slots.length) return

    const matched = focusHour
      ? group.slots.find((slot) => slot.displayStart.slice(0, 2) === focusHour.padStart(2, '0'))
      : null

    if (matched?.bookable) {
      this.chooseSlot({ currentTarget: { dataset: { slotId: matched.id } } })
      return
    }
    this.setData({ groups: [group, ...groups.filter((item) => item.date !== focusDate)] })
  },

  chooseSlot(event) {
    const slotId = event.currentTarget.dataset.slotId
    const selectedSlot = findSlot(this.data.groups, slotId)
    if (!selectedSlot || this.data.loadingParticipants) return
    if (!selectedSlot.bookable) {
      wx.showToast({ title: '这个时间暂不可预约', icon: 'none' })
      return
    }

    const selectedParticipantId = this.data.selectedParticipantId || this.data.participants[0]?.id || ''
    this.setData({ selectedSlot, selectedParticipantId })
  },

  selectParticipant(event) {
    const participantId = event.currentTarget.dataset.participantId
    if (!participantId) return
    this.setData({ selectedParticipantId: participantId })
  },

  noop() {},

  closeConfirm() {
    if (this.data.submitting) return
    this.setData({ selectedSlot: null })
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
        selectedSlot: null
      })
      getApp().globalData.scheduleFocusDate = selectedSlot.localDate
      markTab(wx, TAB_ROUTES.schedule)
      setTimeout(() => {
        wx.switchTab({
          url: TAB_ROUTES.schedule,
          fail() {
            wx.navigateTo({ url: '/pages/schedule/index' })
          }
        })
      }, 600)
    } catch (error) {
      if (error.code === 'SLOT_ALREADY_BOOKED') {
        wx.showToast({
          title: '这个时间刚刚被预约了，请选择其他时间',
          icon: 'none'
        })
        this.setData({
          selectedSlot: null
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
