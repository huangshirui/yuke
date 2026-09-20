<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAdminApi } from '../services/adminApi'
import type { AdminResource, AdminScheduleSlot, AdminSlotType, AdminSpace } from '../types/admin'

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

function startOfWeek(date: Date) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = value.getUTCDay() || 7
  value.setUTCDate(value.getUTCDate() - day + 1)
  return value.toISOString().slice(0, 10)
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
function dateTimeLocal(date: string, time: string) {
  const zone = space.value?.timezone || 'UTC'
  const probe = new Date(date + 'T' + time + ':00Z')
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(probe)
  const read = (type: string) => Number(local.find((part) => part.type === type)?.value)
  const desired = Date.UTC(
    Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)),
    Number(time.slice(0, 2)), Number(time.slice(3, 5))
  )
  const represented = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'))
  return new Date(desired - (represented - probe.getTime())).toISOString()
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
  await loadSlots()
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
function openEdit(slot: AdminScheduleSlot) {
  editingSlot.value = slot
  form.mode = slot.seriesId ? 'weekly' : 'single'
  form.scope = 'single'
  form.date = slot.localDate
  form.startTime = slot.startAt.slice(11, 16)
  form.endTime = slot.endAt.slice(11, 16)
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
    await loadSlots()
    notice.value = slot.status === 'frozen' ? '时段已解冻。' : '时段已冻结；已有预约仍保留。'
  } catch (cause) {
    showError(cause, '时段状态更新失败。')
  } finally {
    saving.value = false
  }
}

watch(selectedResourceId, () => loadSlots().catch((cause) => showError(cause, '时段加载失败。')))
watch(spaceId, loadBase)
onMounted(loadBase)
</script>

<template>
  <main class="page">
    <div v-if="loading" class="empty-state">正在加载排期…</div>
    <template v-else-if="space">
      <section class="page-heading page-heading--compact">
        <div>
          <button class="back-link" @click="router.push('/spaces/' + spaceId + '/resources')">← 返回空间</button>
          <div class="title-line"><h1>开放时间</h1><span class="status-pill status-pill--active">{{ space.name }}</span></div>
          <p>按周配置预约对象的单次或周期开放时段。拖选以 30 分钟为网格，也可以在表单中输入精确时间。</p>
        </div>
        <button class="button button--primary" :disabled="!selectedResourceId" @click="openCreate()">+ 新建时段</button>
      </section>

      <div v-if="error" class="alert alert--error">{{ error }}</div>
      <div v-if="notice" class="alert alert--success">{{ notice }}</div>

      <section class="panel schedule-toolbar">
        <label class="field">
          <span>预约对象</span>
          <select v-model="selectedResourceId">
            <option v-for="resource in resources" :key="resource.id" :value="resource.id">{{ resource.name }}</option>
          </select>
        </label>
        <div class="week-nav">
          <button class="button button--ghost" @click="changeWeek(-1)">← 上一周</button>
          <strong>{{ weekStart }} — {{ weekEnd }}</strong>
          <button class="button button--ghost" @click="changeWeek(1)">下一周 →</button>
        </div>
      </section>

      <section v-if="!resources.length" class="panel empty-state">还没有启用中的预约对象，请先创建或启用预约对象。</section>

      <section v-else class="panel schedule-panel">
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
              <button
                v-for="slot in slotsFor(day.date)"
                :key="slot.id"
                class="slot-card"
                :class="{ 'slot-card--frozen': slot.status === 'frozen' }"
                @click.stop="openEdit(slot)"
              >
                <strong>{{ slot.startAt.slice(11, 16) }}–{{ slot.endAt.slice(11, 16) }}</strong>
                <span>{{ slotTypeName(slot) }}</span>
                <small>{{ slot.status === 'frozen' ? '已冻结' : slot.seriesId ? '每周重复' : '单次' }}</small>
                <span class="slot-actions">
                  <button class="mini-action" @click.stop="toggleFrozen(slot)">{{ slot.status === 'frozen' ? '解冻' : '冻结' }}</button>
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <div v-if="formOpen" class="modal-backdrop" @click.self="formOpen = false">
        <section class="modal-card" role="dialog" aria-modal="true" aria-label="时段编辑">
          <div class="panel-heading">
            <div><span class="eyebrow">Schedule</span><h2>{{ editingSlot ? '编辑时段' : '新建开放时段' }}</h2></div>
            <button class="button button--ghost" @click="formOpen = false">关闭</button>
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

          <div class="modal-actions">
            <button class="button button--ghost" @click="formOpen = false">取消</button>
            <button class="button button--primary" :disabled="saving" @click="saveSlot">{{ saving ? '保存中…' : '保存时段' }}</button>
          </div>
        </section>
      </div>
    </template>
  </main>
</template>

<style scoped>
.schedule-toolbar{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:16px}.schedule-toolbar .field{min-width:260px}.week-nav{display:flex;align-items:center;gap:12px}.schedule-panel{overflow:auto;padding:0}.week-head,.schedule-body{display:grid;grid-template-columns:72px repeat(7,minmax(132px,1fr));min-width:1050px}.time-gutter,.day-head{height:64px;border-bottom:1px solid var(--line)}.day-head{display:grid;align-content:center;gap:3px;padding:0 12px;border-left:1px solid var(--line)}.day-head span{color:var(--muted);font-size:12px}.schedule-body{align-items:start}.time-column{display:grid}.time-label{height:36px;padding:7px 8px;color:var(--muted);font-size:11px;border-bottom:1px solid var(--line)}.day-column{position:relative;border-left:1px solid var(--line);min-height:900px}.time-cell{display:block;width:100%;height:36px;border:0;border-bottom:1px solid var(--line);background:transparent;padding:0;cursor:crosshair}.time-cell:hover,.time-cell--selected{background:var(--accent-soft)}.day-slots{position:absolute;inset:4px;display:grid;align-content:start;gap:6px;pointer-events:none}.slot-card{pointer-events:auto;border:1px solid #badbd5;border-left:4px solid var(--accent);border-radius:10px;background:#fff;padding:8px;text-align:left;display:grid;gap:2px;box-shadow:0 2px 8px rgba(23,32,42,.06)}.slot-card span,.slot-card small{font-size:11px;color:var(--muted)}.slot-card--frozen{border-color:#d5d9dc;border-left-color:#77838c;background:#f4f6f7}.slot-actions{margin-top:5px}.mini-action{border:0;background:transparent;padding:0;color:var(--accent);font-size:11px;cursor:pointer}.modal-backdrop{position:fixed;inset:0;background:rgba(10,20,20,.36);display:grid;place-items:center;padding:24px;z-index:20}.modal-card{width:min(720px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.2)}.schedule-form{margin-top:14px}.repeat-panel{margin-top:18px;padding:16px;border:1px solid var(--line);border-radius:12px;display:grid;gap:14px}.field-label{font-size:13px;font-weight:600}.weekday-picker{display:flex;gap:8px;flex-wrap:wrap}.weekday-button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:7px 11px;cursor:pointer}.weekday-button.active{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}.modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}@media(max-width:820px){.schedule-toolbar,.week-nav{align-items:stretch;flex-direction:column}.schedule-toolbar .field{min-width:0}.modal-card{padding:16px}}
</style>
