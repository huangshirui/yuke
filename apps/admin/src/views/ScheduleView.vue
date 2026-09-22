<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import LoadingOverlay from '../components/LoadingOverlay.vue'
import { getAdminApi } from '../services/adminApi'
import type { AdminBooking, AdminResource, AdminScheduleSlot, AdminSlotType, AdminSpace } from '../types/admin'

const props = withDefaults(defineProps<{ embedded?: boolean }>(), {
  embedded: false
})

const api = getAdminApi()
const route = useRoute()

const spaceId = computed(() => String(route.params.spaceId))
const space = ref<AdminSpace | null>(null)
const resources = ref<AdminResource[]>([])
const slotTypes = ref<AdminSlotType[]>([])
const slots = ref<AdminScheduleSlot[]>([])
const selectedResourceId = ref('')
const weekStart = ref(startOfWeek(new Date()))
const mobileDate = ref('')
const loading = ref(true)
const slotsLoading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')

const selectedSlot = ref<AdminScheduleSlot | null>(null)
const selectedBooking = ref<AdminBooking | null>(null)
const selectedBookingSlot = ref<AdminScheduleSlot | null>(null)
const selectedBookingUserNickname = ref('')
const detailLoading = ref(false)

const formOpen = ref(false)
const editingSlot = ref<AdminScheduleSlot | null>(null)
const form = reactive({
  mode: 'single' as 'single' | 'weekly',
  scope: 'single' as 'single' | 'this_and_future' | 'entire_series',
  date: '',
  weekdays: [] as number[],
  startTime: '09:00',
  endTime: '10:00',
  slotTypeId: '',
  endsOn: ''
})

const drag = reactive({ day: -1, startMinute: -1, currentMinute: -1 })
const GRID_START_MINUTE = 7 * 60
const GRID_END_MINUTE = 24 * 60
const GRID_STEP_MINUTES = 30
const GRID_ROW_HEIGHT = 34
const gridMinutes = Array.from(
  { length: (GRID_END_MINUTE - GRID_START_MINUTE) / GRID_STEP_MINUTES },
  (_, index) => GRID_START_MINUTE + index * GRID_STEP_MINUTES,
)
let slotsRequestVersion = 0

const weekDays = computed(() =>
  Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart.value, index)
    return {
      date,
      label: new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(new Date(date + 'T12:00:00')),
      short: date.slice(5)
    }
  })
)
const weekEnd = computed(() => addDays(weekStart.value, 6))
const selectedResource = computed(() => resources.value.find((item) => item.id === selectedResourceId.value) ?? null)
const mobileDay = computed(() =>
  weekDays.value.find((item) => item.date === mobileDate.value) ?? weekDays.value[0]
)

function startOfWeek(date: Date | string) {
  const source = typeof date === 'string' ? new Date(date + 'T12:00:00Z') : date
  const value = new Date(Date.UTC(
    source.getUTCFullYear(),
    source.getUTCMonth(),
    source.getUTCDate()
  ))
  const day = value.getUTCDay() || 7
  value.setUTCDate(value.getUTCDate() - day + 1)
  return value.toISOString().slice(0, 10)
}
function todayInSpace() {
  const zone = space.value?.timezone || 'UTC'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const read = (type: string) => parts.find((part) => part.type === type)?.value
  return `${read('year')}-${read('month')}-${read('day')}`
}
function addDays(date: string, days: number) {
  const value = new Date(date + 'T00:00:00Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
function minutesLabel(value: number) {
  const hour = String(Math.floor(value / 60)).padStart(2, '0')
  const minute = String(value % 60).padStart(2, '0')
  return hour + ':' + minute
}
function zonedParts(iso: string) {
  const zone = space.value?.timezone || 'UTC'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(iso))
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute')
  }
}
function slotLocalTime(iso: string) {
  const parts = zonedParts(iso)
  return String(parts.hour).padStart(2, '0') + ':' + String(parts.minute).padStart(2, '0')
}
function dateTimeLocal(date: string, time: string) {
  const zone = space.value?.timezone || 'UTC'
  const desired = Date.UTC(
    Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)),
    Number(time.slice(0, 2)), Number(time.slice(3, 5))
  )
  let guess = desired
  for (let index = 0; index < 4; index += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(guess))
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value)
    const represented = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'))
    const next = desired - (represented - guess)
    if (next === guess) break
    guess = next
  }
  return new Date(guess).toISOString()
}
function slotStyle(slot: AdminScheduleSlot) {
  const start = zonedParts(slot.startAt)
  const end = zonedParts(slot.endAt)
  const startMinute = start.hour * 60 + start.minute
  const startDay = Date.UTC(start.year, start.month - 1, start.day)
  const endDay = Date.UTC(end.year, end.month - 1, end.day)
  const dayOffset = Math.max(0, Math.round((endDay - startDay) / 86_400_000))
  const endMinute = end.hour * 60 + end.minute + dayOffset * 24 * 60
  const top = Math.max(0, ((startMinute - GRID_START_MINUTE) / GRID_STEP_MINUTES) * GRID_ROW_HEIGHT)
  const height = Math.max(GRID_ROW_HEIGHT, ((endMinute - startMinute) / GRID_STEP_MINUTES) * GRID_ROW_HEIGHT)
  return { top: top + 'px', height: height + 'px' }
}
function slotsFor(date: string) {
  return slots.value.filter((slot) => slot.localDate === date && slot.status !== 'cancelled')
}
function slotTypeName(slot: AdminScheduleSlot) {
  return slotTypes.value.find((item) => item.id === slot.slotTypeId)?.name || slot.slotTypeName || '未命名类型'
}
function showError(cause: unknown, fallback: string) {
  error.value = cause instanceof Error ? cause.message : fallback
}
function clearFeedback() {
  error.value = ''
  notice.value = ''
}

