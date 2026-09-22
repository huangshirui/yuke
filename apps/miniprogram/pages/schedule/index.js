const { loadUser } = require('../../lib/storage')
const { markTab, TAB_ROUTES } = require('../../lib/onboarding')
const { addDays, today } = require('../../lib/bookings')
const {
  WEEKDAY_LABELS,
  monthLabel,
  shiftMonth,
  buildMonthGrid,
  agendaSectionId,
  swipeDayDelta,
  buildAgendaSections,
  threeDayColumns
} = require('../../lib/calendar')

const HOUR_ROW_HEIGHT = 72
const SLOT_MIN_HEIGHT = 32
const DAY_START_HOUR = 7
const DAY_HOURS = 17
const SWIPER_CENTER = 1

function buildTimeSlots() {
  return Array.from({ length: DAY_HOURS }, (_, index) => {
    const hour = DAY_START_HOUR + index
    return { hour, label: `${String(hour).padStart(2, '0')}:00` }
  })
}

function buildTimeTicks() {
  return Array.from({ length: DAY_HOURS + 1 }, (_, index) => {
    const hour = DAY_START_HOUR + index
    return {
      label: `${String(hour).padStart(2, '0')}:00`,
      top: index * HOUR_ROW_HEIGHT
    }
  })
}

function activeSpace(user) {
  return user?.spaces?.find(
    (space) => space.id === user.currentSpaceId && space.status === 'active'
  ) || null
}

function arrangeSwiperPanels(panels, centerIndex) {
  const arranged = []
  arranged[centerIndex] = panels[1]
  arranged[(centerIndex + 2) % 3] = panels[0]
  arranged[(centerIndex + 1) % 3] = panels[2]
  return arranged
}

function swiperDirection(previousIndex, nextIndex) {
  return nextIndex === (previousIndex + 1) % 3 ? 1 : -1
}

function buildCalendarPanels(anchorDate, selectedDate, bookings, todayDate, centerIndex) {
  const panels = [-1, 0, 1].map((delta) => {
    const panelDate = shiftMonth(anchorDate, delta)
    return {
      key: panelDate.slice(0, 7),
      days: buildMonthGrid(panelDate, selectedDate, bookings, todayDate)
    }
  })
  return arrangeSwiperPanels(panels, centerIndex)
}

function layoutColumns(columns) {
  return columns.map((column) => ({
    ...column,
    slots: column.bookings.map((booking) => {
      const startHour = Number(booking.displayStart.slice(0, 2))
      const startMinute = Number(booking.displayStart.slice(3, 5))
      const endHour = Number(booking.displayEnd.slice(0, 2))
      const endMinute = Number(booking.displayEnd.slice(3, 5))
      const startMinutes = startHour * 60 + startMinute
      const rawEndMinutes = endHour * 60 + endMinute
      const endMinutes = rawEndMinutes <= startMinutes ? rawEndMinutes + 24 * 60 : rawEndMinutes
      const visibleStart = DAY_START_HOUR * 60
      const visibleEnd = (DAY_START_HOUR + DAY_HOURS) * 60

      if (endMinutes <= visibleStart || startMinutes >= visibleEnd) return null

      const startOffset = (Math.max(startMinutes, visibleStart) - visibleStart) / 60
      const endOffset = (Math.min(endMinutes, visibleEnd) - visibleStart) / 60
      return {
        ...booking,
        top: Math.round(startOffset * HOUR_ROW_HEIGHT),
        height: Math.max(
          Math.round((endOffset - startOffset) * HOUR_ROW_HEIGHT),
          SLOT_MIN_HEIGHT
        )
      }
    }).filter(Boolean)
  }))
}

function buildThreePanels(selectedDate, bookings, timezone, todayDate, centerIndex) {
  const panels = [-1, 0, 1].map((delta) => {
    const startDate = addDays(selectedDate, delta)
    return {
      key: startDate,
      columns: layoutColumns(threeDayColumns(startDate, bookings, timezone, todayDate))
    }
  })
  return arrangeSwiperPanels(panels, centerIndex)
}

