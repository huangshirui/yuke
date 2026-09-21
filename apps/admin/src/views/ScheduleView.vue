<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAdminApi } from '../services/adminApi'
import type { AdminResource, AdminScheduleSlot, AdminSlotType, AdminSpace } from '../types/admin'

const props = withDefaults(defineProps<{ embedded?: boolean }>(), {
  embedded: false
})

const api = getAdminApi()
const route = useRoute()
const router = useRouter()

const spaceId = computed(() => String(route.params.spaceId))
const space = ref<AdminSpace | null>(null)
const resources = ref<AdminResource[]>([])
const slotTypes = ref<AdminSlotType[]>([])
const slots = ref<AdminScheduleSlot[]>([])
const selectedResourceId = ref('')
const weekStart = ref(startOfWeek(new Date()))
const mobileDate = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')

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
const gridMinutes = Array.from({ length: 25 }, (_, index) => 8 * 60 + index * 30)

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
  const endMinute = end.hour * 60 + end.minute
  const rowHeight = 34
  const top = Math.max(0, ((startMinute - 8 * 60) / 30) * rowHeight)
  const height = Math.max(rowHeight, ((endMinute - startMinute) / 30) * rowHeight)
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
    showError(cause, '排期加载失败。')
  } finally {
    loading.value = false
  }
}
async function loadSlots() {
  if (!selectedResourceId.value) {
    slots.value = []
    return
  }
  slots.value = await api.listScheduleSlots(
    spaceId.value,
    selectedResourceId.value,
    weekStart.value,
    weekEnd.value
  )
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
  if (slot.status === 'frozen') parts.push('已冻结')
  return parts.join(' · ')
}

function openSlot(slot: AdminScheduleSlot) {
  if (slot.booking) {
    router.push({
      path: '/spaces/' + encodeURIComponent(spaceId.value) + '/reservations',
      query: { view: 'list', bookingId: slot.booking.id }
    })
    return
  }
  if (!slot.bookable && slot.status === 'open') {
    error.value = '这个时段已被占用，预约详情正在同步，请稍后刷新。'
    return
  }
  openEdit(slot)
}
function openEdit(slot: AdminScheduleSlot) {
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
    error.value = '请选择预约对象和时段类型。'
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
      notice.value = '周期开放规则已创建。'
    } else {
      await api.createScheduleSlot(spaceId.value, {
        resourceId: selectedResourceId.value,
        slotTypeId: form.slotTypeId,
        startAt: dateTimeLocal(form.date, form.startTime),
        endAt: dateTimeLocal(form.date, form.endTime)
      })
      notice.value = '开放时段已创建。'
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
    await loadSlots()
    notice.value = slot.status === 'frozen' ? '时段已解冻。' : '时段已冻结；已有预约仍保留。'
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
    await loadSlots()
    notice.value = '时段已取消。'
  } catch (cause) {
    showError(cause, '时段取消失败；如已有预约，请先取消预约。')
  } finally {
    saving.value = false
  }
}

watch(selectedResourceId, () => loadSlots().catch((cause) => showError(cause, '时段加载失败。')))
watch(spaceId, loadBase)
onMounted(loadBase)
</script>