async function loadBase() {
  loading.value = true
  clearFeedback()
  try {
    const [spaces, nextResources, nextTypes] = await Promise.all([
      api.listSpaces(),
      api.listResources(spaceId.value),
      api.listSlotTypes(spaceId.value)
    ])
    space.value = spaces.find((item) => item.id === spaceId.value) ?? null
    resources.value = nextResources.filter((item) => item.status === 'active')
    slotTypes.value = nextTypes.filter((item) => item.status === 'active')
    if (!selectedResourceId.value || !resources.value.some((item) => item.id === selectedResourceId.value)) {
      selectedResourceId.value = resources.value[0]?.id || ''
    }
    const today = todayInSpace()
    weekStart.value = startOfWeek(today)
    mobileDate.value = today
    await loadSlots()
  } catch (cause) {
    showError(cause, '时段加载失败。')
  } finally {
    loading.value = false
  }
}
async function loadSlots() {
  const requestVersion = ++slotsRequestVersion
  if (!selectedResourceId.value) {
    slots.value = []
    slotsLoading.value = false
    return
  }
  slotsLoading.value = true
  try {
    const nextSlots = await api.listScheduleSlots(
      spaceId.value,
      selectedResourceId.value,
      weekStart.value,
      weekEnd.value
    )
    if (requestVersion === slotsRequestVersion) slots.value = nextSlots
  } catch (cause) {
    if (requestVersion === slotsRequestVersion) showError(cause, '时段加载失败。')
  } finally {
    if (requestVersion === slotsRequestVersion) slotsLoading.value = false
  }
}
async function changeWeek(delta: number) {
  weekStart.value = addDays(weekStart.value, delta * 7)
  mobileDate.value = weekStart.value
  await loadSlots()
}
async function goToday() {
  const today = todayInSpace()
  weekStart.value = startOfWeek(today)
  mobileDate.value = today
  await loadSlots()
}
async function changeMobileDay(delta: number) {
  const next = addDays(mobileDate.value || weekStart.value, delta)
  mobileDate.value = next
  if (next < weekStart.value || next > weekEnd.value) {
    weekStart.value = startOfWeek(next)
    await loadSlots()
  }
}

function openCreate(date = weekDays.value[0]?.date, startTime = '09:00', endTime = '10:00') {
  editingSlot.value = null
  form.mode = 'single'
  form.scope = 'single'
  form.date = date || weekStart.value
  form.weekdays = []
  form.startTime = startTime
  form.endTime = endTime
  form.slotTypeId = slotTypes.value[0]?.id || ''
  form.endsOn = ''
  formOpen.value = true
}
function bookingStateLabel(slot: AdminScheduleSlot) {
  if (!slot.booking) return ''
  const parts = [
    slot.booking.status === 'completed' ? '已完成' : '已预约'
  ]
  if (slot.booking.status === 'completed') {
    if (slot.booking.reconciliationStatus === undefined) {
      parts.push('对账状态同步中')
    } else {
      parts.push(slot.booking.reconciliationStatus === 'settled' ? '已对账' : '待对账')
    }
  }
  if (slot.status === 'frozen') parts.push('已暂停')
  return parts.join(' · ')
}

function slotVisualState(slot: AdminScheduleSlot) {
  if (!slot.booking) return 'empty'
  if (slot.booking.status === 'booked') return 'booked'
  return slot.booking.reconciliationStatus === 'settled' ? 'settled' : 'pending'
}

function slotAvailabilityLabel(slot: AdminScheduleSlot) {
  if (slot.status === 'frozen') return '已暂停'
  return slot.bookable ? '可预约' : '暂不可预约'
}

function slotMainLabel(slot: AdminScheduleSlot) {
  if (!slot.booking) return slotTypeName(slot)
  return slot.booking.participantName || '未命名预约人'
}

function slotSecondaryLabel(slot: AdminScheduleSlot) {
  if (!slot.booking) return slotAvailabilityLabel(slot)
  if (slot.booking.status === 'booked') return ''
  if (slot.booking.reconciliationStatus === 'settled') return '已对账'
  if (slot.booking.reconciliationStatus === 'pending') return '待对账'
  return '已完成'
}

function slotHoverLabel(slot: AdminScheduleSlot) {
  const time = slotLocalTime(slot.startAt) + '–' + slotLocalTime(slot.endAt)
  if (!slot.booking) return time + ' · ' + slotAvailabilityLabel(slot)
  const customer = slot.booking.userNickname || '未命名客户'
  const participant = slot.booking.participantName || '未命名预约人'
  const state = slotSecondaryLabel(slot)
  return time + ' · 客户：' + customer + ' · 预约人：' + participant + (state ? ' · ' + state : '')
}

function slotCompactStateLabel(slot: AdminScheduleSlot) {
  if (!slot.booking || slot.booking.status === 'booked') return ''
  if (slot.booking.reconciliationStatus === 'settled') return '已对账'
  if (slot.booking.reconciliationStatus === 'pending') return '待对账'
  return '已完成'
}

function bookingStatusLabel(booking: AdminBooking) {
  if (booking.status === 'completed') return '已完成'
  if (booking.status === 'cancelled') return '已取消'
  return '已预约'
}

function bookingReconciliationLabel(booking: AdminBooking) {
  if (booking.status !== 'completed') return ''
  if (booking.reconciliation === undefined) return '对账状态同步中'
  return booking.reconciliation?.status === 'settled' ? '已对账' : '待对账'
}