Page({
  data: {
    currentSpace: null,
    hasSpace: false,
    weekdayLabels: WEEKDAY_LABELS,
    mode: 'calendar',
    selectedDate: '',
    anchorDate: '',
    todayDate: '',
    scheduleTitle: '',
    calendarPanels: [],
    calendarSwiperIndex: SWIPER_CENTER,
    agendaSections: [],
    agendaScrollTarget: '',
    agendaViewportHeight: 0,
    threePanels: [],
    threeSwiperIndex: SWIPER_CENTER,
    timeSlots: buildTimeSlots(),
    timeTicks: buildTimeTicks(),
    hourRowHeight: HOUR_ROW_HEIGHT,
    timelineHeight: HOUR_ROW_HEIGHT * DAY_HOURS,
    navigationStyle: '',
    loading: true
  },

  onLoad() {
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      const rowTop = Math.max(menu.top, 0)
      const rowHeight = Math.max(menu.height, 36)
      const totalHeight = rowTop + rowHeight + 4
      this.setData({
        navigationStyle: [
          `--schedule-nav-top:${rowTop}px`,
          `--schedule-nav-height:${rowHeight}px`,
          `height:${totalHeight}px`
        ].join(';')
      })
    } catch {
      // 老基础库使用 WXSS 中的 safe-area 降级。
    }
  },

  onResize() {
    if (this.data.mode === 'calendar') this.measureAgendaViewport()
  },

  onShow() {
    markTab(wx, TAB_ROUTES.schedule)

    const user = loadUser(wx)
    const currentSpace = activeSpace(user)
    if (!currentSpace) {
      this.setData({ hasSpace: false, currentSpace: null, loading: false })
      return
    }

    const focusDate = getApp().globalData.scheduleFocusDate || ''
    if (focusDate) getApp().globalData.scheduleFocusDate = ''

    const todayDate = today(currentSpace.timezone)
    const selectedDate = focusDate || this.data.selectedDate || todayDate
    const anchorDate = focusDate || this.data.anchorDate || selectedDate

    this.setData({
      currentSpace,
      hasSpace: true,
      selectedDate,
      anchorDate,
      todayDate,
      scheduleTitle: monthLabel(this.data.mode === 'calendar' ? anchorDate : selectedDate)
    })
    this.loadBookings(selectedDate)
  },

  startBooking() {
    wx.navigateTo({ url: '/pages/booking/index' })
  },

  goToSpaces() {
    wx.navigateTo({ url: '/pages/spaces/index' })
  },

  async switchMode(event) {
    const mode = event.currentTarget.dataset.mode
    if (!mode || mode === this.data.mode) return
    this.setData({
      mode,
      anchorDate: this.data.selectedDate,
      calendarSwiperIndex: SWIPER_CENTER,
      threeSwiperIndex: SWIPER_CENTER,
      scheduleTitle: monthLabel(this.data.selectedDate)
    })
    await this.loadBookings(mode === 'calendar' ? this.data.selectedDate : '')
  },

  calendarState(anchorDate, selectedDate, bookings) {
    const {
      currentSpace,
      todayDate,
      calendarSwiperIndex
    } = this.data
    return {
      anchorDate,
      selectedDate,
      scheduleTitle: monthLabel(anchorDate),
      calendarPanels: buildCalendarPanels(
        anchorDate,
        selectedDate,
        bookings,
        todayDate,
        calendarSwiperIndex
      ),
      agendaSections: buildAgendaSections(
        bookings,
        selectedDate,
        currentSpace.timezone,
        todayDate
      )
    }
  },

  selectDate(event) {
    const date = event.currentTarget.dataset.date
    if (!date) return

    const crossesMonth = date.slice(0, 7) !== this.data.anchorDate.slice(0, 7)
    const nextAnchor = !crossesMonth
      ? this.data.anchorDate
      : date
    this.setData(
      this.calendarState(nextAnchor, date, this._bookings || []),
      () => this.scrollAgendaToDate(date)
    )
  },

  onCalendarSwiperChange(event) {
    const index = event.detail.current
    const previousIndex = this.data.calendarSwiperIndex
    if (index === previousIndex || this._calendarChanging) return
    this._calendarChanging = true
    const delta = swiperDirection(previousIndex, index)
    const nextAnchor = shiftMonth(this.data.anchorDate, delta)
    this.setData({
      calendarSwiperIndex: index,
      anchorDate: nextAnchor,
      selectedDate: nextAnchor,
      scheduleTitle: monthLabel(nextAnchor)
    })
    this.setData(
      this.calendarState(nextAnchor, nextAnchor, this._bookings || []),
      () => {
        this._calendarChanging = false
        this.scrollAgendaToDate(nextAnchor)
      }
    )
  },

  measureAgendaViewport(callback) {
    wx.nextTick(() => {
      this.createSelectorQuery()
        .select('.calendar-view')
        .boundingClientRect((rect) => {
          if (!rect) {
            if (callback) callback()
            return
          }
          let windowHeight = 0
          try {
            windowHeight = wx.getWindowInfo().windowHeight
          } catch {
            windowHeight = wx.getSystemInfoSync().windowHeight
          }
          const height = Math.max(120, Math.floor(windowHeight - rect.bottom))
          if (height === this.data.agendaViewportHeight) {
            if (callback) callback()
            return
          }
          this.setData({ agendaViewportHeight: height }, callback)
        })
        .exec()
    })
  },

  scrollAgendaToDate(date) {
    const target = agendaSectionId(date)
    clearTimeout(this._agendaTargetTimer)
    this._ignoreAgendaScrollUntil = Date.now() + 520
    this.setData({ agendaScrollTarget: '' }, () => {
      this.setData({ agendaScrollTarget: target }, () => {
        this._agendaTargetTimer = setTimeout(() => {
          if (this.data.agendaScrollTarget === target) {
            this.setData({ agendaScrollTarget: '' })
          }
        }, 420)
      })
    })
  },

  onAgendaScroll() {
    if (Date.now() < (this._ignoreAgendaScrollUntil || 0)) return
    clearTimeout(this._agendaScrollTimer)
    this._agendaScrollTimer = setTimeout(() => this.syncAgendaSelection(), 80)
  },

  syncAgendaSelection() {
    if (this.data.mode !== 'calendar') return
    const query = this.createSelectorQuery()
    query.select('.agenda-scroll').boundingClientRect()
    query.selectAll('.agenda-section').boundingClientRect()
    query.exec((results) => {
      const viewport = results?.[0]
      const sections = results?.[1] || []
      if (!viewport || !sections.length) return

      const referenceTop = viewport.top + Math.min(48, viewport.height * 0.18)
      const active = sections.find((section) => section.bottom > referenceTop) || sections[sections.length - 1]
      const date = active?.dataset?.date
      if (!date || date === this.data.selectedDate) return

      const anchorDate = date.slice(0, 7) === this.data.anchorDate.slice(0, 7)
        ? this.data.anchorDate
        : date
      this.setData({
        selectedDate: date,
        anchorDate,
        scheduleTitle: monthLabel(anchorDate),
        calendarPanels: buildCalendarPanels(
          anchorDate,
          date,
          this._bookings || [],
          this.data.todayDate,
          this.data.calendarSwiperIndex
        )
      })
    })
  },

  onThreeSwipeStart(event) {
    const touch = event.touches?.[0]
    if (!touch) return
    this._threeTouchStart = { x: touch.clientX, y: touch.clientY }
  },

  onThreeSwipeEnd(event) {
    const start = this._threeTouchStart
    const touch = event.changedTouches?.[0]
    this._threeTouchStart = null
    if (!start || !touch) return

    const delta = swipeDayDelta(start, { x: touch.clientX, y: touch.clientY })
    if (delta) this.shiftThreeView(delta)
  },

  shiftThreeView(delta) {
    if (!delta) return
    if (this._threeAnimating) {
      this._threeSwipeQueue = [...(this._threeSwipeQueue || []), delta]
      return
    }
    this._threeAnimating = true
    const index = (this.data.threeSwiperIndex + delta + 3) % 3
    const nextDate = addDays(this.data.selectedDate, delta)
    this.setData({
      threeSwiperIndex: index,
      selectedDate: nextDate,
      anchorDate: nextDate,
      scheduleTitle: monthLabel(nextDate)
    })
    clearTimeout(this._threeAnimationTimer)
    this._threeAnimationTimer = setTimeout(() => {
      // 动画期间不替换 swiper-item；结束后再无动画重排三个缓存面板。
      this.setData({
        threePanels: buildThreePanels(
          nextDate,
          this._bookings || [],
          this.data.currentSpace.timezone,
          this.data.todayDate,
          index
        )
      }, () => {
        this._threeAnimating = false
        const nextDelta = (this._threeSwipeQueue || []).shift()
        if (nextDelta) this.shiftThreeView(nextDelta)
      })
    }, 300)
  },

  onUnload() {
    clearTimeout(this._agendaScrollTimer)
    clearTimeout(this._agendaTargetTimer)
    clearTimeout(this._threeAnimationTimer)
  },

  openDetail(event) {
    const bookingId = event.currentTarget.dataset.bookingId
    if (!bookingId) return
    wx.navigateTo({
      url: `/pages/schedule/detail?bookingId=${encodeURIComponent(bookingId)}`
    })
  },

  async loadBookings(focusAgendaDate = '') {
    const { currentSpace } = this.data
    if (!currentSpace) return

    const requestId = (this._bookingRequestId || 0) + 1
    this._bookingRequestId = requestId
    this.setData({ loading: true })
    try {
      // 日程流和三日视图共享完整预约集合，切换日期不再触发网络请求。
      const bookings = await getApp().globalData.api.listBookings(currentSpace.id)
      if (requestId !== this._bookingRequestId) return
      this._bookings = bookings
      const { mode, selectedDate, anchorDate, todayDate } = this.data

      if (mode === 'three') {
        this.setData({
          scheduleTitle: monthLabel(selectedDate),
          threePanels: buildThreePanels(
            selectedDate,
            bookings,
            currentSpace.timezone,
            todayDate,
            this.data.threeSwiperIndex
          )
        })
        return
      }

      this.setData(
        this.calendarState(anchorDate, selectedDate, bookings),
        () => {
          this.measureAgendaViewport(() => {
            if (focusAgendaDate) this.scrollAgendaToDate(focusAgendaDate)
          })
        }
      )
    } catch (error) {
      wx.showToast({ title: error.message || '预约加载失败', icon: 'none' })
    } finally {
      if (requestId === this._bookingRequestId) this.setData({ loading: false })
    }
  }
})
