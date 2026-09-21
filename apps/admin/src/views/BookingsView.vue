<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
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

const props = withDefaults(defineProps<{ embedded?: boolean }>(), {
  embedded: false
})

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
  slotTypeId: '',
  reconciliationStatus: undefined
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

function reconciliationLabel(booking: AdminBooking) {
  if (booking.status !== 'completed') return ''
  if (booking.reconciliation === undefined) return '对账状态同步中'
  return booking.reconciliation?.status === 'settled' ? '已对账' : '待对账'
}

function completionSourceLabel(source: NonNullable<AdminBooking['completion']>['source'] | undefined | null) {
  if (source === 'classin_import') return 'ClassIn 导入'
  if (source === 'external_import') return '外部文件导入'
  if (source === 'external_api') return '外部系统'
  if (source === 'manual') return '运营手动'
  return '历史数据'
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

function currentDateInSpace() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: selectedSpace.value?.timezone || 'UTC',
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

async function loadBase() {
  loading.value = true
  clearFeedback()
  try {
    spaces.value = await api.listSpaces()
    const routeSpaceId = String(route.params.spaceId || '')
    if (!spaces.value.some((item) => item.id === routeSpaceId)) {
      throw new Error('找不到这个空间。')
    }
    selectedSpaceId.value = routeSpaceId
    if (!filters.from && !filters.to) {
      const today = currentDateInSpace()
      filters.from = today
      filters.to = today
    }
    await loadSpaceContext()
    await openRequestedBooking()
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
    if (filters.reconciliationStatus) input.reconciliationStatus = filters.reconciliationStatus
    bookings.value = await api.listBookings(selectedSpaceId.value, input)
  } catch (cause) {
    error.value = friendlyError(cause, '预约列表加载失败。')
  } finally {
    loading.value = false
  }
}

async function resetFilters() {
  const today = currentDateInSpace()
  filters.from = today
  filters.to = today
  filters.status = undefined
  filters.resourceId = ''
  filters.participantId = ''
  filters.slotTypeId = ''
  filters.reconciliationStatus = undefined
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

async function openRequestedBooking() {
  const bookingId = String(route.query.bookingId || '')
  if (!bookingId || !selectedSpaceId.value) return
  clearFeedback()
  try {
    selectedBooking.value = await api.getBooking(selectedSpaceId.value, bookingId)
  } catch (cause) {
    error.value = friendlyError(cause, '预约详情加载失败。')
  }
}

function closeBookingDetail() {
  selectedBooking.value = null
  if (!route.query.bookingId) return
  const query = { ...route.query }
  delete query.bookingId
  router.replace({ path: route.path, query })
}

async function loadEditSlots() {
  if (!editingBooking.value || !editResourceId.value) {
    editSlots.value = []
    return
  }

  const currentDate = editingBooking.value.slot.localDate
  const today = currentDateInSpace()
  const from = currentDate < today ? currentDate : today
  const horizon = addDays(today, 60)
  const to = currentDate > horizon ? currentDate : horizon

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
  if (!window.confirm('确认将该预约标记为已完成吗？完成后会进入“待对账”状态。')) return
  saving.value = true
  clearFeedback()
  try {
    const updated = await api.completeBooking(selectedSpaceId.value, booking.id)
    selectedBooking.value =
      selectedBooking.value?.id === booking.id ? updated : selectedBooking.value
    notice.value = '预约已完成，已进入待对账。'
    await loadBookings()
  } catch (cause) {
    error.value = friendlyError(cause, '完成预约失败。')
  } finally {
    saving.value = false
  }
}

async function reconcileBooking(booking: AdminBooking) {
  if (!window.confirm('确认这条已完成预约已经完成对账吗？')) return
  saving.value = true
  clearFeedback()
  try {
    const updated = await api.reconcileBooking(selectedSpaceId.value, booking.id)
    selectedBooking.value =
      selectedBooking.value?.id === booking.id ? updated : selectedBooking.value
    notice.value = '预约已标记为已对账。'
    await loadBookings()
  } catch (cause) {
    error.value = friendlyError(cause, '标记对账失败。')
  } finally {
    saving.value = false
  }
}

watch(() => route.params.spaceId, loadBase)
watch(() => route.query.bookingId, openRequestedBooking)
onMounted(loadBase)
</script>

<template>
  <section class="booking-admin-page" :class="{ page: !props.embedded }">
    <section v-if="!props.embedded" class="page-heading">
      <div>
        <span class="eyebrow">Bookings</span>
        <h1>预约管理</h1>
        <p>查看空间预约，按条件筛选，并处理预约调整、取消与完成。</p>
      </div>
      <span v-if="selectedSpace" class="page-context">{{ selectedSpace.name }}</span>
    </section>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="notice" class="alert alert--success">{{ notice }}</div>

    <section class="panel">
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
        <label class="field"><span>对账状态</span>
          <select v-model="filters.reconciliationStatus">
            <option :value="undefined">全部</option>
            <option value="pending">待对账</option>
            <option value="settled">已对账</option>
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
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="booking in bookings"
              :key="booking.id"
              class="clickable-row"
              tabindex="0"
              @click="openDetail(booking)"
              @keydown.enter.prevent="openDetail(booking)"
            >
              <td>
                <strong>{{ formatDateTime(booking.slot.startAt) }}</strong>
                <div class="secondary-cell">{{ booking.resource.name }}</div>
              </td>
              <td>{{ booking.participant.name }}</td>
              <td>{{ booking.slotType.name }}</td>
              <td>
                <div class="booking-state-stack">
                  <span class="status-pill" :class="'booking-status--' + booking.status">
                    {{ statusLabel(booking.status) }}
                  </span>
                  <span
                    v-if="booking.status === 'completed'"
                    class="status-pill"
                    :class="booking.reconciliation?.status === 'settled' ? 'reconciliation--settled' : 'reconciliation--pending'"
                  >{{ reconciliationLabel(booking) }}</span>
                </div>
              </td>
            </tr>
            <tr v-if="bookings.length === 0">
              <td colspan="4" class="empty-cell">当前筛选条件下没有预约。</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="selectedBooking" class="modal-backdrop" @click.self="closeBookingDetail">
      <section class="modal booking-detail-modal" role="dialog" aria-modal="true" aria-label="预约详情">
        <div class="modal-heading">
          <div>
            <span class="eyebrow">Booking Detail</span>
            <h2>预约详情</h2>
            <p>{{ formatDateTime(selectedBooking.slot.startAt) }} · {{ selectedBooking.resource.name }}</p>
          </div>
          <button class="icon-button" aria-label="关闭预约详情" @click="closeBookingDetail">×</button>
        </div>
        <div class="booking-detail-grid">
          <div><span>参与人</span><strong>{{ selectedBooking.participant.name }}</strong></div>
          <div><span>时段类型</span><strong>{{ selectedBooking.slotType.name }}</strong></div>
          <div><span>服务状态</span><strong>{{ statusLabel(selectedBooking.status) }}</strong></div>
          <div><span>日期</span><strong>{{ selectedBooking.slot.localDate }}</strong></div>
          <div v-if="selectedBooking.completion">
            <span>完成时间</span>
            <strong>{{ formatDateTime(selectedBooking.completion.completedAt) }}</strong>
          </div>
          <div v-if="selectedBooking.completion">
            <span>完成来源</span>
            <strong>{{ completionSourceLabel(selectedBooking.completion.source) }}</strong>
          </div>
          <div v-if="selectedBooking.status === 'completed'">
            <span>对账状态</span>
            <strong>{{ reconciliationLabel(selectedBooking) }}</strong>
          </div>
          <div v-if="selectedBooking.reconciliation?.settledAt">
            <span>对账时间</span>
            <strong>{{ formatDateTime(selectedBooking.reconciliation.settledAt) }}</strong>
          </div>
        </div>
        <div class="modal-actions booking-detail-actions">
          <button
            v-if="selectedBooking.status === 'booked'"
            class="button button--ghost"
            @click="openEdit(selectedBooking)"
          >修改预约</button>
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
      </section>
    </div>

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
  </section>
</template>

<style scoped>
.booking-filter-grid{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:10px;padding:14px 16px;border-bottom:var(--border-width) solid var(--color-border);background:var(--color-surface-muted)}
.booking-filter-actions{display:flex;gap:8px;align-items:end}
.booking-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:16px 0}
.booking-detail-grid>div{display:grid;gap:5px;min-width:0}.booking-detail-grid span{font-size:var(--font-size-12);color:var(--color-text-secondary)}
.booking-detail-grid strong{overflow-wrap:anywhere}.booking-status--booked{background:var(--color-primary-soft);color:var(--color-primary)}
.booking-status--completed{background:var(--color-status-completed-bg);color:var(--color-status-completed-text)}.booking-status--cancelled{background:var(--color-status-cancelled-bg);color:var(--color-danger)}.booking-state-stack{display:flex;gap:5px;flex-wrap:wrap}.reconciliation--pending{background:var(--color-status-pending-bg);color:var(--color-status-pending-text)}.reconciliation--settled{background:var(--color-status-settled-bg);color:var(--color-status-settled-text)}
.booking-edit-modal,.booking-detail-modal{width:min(680px,100%)}.booking-detail-actions{padding-top:14px;border-top:var(--border-width) solid var(--color-border)}@media(max-width:820px){.booking-filter-grid,.booking-detail-grid{grid-template-columns:1fr}.booking-filter-actions{align-items:stretch}.booking-filter-actions .button{flex:1}}
</style>