async function openSlot(slot: AdminScheduleSlot) {
  clearFeedback()
  selectedSlot.value = null
  selectedBooking.value = null
  selectedBookingSlot.value = null

  if (slot.booking) {
    selectedBookingSlot.value = slot
    selectedBookingUserNickname.value = slot.booking.userNickname || '未命名客户'
    detailLoading.value = true
    try {
      selectedBooking.value = await api.getBooking(spaceId.value, slot.booking.id)
    } catch (cause) {
      selectedBookingSlot.value = null
      showError(cause, '预约详情加载失败。')
    } finally {
      detailLoading.value = false
    }
    return
  }

  selectedSlot.value = slot
}

function closeSlotDetail() {
  selectedSlot.value = null
}

function closeBookingDetail() {
  selectedBooking.value = null
  selectedBookingSlot.value = null
  selectedBookingUserNickname.value = ''
  detailLoading.value = false
}

function showUnderlyingSlot() {
  const slot = selectedBookingSlot.value
  closeBookingDetail()
  if (slot) selectedSlot.value = slot
}

function refreshSelectedBookingSlot(slotId: string) {
  const refreshed = slots.value.find((slot) => slot.id === slotId)
  if (refreshed) selectedBookingSlot.value = refreshed
}

function openEdit(slot: AdminScheduleSlot) {
  selectedSlot.value = null
  editingSlot.value = slot
  form.mode = slot.seriesId ? 'weekly' : 'single'
  form.scope = 'single'
  form.date = slot.localDate
  form.startTime = slotLocalTime(slot.startAt)
  form.endTime = slotLocalTime(slot.endAt)
  form.slotTypeId = slot.slotTypeId
  form.weekdays = [new Date(slot.localDate + 'T12:00:00Z').getUTCDay() || 7]
  form.endsOn = ''
  formOpen.value = true
}
function startDrag(day: number, minute: number) {
  drag.day = day
  drag.startMinute = minute
  drag.currentMinute = minute
}
function moveDrag(day: number, minute: number) {
  if (drag.day === day && drag.startMinute >= 0) drag.currentMinute = minute
}
function finishDrag(day: number) {
  if (drag.day !== day || drag.startMinute < 0) return
  const start = Math.min(drag.startMinute, drag.currentMinute)
  const end = Math.max(drag.startMinute, drag.currentMinute) + 30
  const date = weekDays.value[day].date
  drag.day = -1
  drag.startMinute = -1
  drag.currentMinute = -1
  openCreate(date, minutesLabel(start), minutesLabel(end))
}
function toggleWeekday(day: number) {
  form.weekdays = form.weekdays.includes(day)
    ? form.weekdays.filter((item) => item !== day)
    : [...form.weekdays, day].sort()
}

async function saveSlot() {
  clearFeedback()
  if (!selectedResourceId.value || !form.slotTypeId) {
    error.value = '请选择预约项目和时段类型。'
    return
  }
  if (form.endTime <= form.startTime) {
    error.value = '结束时间必须晚于开始时间。'
    return
  }
  saving.value = true
  try {
    if (editingSlot.value) {
      await api.updateScheduleSlot(spaceId.value, editingSlot.value.id, {
        scope: form.scope,
        slotTypeId: form.slotTypeId,
        startAt: dateTimeLocal(form.date, form.startTime),
        endAt: dateTimeLocal(form.date, form.endTime),
        weekdays: form.scope === 'single' ? undefined : form.weekdays,
        localStartTime: form.scope === 'single' ? undefined : form.startTime,
        localEndTime: form.scope === 'single' ? undefined : form.endTime,
        endsOn: form.scope === 'single' ? undefined : (form.endsOn || null)
      })
      notice.value = '时段已更新。'
    } else if (form.mode === 'weekly') {
      if (!form.weekdays.length) {
        error.value = '每周重复至少选择一个星期。'
        return
      }
      await api.createSlotSeries(spaceId.value, {
        resourceId: selectedResourceId.value,
        slotTypeId: form.slotTypeId,
        weekdays: form.weekdays,
        localStartTime: form.startTime,
        localEndTime: form.endTime,
        startsOn: form.date,
        endsOn: form.endsOn || null
      })
      notice.value = '周期时段规则已创建。'
    } else {
      await api.createScheduleSlot(spaceId.value, {
        resourceId: selectedResourceId.value,
        slotTypeId: form.slotTypeId,
        startAt: dateTimeLocal(form.date, form.startTime),
        endAt: dateTimeLocal(form.date, form.endTime)
      })
      notice.value = '时段已创建。'
    }
    formOpen.value = false
    await loadSlots()
  } catch (cause) {
    showError(cause, '时段保存失败。')
  } finally {
    saving.value = false
  }
}
async function toggleFrozen(slot: AdminScheduleSlot) {
  clearFeedback()
  saving.value = true
  try {
    await api.setScheduleSlotFrozen(spaceId.value, slot.id, slot.status !== 'frozen')
    formOpen.value = false
    editingSlot.value = null
    selectedSlot.value = null
    await loadSlots()
    notice.value = slot.status === 'frozen' ? '时段已恢复。' : '时段已暂停；已有预约仍保留。'
  } catch (cause) {
    showError(cause, '时段状态更新失败。')
  } finally {
    saving.value = false
  }
}

