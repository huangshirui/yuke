const { loadUser } = require('../../lib/storage')

function activeSpace(user) {
  return user?.spaces?.find((space) => space.id === user.currentSpaceId && space.status === 'active') || null
}

function addDays(date, days) {
  const value = new Date(date + 'T00:00:00Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function dateInTimezone(value, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(value)
    const read = (type) => parts.find((part) => part.type === type)?.value
    return `${read('year')}-${read('month')}-${read('day')}`
  } catch {
    return value.toISOString().slice(0, 10)
  }
}

function timeInTimezone(iso, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(iso))
    const read = (type) => parts.find((part) => part.type === type)?.value
    return `${read('hour')}:${read('minute')}`
  } catch {
    return String(iso).slice(11, 16)
  }
}

function today(timezone) {
  return dateInTimezone(new Date(), timezone)
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
    label: new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
      .format(new Date(date + 'T12:00:00Z')),
    slots: items.sort((a, b) => a.startAt.localeCompare(b.startAt))
  }))
}

Page({
  data: {
    currentSpace: null,
    resources: [],
    selectedResourceId: '',
    groups: [],
    loading: true,
    loadingSlots: false
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

  async selectResource(event) {
    const resourceId = event.currentTarget.dataset.resourceId
    if (!resourceId || resourceId === this.data.selectedResourceId) return
    this.setData({ selectedResourceId: resourceId, groups: [] })
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

  chooseSlot(event) {
    const slotId = event.currentTarget.dataset.slotId
    if (!slotId) return
    wx.showToast({ title: '已选择时间，预约提交将在下一阶段开放', icon: 'none' })
  }
})