<template>
  <section class="schedule-view" :class="{ page: !props.embedded }">
    <div v-if="loading" class="empty-state">正在加载排期…</div>
    <template v-else-if="space">
      <section v-if="!props.embedded" class="page-heading page-heading--compact">
        <div>
          <div class="title-line"><h1>开放时间</h1></div>
          <p>按周配置预约对象的单次或周期开放时段。拖选以 30 分钟为网格，也可以在表单中输入精确时间。</p>
        </div>
        <button class="button button--primary" :disabled="!selectedResourceId" @click="openCreate()">+ 新建时段</button>
      </section>

      <div v-if="error" class="alert alert--error">{{ error }}</div>
      <div v-if="notice" class="alert alert--success">{{ notice }}</div>

      <section class="schedule-toolbar">
        <label class="compact-field">
          <span>预约对象</span>
          <select v-model="selectedResourceId">
            <option v-for="resource in resources" :key="resource.id" :value="resource.id">{{ resource.name }}</option>
          </select>
        </label>
        <div class="week-nav">
          <button class="button button--ghost" @click="goToday">今天</button>
          <button class="button button--ghost icon-nav" aria-label="上一周" @click="changeWeek(-1)">‹</button>
          <strong>{{ weekStart.slice(5).replace('-', '/') }}–{{ weekEnd.slice(5).replace('-', '/') }}</strong>
          <button class="button button--ghost icon-nav" aria-label="下一周" @click="changeWeek(1)">›</button>
        </div>
        <button class="button button--primary" :disabled="!selectedResourceId" @click="openCreate()">+ 新建时段</button>
      </section>

      <section v-if="!resources.length" class="panel empty-state">还没有启用中的预约对象，请先创建或启用预约对象。</section>

      <section v-else class="panel schedule-panel desktop-schedule">
        <div class="week-head">
          <div class="time-gutter"></div>
          <div v-for="day in weekDays" :key="day.date" class="day-head">
            <strong>{{ day.label }}</strong><span>{{ day.short }}</span>
          </div>
        </div>
        <div class="schedule-body">
          <div class="time-column">
            <div v-for="minute in gridMinutes" :key="minute" class="time-label">{{ minutesLabel(minute) }}</div>
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
                :class="{ 'slot-card--frozen': slot.status === 'frozen' }"
                :style="slotStyle(slot)"
                role="button"
                tabindex="0"
                :aria-label="slot.booking
                  ? slotLocalTime(slot.startAt) + ' 到 ' + slotLocalTime(slot.endAt) + '，已预约'
                  : slotLocalTime(slot.startAt) + ' 到 ' + slotLocalTime(slot.endAt) + '，可预约'"
                @click.stop="openSlot(slot)"
                @keydown.enter.prevent="openSlot(slot)"
              >
                <strong>{{ slotLocalTime(slot.startAt) }}–{{ slotLocalTime(slot.endAt) }}</strong>
                <span v-if="slot.booking" class="slot-booking-line">
                  {{ slot.booking.userNickname || '未命名用户' }} · {{ slot.booking.participantName || '未命名参与人' }}
                </span>
                <small v-if="slot.booking" class="slot-operational-state">{{ bookingStateLabel(slot) }}</small>
                <span v-else class="slot-availability">
                  {{ slot.status === 'frozen' ? '暂不可预约' : !slot.bookable ? '已占用' : '可预约' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="resources.length" class="mobile-agenda">
        <div class="mobile-day-nav">
          <button class="button button--ghost icon-nav" aria-label="前一天" @click="changeMobileDay(-1)">‹</button>
          <div>
            <strong>{{ mobileDay?.date }}</strong>
            <span>{{ mobileDay?.label }}</span>
          </div>
          <button class="button button--ghost icon-nav" aria-label="后一天" @click="changeMobileDay(1)">›</button>
        </div>
        <div class="agenda-list">
          <button
            v-for="slot in slotsFor(mobileDay?.date || mobileDate)"
            :key="slot.id"
            class="agenda-slot"
            :class="{ 'agenda-slot--booked': slot.booking, 'agenda-slot--frozen': slot.status === 'frozen' }"
            @click="openSlot(slot)"
          >
            <span class="agenda-time">{{ slotLocalTime(slot.startAt) }}–{{ slotLocalTime(slot.endAt) }}</span>
            <span class="agenda-main">
              <strong v-if="slot.booking">{{ slot.booking.userNickname || '未命名用户' }}</strong>
              <strong v-else>{{ slot.status === 'frozen' ? '暂不可预约' : !slot.bookable ? '已占用' : '可预约' }}</strong>
              <small v-if="slot.booking">{{ slot.booking.participantName || '未命名参与人' }}</small>
              <small v-if="slot.booking" class="agenda-state">{{ bookingStateLabel(slot) }}</small>
            </span>
            <span class="row-chevron">›</span>
          </button>
          <div v-if="slotsFor(mobileDay?.date || mobileDate).length === 0" class="empty-state compact">
            当天没有开放时段。
          </div>
        </div>
      </section>

      <div v-if="formOpen" class="modal-backdrop" @click.self="formOpen = false">
        <section class="modal-card" role="dialog" aria-modal="true" aria-label="时段编辑">
          <div class="panel-heading">
            <div><span class="eyebrow">Schedule</span><h2>{{ editingSlot ? '编辑时段' : '新建开放时段' }}</h2></div>
            <button class="button button--ghost" @click="formOpen = false">关闭</button>
          </div>

          <div v-if="editingSlot" class="slot-detail-meta">
            <span>{{ editingSlot.seriesId ? '周期时段' : '单次时段' }}</span>
            <span>{{ editingSlot.status === 'frozen' ? '已冻结' : '开放中' }}</span>
            <span>{{ slotTypeName(editingSlot) }}</span>
          </div>

          <div class="field-grid schedule-form">
            <label v-if="!editingSlot" class="field"><span>开放方式</span>
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
            >{{ editingSlot.status === 'frozen' ? '解冻时段' : '冻结时段' }}</button>
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
    </template>
  </section>
</template>

<style scoped>
.schedule-view{min-width:0}
.schedule-toolbar{min-height:58px;display:grid;grid-template-columns:minmax(210px,280px) 1fr auto;align-items:center;gap:14px;margin-bottom:12px;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:#fff}
.compact-field{display:flex;align-items:center;gap:9px;min-width:0}.compact-field>span{font-size:12px;font-weight:700;color:var(--muted);white-space:nowrap}.compact-field select{min-width:0;width:100%;height:38px}
.week-nav{display:flex;align-items:center;justify-content:center;gap:6px}.week-nav strong{min-width:88px;text-align:center;font-size:13px}.icon-nav{min-width:36px;padding-inline:10px;font-size:18px}
.schedule-panel{overflow:auto;padding:0}.week-head,.schedule-body{display:grid;grid-template-columns:58px repeat(7,minmax(116px,1fr));min-width:890px}.time-gutter,.day-head{height:50px;border-bottom:1px solid var(--line)}.day-head{display:grid;align-content:center;gap:2px;padding:0 10px;border-left:1px solid var(--line)}.day-head strong{font-size:13px}.day-head span{color:var(--muted);font-size:11px}.schedule-body{align-items:start}.time-column{display:grid}.time-label{height:34px;padding:6px 7px;color:var(--muted);font-size:10px;border-bottom:1px solid var(--line)}.day-column{position:relative;border-left:1px solid var(--line);min-height:850px}.time-cell{display:block;width:100%;height:34px;border:0;border-bottom:1px solid var(--line);background:transparent;padding:0;cursor:crosshair}.time-cell:hover,.time-cell--selected{background:var(--accent-soft)}.day-slots{position:absolute;inset:0;pointer-events:none}.slot-card{position:absolute;left:4px;right:4px;pointer-events:auto;border:1px solid #badbd5;border-left:3px solid var(--accent);border-radius:7px;background:#fff;padding:6px 7px;text-align:left;display:grid;align-content:start;gap:2px;box-shadow:0 1px 4px rgba(23,32,42,.04);overflow:hidden}.slot-card strong{font-size:12px;line-height:1.15;white-space:nowrap}.slot-card span{font-size:10px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.slot-card small{font-size:9px;line-height:1.2}.slot-booking-line{color:var(--ink)!important;font-weight:650}.slot-operational-state{color:var(--muted)}.slot-availability{color:var(--accent)!important}.slot-card--frozen{border-color:#d5d9dc;border-left-color:#77838c;background:#f4f6f7}
.mobile-agenda{display:none}
.modal-backdrop{position:fixed;inset:0;background:rgba(10,20,20,.36);display:grid;place-items:center;padding:24px;z-index:20}.modal-card{width:min(720px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.2)}.schedule-form{margin-top:12px}.slot-detail-meta{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 4px}.slot-detail-meta span{padding:4px 8px;border-radius:999px;background:#f1f4f4;color:var(--muted);font-size:11px}.repeat-panel{margin-top:14px;padding:14px;border:1px solid var(--line);border-radius:10px;display:grid;gap:12px}.field-label{font-size:12px;font-weight:600}.weekday-picker{display:flex;gap:6px;flex-wrap:wrap}.weekday-button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 10px;cursor:pointer;font-size:12px}.weekday-button.active{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}.modal-actions{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:16px}.modal-actions-spacer{flex:1}
@media(max-width:820px){.schedule-toolbar{grid-template-columns:1fr auto;gap:8px}.schedule-toolbar>.button--primary{grid-column:2;grid-row:1}.week-nav{grid-column:1 / -1;justify-content:space-between;border-top:1px solid var(--line);padding-top:8px}.desktop-schedule{display:none}.mobile-agenda{display:block;border:1px solid var(--line);border-radius:12px;background:#fff;overflow:hidden}.mobile-day-nav{min-height:52px;display:grid;grid-template-columns:40px 1fr 40px;align-items:center;border-bottom:1px solid var(--line);padding:4px 8px}.mobile-day-nav>div{display:flex;align-items:center;justify-content:center;gap:8px}.mobile-day-nav strong{font-size:14px}.mobile-day-nav span{font-size:12px;color:var(--muted)}.agenda-list{display:grid}.agenda-slot{min-height:60px;border:0;border-bottom:1px solid var(--line);background:#fff;padding:9px 12px;display:grid;grid-template-columns:92px minmax(0,1fr) 16px;align-items:center;gap:10px;text-align:left;color:var(--ink)}.agenda-slot:last-child{border-bottom:0}.agenda-slot--booked{background:#f7fbfa}.agenda-slot--frozen{background:#f4f6f7}.agenda-time{font-size:12px;color:var(--muted)}.agenda-main{display:grid;gap:2px}.agenda-main strong{font-size:14px}.agenda-main small{font-size:12px;color:var(--muted)}.agenda-state{font-size:11px!important}.modal-backdrop{align-items:end;padding:0}.modal-card{width:100%;max-width:none;max-height:92vh;border-radius:18px 18px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom))}}
@media(max-width:560px){.schedule-toolbar{grid-template-columns:minmax(0,1fr) auto}.compact-field>span{display:none}.schedule-toolbar>.button--primary{padding-inline:12px}.week-nav .button:first-child{font-size:13px}}
</style>