async function cancelSlot(slot: AdminScheduleSlot) {
  if (!window.confirm('取消时段后将不再开放。若时段已有预约，必须先取消预约；已完成记录不会被删除。确认取消这个时段吗？')) return
  clearFeedback()
  saving.value = true
  try {
    await api.cancelScheduleSlot(spaceId.value, slot.id)
    formOpen.value = false
    editingSlot.value = null
    selectedSlot.value = null
    await loadSlots()
    notice.value = '时段已取消。'
  } catch (cause) {
    showError(cause, '时段取消失败；如已有预约，请先取消预约。')
  } finally {
    saving.value = false
  }
}

async function cancelBooking(booking: AdminBooking) {
  if (!window.confirm('取消后会释放这个时段的预约名额。确认取消该预约吗？')) return
  clearFeedback()
  saving.value = true
  try {
    selectedBooking.value = await api.cancelBooking(spaceId.value, booking.id)
    await loadSlots()
    refreshSelectedBookingSlot(booking.slot.id)
    notice.value = '预约已取消，这个时段已恢复为空闲状态。'
  } catch (cause) {
    showError(cause, '取消预约失败。')
  } finally {
    saving.value = false
  }
}

async function completeBooking(booking: AdminBooking) {
  if (!window.confirm('确认将该预约标记为已完成吗？完成后会进入待对账状态。')) return
  clearFeedback()
  saving.value = true
  try {
    selectedBooking.value = await api.completeBooking(spaceId.value, booking.id)
    await loadSlots()
    refreshSelectedBookingSlot(booking.slot.id)
    notice.value = '预约已完成，已进入待对账。'
  } catch (cause) {
    showError(cause, '标记完成失败。')
  } finally {
    saving.value = false
  }
}

async function reconcileBooking(booking: AdminBooking) {
  if (!window.confirm('确认这条已完成预约已经完成对账吗？')) return
  clearFeedback()
  saving.value = true
  try {
    selectedBooking.value = await api.reconcileBooking(spaceId.value, booking.id)
    await loadSlots()
    refreshSelectedBookingSlot(booking.slot.id)
    notice.value = '预约已标记为已对账。'
  } catch (cause) {
    showError(cause, '标记对账失败。')
  } finally {
    saving.value = false
  }
}

watch(selectedResourceId, () => {
  selectedSlot.value = null
  closeBookingDetail()
  if (!loading.value) void loadSlots()
})
watch(spaceId, loadBase)
onMounted(loadBase)
</script>

