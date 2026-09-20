<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAdminApi } from '../services/adminApi'
import type {
  AdminBooking,
  AdminMemberDetail,
  AdminResource,
  AdminScheduleSlot,
  AdminSlotType,
  AdminSpace,
  BookingFilters
} from '../types/admin'

const api = getAdminApi()
const route = useRoute()
const router = useRouter()

const spaces = ref<AdminSpace[]>([])
const selectedSpaceId = ref('')
const resources = ref<AdminResource[]>([])
const slotTypes = ref<AdminSlotType[]>([])
const bookings = ref<AdminBooking[]>([])
const selectedBooking = ref<AdminBooking | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')

const filters = reactive<BookingFilters>({
  from: '',
  to: '',
  status: undefined,
  resourceId: '',
  participantId: '',
  slotTypeId: ''
})

const editOpen = ref(false)
const editingBooking = ref<AdminBooking | null>(null)
const editMember = ref<AdminMemberDetail | null>(null)
const editResourceId = ref('')
const editSlots = ref<AdminScheduleSlot[]>([])
const edit = reactive({
  slotId: '',
  participantId: ''
})

const selectedSpace = computed(
  () => spaces.value.find((item) => item.id === selectedSpaceId.value) ?? null
)

const participantOptions = computed(() => {
  const seen = new Map<string, { id: string; name: string }>()
  for (const booking of bookings.value) {
    if (!seen.has(booking.participant.id)) {
      seen.set(booking.participant.id, {
        id: booking.participant.id,
        name: booking.participant.name
      })
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})

const activeEditParticipants = computed(() =>
  (editMember.value?.participants ?? []).filter((item) => item.status === 'active')
)

const metrics = computed(() => ({
  total: bookings.value.length,
  booked: bookings.value.filter((item) => item.status === 'booked').length,
  completed: bookings.value.filter((item) => item.status === 'completed').length,
  cancelled: bookings.value.filter((item) => item.status === 'cancelled').length
}))

function clearFeedback() {
  error.value = ''
  notice.value = ''
}

function errorCode(cause: unknown) {
  return cause && typeof cause === 'object' && 'code' in cause
    ? String((cause as { code?: unknown }).code || '')
    : ''
}

function friendlyError(cause: unknown, fallback: string) {
  const code = errorCode(cause)
  if (code === 'SLOT_ALREADY_BOOKED') return '这个时间刚刚被预约了，请选择其他时间。'
  if (code === 'SLOT_FROZEN') return '这个时段已冻结，请选择其他时间。'
  if (code === 'BOOKING_CUTOFF_REACHED') return '目标时段已超过最晚预约时间，请选择其他时段。'
  if (code === 'SLOT_NOT_BOOKABLE') return '目标时段当前不可预约，请刷新后重新选择。'
  return cause instanceof Error ? cause.message : fallback
}

function statusLabel(status: AdminBooking['status']) {
  if (status === 'completed') return '已完成'
  if (status === 'cancelled') return '已取消'
  return '已预约'
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: selectedSpace.value?.timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(date: string, days: number) {
  const value = new Date(date + 'T00:00:00Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

async function loadBase() {
  loading.value = true
  clearFeedback()
  try {
    spaces.value = await api.listSpaces()
    const querySpaceId = String(route.query.spaceId || '')
    if (
      querySpaceId &&
      spaces.value.some((item) => item.id === querySpaceId)
    ) {
      selectedSpaceId.value = querySpaceId
    } else if (!spaces.value.some((item) => item.id === selectedSpaceId.value)) {
      selectedSpaceId.value =
        spaces.value.find((item) => item.status === 'active')?.id ||
        spaces.value[0]?.id ||
        ''
    }
    await loadSpaceContext()
  } catch (cause) {
    error.value = friendlyError(cause, '预约管理加载失败。')
  } finally {
    loading.value = false
  }
}

async function loadSpaceContext() {
  if (!selectedSpaceId.value) {
    resources.value = []
    slotTypes.value = []
    bookings.value = []
    return
  }

  clearFeedback()
  try {
    const [nextResources, nextTypes] = await Promise.all([
      api.listResources(selectedSpaceId.value),
      api.listSlotTypes(selectedSpaceId.value)
    ])
    resources.value = nextResources
    slotTypes.value = nextTypes
    selectedBooking.value = null
    await loadBookings()
    router.replace({
      path: '/bookings',
      query: { spaceId: selectedSpaceId.value }
    })
  } catch (cause) {
    error.value = friendlyError(cause, '空间预约数据加载失败。')
  }
}

async function loadBookings() {
  if (!selectedSpaceId.value) return
  loading.value = true
  clearFeedback()
  try {
    const input: BookingFilters = {}
    if (filters.from) input.from = filters.from
    if (filters.to) input.to = filters.to
    if (filters.status) input.status = filters.status
    if (filters.resourceId) input.resourceId = filters.resourceId
    if (filters.participantId) input.participantId = filters.participantId
    if (filters.slotTypeId) input.slotTypeId = filters.slotTypeId
    bookings.value = await api.listBookings(selectedSpaceId.value, input)
  } catch (cause) {
    error.value = friendlyError(cause, '预约列表加载失败。')
  } finally {
    loading.value = false
  }
}

async function resetFilters() {
  filters.from = ''
  filters.to = ''
  filters.status = undefined
  filters.resourceId = ''
  filters.participantId = ''
  filters.slotTypeId = ''
  await loadBookings()
}

async function openDetail(booking: AdminBooking) {
  clearFeedback()
  try {
    selectedBooking.value = await api.getBooking(
      selectedSpaceId.value,
      booking.id
    )
  } catch (cause) {
    error.value = friendlyError(cause, '预约详情加载失败。')
  }
}

async function loadEditSlots() {
  if (!editingBooking.value || !editResourceId.value) {
    editSlots.value = []
    return
  }

  const currentDate = editingBooking.value.slot.localDate
  const today = todayDate()
  const from = currentDate < today ? currentDate : today
  const to = addDays(today, 60)

  const slots = await api.listScheduleSlots(
    selectedSpaceId.value,
    editResourceId.value,
    from,
    to
  )

  editSlots.value = slots.filter(
    (slot) =>
      slot.status === 'open' &&
      (slot.bookable || slot.id === editingBooking.value?.slotId)
  )

  if (!editSlots.value.some((slot) => slot.id === edit.slotId)) {
    edit.slotId = editSlots.value[0]?.id || ''
  }
}

async function openEdit(booking: AdminBooking) {
  clearFeedback()
  saving.value = true
  try {
    const detail = await api.getBooking(selectedSpaceId.value, booking.id)
    const member = await api.getMember(
      selectedSpaceId.value,
      detail.membershipId
    )
    editingBooking.value = detail
    editMember.value = member
    editResourceId.value = detail.resource.id
    edit.slotId = detail.slotId
    edit.participantId = detail.participantId
    await loadEditSlots()
    editOpen.value = true
  } catch (cause) {
    error.value = friendlyError(cause, '预约编辑信息加载失败。')
  } finally {
    saving.value = false
  }
}

async function changeEditResource() {
  edit.slotId = ''
  try {
    await loadEditSlots()
  } catch (cause) {
    error.value = friendlyError(cause, '目标时段加载失败。')
  }
}

async function saveEdit() {
  if (!editingBooking.value || !edit.slotId || !edit.participantId) {
    error.value = '请选择目标时段和参与人。'
    return
  }

  saving.value = true
  clearFeedback()
  try {
    const updated = await api.updateBooking(
      selectedSpaceId.value,
      editingBooking.value.id,
      {
        slotId: edit.slotId,
        participantId: edit.participantId
      }
    )
    editOpen.value = false
    selectedBooking.value = updated
    notice.value = '预约已更新。'
    await loadBookings()
  } catch (cause) {
    error.value = friendlyError(cause, '预约更新失败。')
  } finally {
    saving.value = false
  }
}

async function cancelBooking(booking: AdminBooking) {
  if (!window.confirm('取消后会释放这个预约名额。确认取消该预约吗？')) return
  saving.value = true
  clearFeedback()
  try {
    const updated = await api.cancelBooking(selectedSpaceId.value, booking.id)
    selectedBooking.value =
      selectedBooking.value?.id === booking.id ? updated : selectedBooking.value
    notice.value = '预约已取消。'
    await loadBookings()
  } catch (cause) {
    error.value = friendlyError(cause, '取消预约失败。')
  } finally {
    saving.value = false
  }
}

async function completeBooking(booking: AdminBooking) {
  if (!window.confirm('确认将该预约标记为已完成吗？')) return
  saving.value = true
  clearFeedback()
  try {
    const updated = await api.completeBooking(selectedSpaceId.value, booking.id)
    selectedBooking.value =
      selectedBooking.value?.id === booking.id ? updated : selectedBooking.value
    notice.value = '预约已标记为完成。'
    await loadBookings()
  } catch (cause) {
    error.value = friendlyError(cause, '完成预约失败。')
  } finally {
    saving.value = false
  }
}

onMounted(loadBase)
</script>

<template>
  <main class="page booking-admin-page">
    <section class="page-heading">
      <div>
        <span class="eyebrow">Bookings</span>
        <h1>预约管理</h1>
        <p>查看空间预约，按条件筛选，并处理预约调整、取消与完成。</p>
      </div>
      <label class="field space-picker">
        <span>当前空间</span>
        <select v-model="selectedSpaceId" @change="loadSpaceContext">
          <option v-for="space in spaces" :key="space.id" :value="space.id">
            {{ space.name }}{{ space.status === 'disabled' ? '（已停用）' : '' }}
          </option>
        </select>
      </label>
    </section>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="notice" class="alert alert--success">{{ notice }}</div>

    <div class="metric-row booking-metrics">
      <article class="metric-card"><span>当前结果</span><strong>{{ metrics.total }}</strong></article>
      <article class="metric-card"><span>已预约</span><strong>{{ metrics.booked }}</strong></article>
      <article class="metric-card"><span>已完成</span><strong>{{ metrics.completed }}</strong></article>
      <article class="metric-card"><span>已取消</span><strong>{{ metrics.cancelled }}</strong></article>
    </div>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2>预约列表</h2>
          <p>{{ selectedSpace?.name || '请选择空间' }} · 筛选条件直接对应 Booking API。</p>
        </div>
      </div>

      <form class="booking-filter-grid" @submit.prevent="loadBookings">
        <label class="field"><span>开始日期</span><input v-model="filters.from" type="date" /></label>
        <label class="field"><span>结束日期</span><input v-model="filters.to" type="date" /></label>
        <label class="field"><span>状态</span>
          <select v-model="filters.status">
            <option :value="undefined">全部</option>
            <option value="booked">已预约</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
        </label>
        <label class="field"><span>预约对象</span>
          <select v-model="filters.resourceId">
            <option value="">全部</option>
            <option v-for="item in resources" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label class="field"><span>时段类型</span>
          <select v-model="filters.slotTypeId">
            <option value="">全部</option>
            <option v-for="item in slotTypes" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label class="field"><span>参与人</span>
          <select v-model="filters.participantId">
            <option value="">全部</option>
            <option v-for="item in participantOptions" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <div class="booking-filter-actions">
          <button class="button button--primary" :disabled="loading">应用筛选</button>
          <button type="button" class="button button--ghost" :disabled="loading" @click="resetFilters">清空</button>
        </div>
      </form>

      <div v-if="loading" class="empty-state">正在加载预约…</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间 / 预约对象</th>
              <th>参与人</th>
              <th>类型</th>
              <th>状态</th>
              <th class="align-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="booking in bookings" :key="booking.id">
              <td>
                <strong>{{ formatDateTime(booking.slot.startAt) }}</strong>
                <div class="secondary-cell">{{ booking.resource.name }}</div>
              </td>
              <td>{{ booking.participant.name }}</td>
              <td>{{ booking.slotType.name }}</td>
              <td>
                <span class="status-pill" :class="'booking-status--' + booking.status">
                  {{ statusLabel(booking.status) }}
                </span>
              </td>
              <td class="align-right">
                <div class="actions">
                  <button class="button button--ghost" @click="openDetail(booking)">详情</button>
                  <button
                    v-if="booking.status === 'booked'"
                    class="button button--ghost"
                    @click="openEdit(booking)"
                  >修改</button>
                  <button
                    v-if="booking.status === 'booked'"
                    class="button button--ghost"
                    :disabled="saving"
                    @click="completeBooking(booking)"
                  >完成</button>
                  <button
                    v-if="booking.status === 'booked'"
                    class="button button--danger-ghost"
                    :disabled="saving"
                    @click="cancelBooking(booking)"
                  >取消</button>
                </div>
              </td>
            </tr>
            <tr v-if="bookings.length === 0">
              <td colspan="5" class="empty-cell">当前筛选条件下没有预约。</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <aside v-if="selectedBooking" class="panel booking-detail-panel">
      <div class="panel-heading">
        <div>
          <span class="eyebrow">Booking Detail</span>
          <h2>{{ selectedBooking.resource.name }}</h2>
          <p>{{ formatDateTime(selectedBooking.slot.startAt) }} · {{ selectedBooking.slotType.name }}</p>
        </div>
        <button class="icon-button" aria-label="关闭详情" @click="selectedBooking = null">×</button>
      </div>
      <div class="booking-detail-grid">
        <div><span>参与人</span><strong>{{ selectedBooking.participant.name }}</strong></div>
        <div><span>状态</span><strong>{{ statusLabel(selectedBooking.status) }}</strong></div>
        <div><span>Membership</span><strong class="mono">{{ selectedBooking.membershipId }}</strong></div>
        <div><span>Booking ID</span><strong class="mono">{{ selectedBooking.id }}</strong></div>
      </div>
    </aside>

    <div v-if="editOpen && editingBooking" class="modal-backdrop" @click.self="editOpen = false">
      <form class="modal booking-edit-modal" role="dialog" aria-modal="true" aria-label="修改预约" @submit.prevent="saveEdit">
        <div class="modal-heading">
          <div>
            <span class="eyebrow">Edit Booking</span>
            <h2>修改预约</h2>
          </div>
          <button type="button" class="icon-button" aria-label="关闭" @click="editOpen = false">×</button>
        </div>

        <div class="form-stack">
          <label class="field">
            <span>参与人</span>
            <select v-model="edit.participantId">
              <option v-for="item in activeEditParticipants" :key="item.id" :value="item.id">
                {{ item.name }} · {{ item.birthMonth }}
              </option>
            </select>
            <small>只能选择该预约原用户 Membership 下的启用参与人。</small>
          </label>

          <label class="field">
            <span>预约对象</span>
            <select v-model="editResourceId" @change="changeEditResource">
              <option
                v-for="item in resources.filter((resource) => resource.status === 'active')"
                :key="item.id"
                :value="item.id"
              >{{ item.name }}</option>
            </select>
          </label>

          <label class="field">
            <span>目标时段</span>
            <select v-model="edit.slotId">
              <option v-for="slot in editSlots" :key="slot.id" :value="slot.id">
                {{ slot.localDate }} · {{ formatDateTime(slot.startAt) }} ·
                {{ slotTypes.find((item) => item.id === slot.slotTypeId)?.name || '时段' }}
              </option>
            </select>
            <small>保存时后端会再次校验冻结、截止时间与 capacity=1 冲突。</small>
          </label>

          <div class="modal-actions">
            <button type="button" class="button button--ghost" @click="editOpen = false">取消</button>
            <button class="button button--primary" :disabled="saving || !edit.slotId || !edit.participantId">
              {{ saving ? '保存中…' : '保存预约修改' }}
            </button>
          </div>
        </div>
      </form>
    </div>
  </main>
</template>

<style scoped>
.space-picker{min-width:280px}.booking-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}
.booking-filter-grid{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:14px;padding:20px 24px;border-bottom:1px solid var(--line);background:#f8fafb}
.booking-filter-actions{display:flex;gap:8px;align-items:end}.booking-detail-panel{margin-top:20px}
.booking-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;padding:20px 24px}
.booking-detail-grid>div{display:grid;gap:5px;min-width:0}.booking-detail-grid span{font-size:12px;color:var(--muted)}
.booking-detail-grid strong{overflow-wrap:anywhere}.booking-status--booked{background:var(--accent-soft);color:var(--accent)}
.booking-status--completed{background:#eef1f2;color:#59656f}.booking-status--cancelled{background:#fff0ef;color:var(--danger)}
.booking-edit-modal{width:min(680px,100%)}@media(max-width:820px){.booking-metrics,.booking-filter-grid,.booking-detail-grid{grid-template-columns:1fr}.space-picker{min-width:0;width:100%}.booking-filter-actions{align-items:stretch}.booking-filter-actions .button{flex:1}}
</style>