<template>
  <section
    class="schedule-view"
    :class="{ page: !props.embedded }"
    :style="{ '--schedule-row-height': GRID_ROW_HEIGHT + 'px', '--schedule-grid-height': gridMinutes.length * GRID_ROW_HEIGHT + 'px' }"
  >
      <section v-if="!props.embedded" class="page-heading page-heading--compact">
        <div>
          <div class="title-line"><h1>时段</h1></div>
          <p>按周配置预约项目的单次或周期时段。拖选以 30 分钟为网格，也可以在表单中输入精确时间。</p>
        </div>
        <button class="button button--primary" :disabled="!selectedResourceId" @click="openCreate()">+ 新建时段</button>
      </section>

      <div v-if="error" class="alert alert--error">{{ error }}</div>
      <div v-if="notice" class="alert alert--success">{{ notice }}</div>

      <section class="schedule-toolbar">
        <label class="compact-field">
          <span>预约项目</span>
          <select v-model="selectedResourceId" :disabled="loading && !resources.length">
            <option v-if="loading && !resources.length" value="" disabled>正在加载预约项目…</option>
            <option v-for="resource in resources" :key="resource.id" :value="resource.id">{{ resource.name }}</option>
          </select>
        </label>
        <div class="week-nav">
          <button class="button button--ghost" @click="goToday">今天</button>
          <button class="button button--ghost icon-nav icon-nav--previous" aria-label="上一周" @click="changeWeek(-1)"><AppIcon name="chevron" /></button>
          <strong>{{ weekStart.slice(5).replace('-', '/') }}–{{ weekEnd.slice(5).replace('-', '/') }}</strong>
          <button class="button button--ghost icon-nav" aria-label="下一周" @click="changeWeek(1)"><AppIcon name="chevron" /></button>
        </div>
        <button class="button button--primary" :disabled="!selectedResourceId" @click="openCreate()">+ 新建时段</button>
      </section>

      <section v-if="!loading && !resources.length" class="panel empty-state">还没有启用中的预约项目，请先创建或启用预约项目。</section>

      <section v-else class="panel schedule-panel desktop-schedule loading-surface" :aria-busy="loading || slotsLoading">
        <LoadingOverlay v-if="loading || slotsLoading" label="正在加载时段…" />
        <div class="week-head">
          <div class="time-gutter"></div>
          <div v-for="day in weekDays" :key="day.date" class="day-head">
            <strong>{{ day.label }}</strong><span>{{ day.short }}</span>
          </div>
        </div>
        <div class="schedule-body">
          <div class="time-column">
            <div v-for="minute in gridMinutes" :key="minute" class="time-label">{{ minutesLabel(minute) }}</div>
            <span class="time-boundary-label">{{ minutesLabel(GRID_END_MINUTE) }}</span>
          </div>
          <div
            v-for="(day, dayIndex) in weekDays"
            :key="day.date"
            class="day-column"
            @pointerup="finishDrag(dayIndex)"
            @pointerleave="drag.day === dayIndex && finishDrag(dayIndex)"
          >
            <button
              v-for="minute in gridMinutes"
              :key="minute"
              class="time-cell"
              :class="{ 'time-cell--selected': drag.day === dayIndex && minute >= Math.min(drag.startMinute, drag.currentMinute) && minute <= Math.max(drag.startMinute, drag.currentMinute) }"
              @pointerdown.prevent="startDrag(dayIndex, minute)"
              @pointerenter="moveDrag(dayIndex, minute)"
            ></button>
            <div class="day-slots">
              <div
                v-for="slot in slotsFor(day.date)"
                :key="slot.id"
                class="slot-card"
                :class="['slot-card--' + slotVisualState(slot), {
                  'slot-card--frozen': slot.status === 'frozen',
                  'slot-card--unavailable': !slot.booking && slot.status === 'open' && !slot.bookable
                }]"
                :style="slotStyle(slot)"
                role="button"
                tabindex="0"
                :aria-label="slotHoverLabel(slot)"
                :title="slotHoverLabel(slot)"
                @click.stop="openSlot(slot)"
                @keydown.enter.prevent="openSlot(slot)"
              >
                <strong class="slot-main-line">{{ slotMainLabel(slot) }}</strong>
                <small v-if="slotCompactStateLabel(slot)" class="slot-compact-state">{{ slotCompactStateLabel(slot) }}</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="loading || resources.length" class="mobile-agenda loading-surface" :aria-busy="loading || slotsLoading">
        <LoadingOverlay v-if="loading || slotsLoading" label="正在加载时段…" />
        <div class="mobile-day-nav">
          <button class="button button--ghost icon-nav icon-nav--previous" aria-label="前一天" @click="changeMobileDay(-1)"><AppIcon name="chevron" /></button>
          <div>
            <strong>{{ mobileDay?.date }}</strong>
            <span>{{ mobileDay?.label }}</span>
          </div>
          <button class="button button--ghost icon-nav" aria-label="后一天" @click="changeMobileDay(1)"><AppIcon name="chevron" /></button>
        </div>
        <div class="agenda-list">
          <button
            v-for="slot in slotsFor(mobileDay?.date || mobileDate)"
            :key="slot.id"
            class="agenda-slot"
            :class="['agenda-slot--' + slotVisualState(slot), {
              'agenda-slot--frozen': slot.status === 'frozen',
              'agenda-slot--unavailable': !slot.booking && slot.status === 'open' && !slot.bookable
            }]"
            @click="openSlot(slot)"
          >
            <span class="agenda-time">{{ slotLocalTime(slot.startAt) }}–{{ slotLocalTime(slot.endAt) }}</span>
            <span class="agenda-main">
              <strong>{{ slotMainLabel(slot) }}</strong>
              <small v-if="slotSecondaryLabel(slot)" class="agenda-state">{{ slotSecondaryLabel(slot) }}</small>
            </span>
            <span class="row-chevron">›</span>
          </button>
          <div v-if="slotsFor(mobileDay?.date || mobileDate).length === 0" class="empty-state compact">
            当天没有时段。
          </div>
        </div>
      </section>

      <div v-if="selectedSlot" class="modal-backdrop detail-backdrop" @click.self="closeSlotDetail">
        <section class="detail-drawer" role="dialog" aria-modal="true" aria-label="时段详情">
          <div class="panel-heading detail-heading">
            <div>
              <span class="eyebrow">时段详情</span>
              <h2>时段详情</h2>
              <p>{{ selectedSlot.localDate }} · {{ slotLocalTime(selectedSlot.startAt) }}–{{ slotLocalTime(selectedSlot.endAt) }}</p>
            </div>
            <button class="button button--ghost" @click="closeSlotDetail">关闭</button>
          </div>

          <div class="detail-hero">
            <strong>{{ slotMainLabel(selectedSlot) }}</strong>
            <span>{{ selectedSlot.booking ? bookingStateLabel(selectedSlot) : slotAvailabilityLabel(selectedSlot) }}</span>
          </div>

          <div class="detail-grid">
            <div><span>预约项目</span><strong>{{ selectedResource?.name || '—' }}</strong></div>
            <div><span>时段类型</span><strong>{{ slotTypeName(selectedSlot) }}</strong></div>
            <div><span>时段形式</span><strong>{{ selectedSlot.seriesId ? '周期时段' : '单次时段' }}</strong></div>
            <div><span>状态</span><strong>{{ slotAvailabilityLabel(selectedSlot) }}</strong></div>
          </div>

          <div v-if="selectedSlot.booking" class="detail-note">这个时段已有预约。预约处理请回到预约详情进行。</div>

          <div class="modal-actions detail-actions">
            <button
              v-if="selectedSlot.booking"
              class="button button--primary"
              :disabled="detailLoading"
              @click="openSlot(selectedSlot)"
            >返回预约详情</button>
            <button
              v-if="!selectedSlot.booking"
              class="button button--ghost"
              :disabled="saving"
              @click="openEdit(selectedSlot)"
            >编辑时段</button>
            <button
              v-if="!selectedSlot.booking"
              class="button button--ghost"
              :disabled="saving"
              @click="toggleFrozen(selectedSlot)"
            >{{ selectedSlot.status === 'frozen' ? '恢复时段' : '暂停时段' }}</button>
            <button
              v-if="!selectedSlot.booking"
              class="button button--danger-ghost"
              :disabled="saving"
              @click="cancelSlot(selectedSlot)"
            >取消时段</button>
          </div>
        </section>
      </div>

      <div v-if="selectedBookingSlot" class="modal-backdrop detail-backdrop" @click.self="closeBookingDetail">
        <section class="detail-drawer loading-surface" role="dialog" aria-modal="true" aria-label="预约详情">
          <LoadingOverlay v-if="detailLoading" label="正在加载预约详情…" />
          <div class="panel-heading detail-heading">
            <div>
              <span class="eyebrow">预约详情</span>
              <h2>预约详情</h2>
              <p>{{ selectedBookingSlot.localDate }} · {{ slotLocalTime(selectedBookingSlot.startAt) }}–{{ slotLocalTime(selectedBookingSlot.endAt) }}</p>
            </div>
            <button class="button button--ghost" @click="closeBookingDetail">关闭</button>
          </div>

          <template v-if="selectedBooking">
            <div class="detail-hero">
              <strong>{{ selectedBookingUserNickname }} · {{ selectedBooking.participant.name }}</strong>
              <span>
                {{ bookingStatusLabel(selectedBooking) }}
                <template v-if="selectedBooking.status === 'completed'"> · {{ bookingReconciliationLabel(selectedBooking) }}</template>
              </span>
            </div>

            <div class="detail-grid">
              <div><span>客户</span><strong>{{ selectedBookingUserNickname }}</strong></div>
              <div><span>预约人</span><strong>{{ selectedBooking.participant.name }}</strong></div>
              <div><span>预约项目</span><strong>{{ selectedBooking.resource.name }}</strong></div>
              <div><span>时段类型</span><strong>{{ selectedBooking.slotType.name }}</strong></div>
              <div><span>服务状态</span><strong>{{ bookingStatusLabel(selectedBooking) }}</strong></div>
              <div v-if="selectedBooking.status === 'completed'"><span>对账状态</span><strong>{{ bookingReconciliationLabel(selectedBooking) }}</strong></div>
            </div>

            <div class="detail-link-row">
              <button class="button button--ghost" @click="showUnderlyingSlot">查看所属时段</button>
            </div>

            <div class="modal-actions detail-actions">
              <button
                v-if="selectedBooking.status === 'booked'"
                class="button button--ghost"
                :disabled="saving"
                @click="completeBooking(selectedBooking)"
              >标记完成</button>
              <button
                v-if="selectedBooking.status === 'booked'"
                class="button button--danger-ghost"
                :disabled="saving"
                @click="cancelBooking(selectedBooking)"
              >取消预约</button>
              <button
                v-if="selectedBooking.status === 'completed' && selectedBooking.reconciliation?.status === 'pending'"
                class="button button--primary"
                :disabled="saving"
                @click="reconcileBooking(selectedBooking)"
              >标记已对账</button>
            </div>
          </template>
        </section>
      </div>

      <div v-if="formOpen" class="modal-backdrop" @click.self="formOpen = false">
        <section class="modal-card" role="dialog" aria-modal="true" aria-label="时段编辑">
          <div class="panel-heading">
            <div><span class="eyebrow">时段</span><h2>{{ editingSlot ? '编辑时段' : '新建时段' }}</h2></div>
            <button class="button button--ghost" @click="formOpen = false">关闭</button>
          </div>

          <div v-if="editingSlot" class="slot-detail-meta">
            <span>{{ editingSlot.seriesId ? '周期时段' : '单次时段' }}</span>
            <span>{{ editingSlot.status === 'frozen' ? '已暂停' : '可预约' }}</span>
            <span>{{ slotTypeName(editingSlot) }}</span>
          </div>

          <div class="field-grid schedule-form">
            <label v-if="!editingSlot" class="field"><span>时段方式</span>
              <select v-model="form.mode"><option value="single">仅本次</option><option value="weekly">每周重复</option></select>
            </label>
            <label v-if="editingSlot && editingSlot.seriesId" class="field"><span>作用范围</span>
              <select v-model="form.scope">
                <option value="single">仅本次</option>
                <option value="this_and_future">本次及之后</option>
                <option value="entire_series">整个周期</option>
              </select>
            </label>
            <label class="field"><span>日期 / 生效日</span><input v-model="form.date" type="date" /></label>
            <label class="field"><span>开始时间</span><input v-model="form.startTime" type="time" /></label>
            <label class="field"><span>结束时间</span><input v-model="form.endTime" type="time" /></label>
            <label class="field"><span>时段类型</span>
              <select v-model="form.slotTypeId"><option v-for="item in slotTypes" :key="item.id" :value="item.id">{{ item.name }}</option></select>
            </label>
          </div>

          <div v-if="form.mode === 'weekly' || (editingSlot?.seriesId && form.scope !== 'single')" class="repeat-panel">
            <span class="field-label">每周重复</span>
            <div class="weekday-picker">
              <button v-for="(label, index) in ['一','二','三','四','五','六','日']" :key="label" class="weekday-button" :class="{ active: form.weekdays.includes(index + 1) }" @click="toggleWeekday(index + 1)">周{{ label }}</button>
            </div>
            <label class="field"><span>结束日期（留空表示长期有效）</span><input v-model="form.endsOn" type="date" /></label>
          </div>

          <div class="modal-actions slot-modal-actions">
            <button
              v-if="editingSlot"
              class="button button--ghost"
              :disabled="saving"
              @click="toggleFrozen(editingSlot)"
            >{{ editingSlot.status === 'frozen' ? '恢复时段' : '暂停时段' }}</button>
            <button
              v-if="editingSlot && !editingSlot.booking"
              class="button button--danger-ghost"
              :disabled="saving"
              @click="cancelSlot(editingSlot)"
            >取消时段</button>
            <span class="modal-actions-spacer"></span>
            <button class="button button--ghost" @click="formOpen = false">取消</button>
            <button class="button button--primary" :disabled="saving" @click="saveSlot">{{ saving ? '保存中…' : '保存时段' }}</button>
          </div>
        </section>
      </div>
  </section>
</template>

<style scoped>
.schedule-view{min-width:0}
.schedule-toolbar{min-height:58px;display:grid;grid-template-columns:minmax(210px,280px) 1fr auto;align-items:center;gap: var(--space-14);margin-bottom: var(--space-12);padding: var(--space-8) var(--space-10);border:var(--border-width) solid var(--color-border);border-radius:var(--radius-12);background:var(--color-white)}
.compact-field{display:flex;align-items:center;gap: var(--space-9);min-width:0}.compact-field>span{font-size:var(--font-size-12);font-weight:700;color:var(--color-text-secondary);white-space:nowrap}.compact-field select{min-width:0;width:100%;height:var(--control-height-md)}
.week-nav{display:flex;align-items:center;justify-content:center;gap: var(--space-6)}.week-nav strong{min-width:88px;text-align:center;font-size:var(--font-size-13)}.week-nav>.button:first-child{min-height:var(--control-size-icon-nav);padding-inline:var(--space-12)}.icon-nav{width:var(--control-size-icon-nav);min-width:var(--control-size-icon-nav);height:var(--control-size-icon-nav);min-height:var(--control-size-icon-nav);padding:0;display:grid;place-items:center}.icon-nav :deep(.app-icon){width:var(--icon-size-nav-chevron);height:var(--icon-size-nav-chevron)}.icon-nav--previous :deep(.app-icon){transform:rotate(180deg)}
.schedule-panel{overflow:auto;padding: 0}.week-head,.schedule-body{display:grid;grid-template-columns:58px repeat(7,minmax(116px,1fr));min-width:890px}.time-gutter,.day-head{height:50px;border-bottom:var(--border-width) solid var(--color-border)}.day-head{display:grid;align-content:center;gap: var(--space-2);padding: 0 var(--space-10);border-left:var(--border-width) solid var(--color-border)}.day-head strong{font-size:var(--font-size-13)}.day-head span{color:var(--color-text-secondary);font-size:var(--font-size-11)}.schedule-body{align-items:start}.time-column{display:grid;position:relative}.time-label{height:var(--schedule-row-height);padding: var(--space-6) var(--space-7);color:var(--color-text-secondary);font-size:var(--font-size-10);border-bottom:var(--border-width) solid var(--color-border)}.time-boundary-label{position:absolute;right:var(--space-7);bottom:0;transform:translateY(50%);z-index:1;padding-left:var(--space-4);background:var(--color-white);color:var(--color-text-secondary);font-size:var(--font-size-10)}.day-column{position:relative;border-left:var(--border-width) solid var(--color-border);min-height:var(--schedule-grid-height)}.time-cell{display:block;width:100%;height:var(--schedule-row-height);border:0;border-bottom:var(--border-width) solid var(--color-border);background:transparent;padding: 0;cursor:crosshair}.time-cell:hover,.time-cell--selected{background:var(--color-primary-soft)}.day-slots{position:absolute;inset:0;pointer-events:none}.slot-card{position:absolute;left:4px;right:4px;pointer-events:auto;border:var(--border-width) solid var(--color-slot-border);border-left:var(--border-width-strong) solid var(--color-primary);border-radius:var(--radius-7);background:var(--color-white);padding: var(--space-4) var(--space-6);text-align:left;display:flex;align-items:center;gap: var(--space-5);box-shadow:var(--shadow-slot);overflow:hidden;cursor:pointer}.slot-card strong{font-size:var(--font-size-12);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.slot-card small{font-size:var(--font-size-9);line-height:1.2}.slot-main-line{min-width:0;flex:1;color:var(--color-text-primary)}.slot-compact-state{flex:0 0 auto;white-space:nowrap;color:var(--color-text-secondary)}.slot-card--empty{background:var(--color-white)}.slot-card--booked{background:var(--color-status-booked-bg);border-color:var(--color-slot-border);border-left-color:var(--color-status-booked-text)}.slot-card--pending{background:var(--color-status-pending-bg);border-color:var(--color-status-pending-text);border-left-color:var(--color-status-pending-text)}.slot-card--settled{background:var(--color-status-settled-bg);border-color:var(--color-status-settled-text);border-left-color:var(--color-status-settled-text)}.slot-card--frozen{border-color:var(--color-slot-frozen-border);border-left-color:var(--color-slot-frozen-accent);border-style:dashed}.slot-card--empty.slot-card--frozen{background:var(--color-slot-frozen-bg)}.slot-card--unavailable .slot-main-line{color:var(--color-text-secondary)}
.mobile-agenda{display:none}
.modal-backdrop{position:fixed;inset:0;background:var(--color-overlay-soft);display:grid;place-items:center;padding: var(--space-24);z-index:20}.modal-card{width:min(720px,100%);max-height:90vh;overflow:auto;background:var(--color-white);border-radius:var(--radius-16);padding: var(--space-20);box-shadow:var(--shadow-schedule-modal)}.detail-backdrop{display:flex;justify-content:flex-end;align-items:stretch;padding:0}.detail-drawer{position:relative;width:min(440px,100%);height:100%;overflow:auto;background:var(--color-white);padding:var(--space-20);box-shadow:var(--shadow-schedule-modal)}.detail-heading{align-items:flex-start}.detail-heading p{margin:var(--space-4) 0 0;color:var(--color-text-secondary);font-size:var(--font-size-12)}.detail-hero{display:grid;gap:var(--space-4);margin:var(--space-14) 0;padding:var(--space-14);border:var(--border-width) solid var(--color-border);border-radius:var(--radius-12);background:var(--color-surface-subtle)}.detail-hero strong{font-size:var(--font-size-16)}.detail-hero span{font-size:var(--font-size-12);color:var(--color-text-secondary)}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-10)}.detail-grid>div{display:grid;gap:var(--space-4);padding:var(--space-10);border:var(--border-width) solid var(--color-border-subtle);border-radius:var(--radius-10)}.detail-grid span{font-size:var(--font-size-11);color:var(--color-text-secondary)}.detail-grid strong{font-size:var(--font-size-13);overflow-wrap:anywhere}.detail-note{margin-top:var(--space-12);padding:var(--space-10);border-radius:var(--radius-10);background:var(--color-surface-muted);color:var(--color-text-secondary);font-size:var(--font-size-12)}.detail-link-row{display:flex;margin-top:var(--space-12)}.detail-actions{padding-top:var(--space-12);border-top:var(--border-width) solid var(--color-border-subtle)}.schedule-form{margin-top: var(--space-12)}.slot-detail-meta{display:flex;gap: var(--space-8);flex-wrap:wrap;margin: var(--space-10) 0 var(--space-4)}.slot-detail-meta span{padding: var(--space-4) var(--space-8);border-radius:var(--radius-pill);background:var(--color-neutral-pill);color:var(--color-text-secondary);font-size:var(--font-size-11)}.repeat-panel{margin-top: var(--space-14);padding: var(--space-14);border:var(--border-width) solid var(--color-border);border-radius:var(--radius-10);display:grid;gap: var(--space-12)}.field-label{font-size:var(--font-size-12);font-weight:600}.weekday-picker{display:flex;gap: var(--space-6);flex-wrap:wrap}.weekday-button{border:var(--border-width) solid var(--color-border);background:var(--color-white);border-radius:var(--radius-pill);padding: var(--space-6) var(--space-10);cursor:pointer;font-size:var(--font-size-12)}.weekday-button.active{background:var(--color-primary-soft);border-color:var(--color-primary);color:var(--color-primary)}.modal-actions{display:flex;justify-content:flex-end;align-items:center;gap: var(--space-8);margin-top: var(--space-16)}.modal-actions-spacer{flex:1}
@media(max-width:820px){.week-nav>.button:first-child{min-height:var(--control-size-icon-nav-touch)}.week-nav .icon-nav,.mobile-day-nav .icon-nav{width:var(--control-size-icon-nav-touch);min-width:var(--control-size-icon-nav-touch);height:var(--control-size-icon-nav-touch);min-height:var(--control-size-icon-nav-touch)}.schedule-toolbar{grid-template-columns:1fr auto;gap: var(--space-8)}.schedule-toolbar>.button--primary{grid-column:2;grid-row:1}.week-nav{grid-column:1 / -1;justify-content:space-between;border-top:var(--border-width) solid var(--color-border);padding-top: var(--space-8)}.desktop-schedule{display:none}.mobile-agenda{display:block;border:var(--border-width) solid var(--color-border);border-radius:var(--radius-12);background:var(--color-white);overflow:hidden}.mobile-day-nav{min-height:52px;display:grid;grid-template-columns:40px 1fr 40px;align-items:center;border-bottom:var(--border-width) solid var(--color-border);padding: var(--space-4) var(--space-8)}.mobile-day-nav>div{display:flex;align-items:center;justify-content:center;gap: var(--space-8)}.mobile-day-nav strong{font-size:var(--font-size-14)}.mobile-day-nav span{font-size:var(--font-size-12);color:var(--color-text-secondary)}.agenda-list{display:grid}.agenda-slot{min-height:60px;border:0;border-bottom:var(--border-width) solid var(--color-border);background:var(--color-white);padding: var(--space-9) var(--space-12);display:grid;grid-template-columns:92px minmax(0,1fr) 16px;align-items:center;gap: var(--space-10);text-align:left;color:var(--color-text-primary)}.agenda-slot:last-child{border-bottom:0}.agenda-slot--booked{background:var(--color-status-booked-bg)}.agenda-slot--pending{background:var(--color-status-pending-bg)}.agenda-slot--settled{background:var(--color-status-settled-bg)}.agenda-slot--frozen{border-left:var(--border-width-strong) dashed var(--color-slot-frozen-accent)}.agenda-slot--empty.agenda-slot--frozen{background:var(--color-slot-frozen-bg)}.agenda-slot--unavailable .agenda-main strong{color:var(--color-text-secondary)}.agenda-time{font-size:var(--font-size-12);color:var(--color-text-secondary)}.agenda-main{display:grid;gap: var(--space-2)}.agenda-main strong{font-size:var(--font-size-14)}.agenda-main small{font-size:var(--font-size-12);color:var(--color-text-secondary)}.agenda-state{font-size:var(--font-size-11)!important}.modal-backdrop{align-items:end;padding: 0}.modal-card{width:100%;max-width:none;max-height:92vh;border-radius:var(--radius-18) var(--radius-18) 0 0;padding: var(--space-18) var(--space-16) calc(var(--space-18) + env(safe-area-inset-bottom))}.detail-backdrop{align-items:flex-end}.detail-drawer{width:100%;height:auto;max-height:92vh;border-radius:var(--radius-18) var(--radius-18) 0 0;padding:var(--space-18) var(--space-16) calc(var(--space-18) + env(safe-area-inset-bottom))}.detail-grid{grid-template-columns:1fr}}
@media(max-width:560px){.schedule-toolbar{grid-template-columns:minmax(0,1fr) auto}.compact-field>span{display:none}.schedule-toolbar>.button--primary{padding-inline: var(--space-12)}.week-nav .button:first-child{font-size:var(--font-size-13)}}
</style>
