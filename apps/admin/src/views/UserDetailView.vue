<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAdminApi } from '../services/adminApi'
import type {
  AdminBooking,
  AdminMemberDetail,
  AdminSpace,
  AdminUserSummary,
  InviteSummary,
} from '../types/admin'

const api = getAdminApi()
const route = useRoute()
const router = useRouter()

const member = ref<AdminMemberDetail | null>(null)
const space = ref<AdminSpace | null>(null)
const admins = ref<AdminUserSummary[]>([])
const invites = ref<InviteSummary[]>([])
const bookings = ref<AdminBooking[]>([])
const memberNote = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')

const spaceId = computed(() => String(route.params.spaceId || ''))
const membershipId = computed(() => String(route.params.membershipId || ''))

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: space.value?.timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatBookingTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: space.value?.timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function statusLabel(status: AdminBooking['status']) {
  if (status === 'completed') return '已完成'
  if (status === 'cancelled') return '已取消'
  return '已预约'
}

const sourceAdmin = computed(() =>
  admins.value.find((item) => item.id === member.value?.invitedByAdminId)?.email ?? '已移除管理员'
)
const sourceInvite = computed(() => {
  const invite = invites.value.find((item) => item.id === member.value?.inviteCodeId)
  return invite?.label || invite?.code || '历史邀请码'
})

async function load() {
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    const [spaces, nextMember, nextAdmins, nextInvites, nextBookings] = await Promise.all([
      api.listSpaces(),
      api.getMember(spaceId.value, membershipId.value),
      api.listAdmins(spaceId.value),
      api.listInvites(spaceId.value),
      api.listBookings(spaceId.value, { membershipId: membershipId.value }),
    ])
    space.value = spaces.find((item) => item.id === spaceId.value) ?? null
    member.value = nextMember
    admins.value = nextAdmins
    invites.value = nextInvites
    bookings.value = nextBookings
    memberNote.value = nextMember.adminNote ?? ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '用户详情加载失败。'
  } finally {
    loading.value = false
  }
}

async function saveMemberNote() {
  if (!member.value) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const value = memberNote.value.trim() || null
    await api.updateMemberAdminNote(spaceId.value, member.value.membershipId, value)
    member.value.adminNote = value
    notice.value = '用户内部备注已保存。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '内部备注保存失败。'
  } finally {
    saving.value = false
  }
}

async function saveParticipantNote(participantId: string, value: string | null) {
  if (!member.value) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const next = value?.trim() || null
    await api.updateParticipantAdminNote(spaceId.value, participantId, next)
    const participant = member.value.participants.find((item) => item.id === participantId)
    if (participant) participant.adminNote = next
    notice.value = '参与人内部备注已保存。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '参与人备注保存失败。'
  } finally {
    saving.value = false
  }
}

function openBooking(bookingId: string) {
  router.push({
    path: '/spaces/' + encodeURIComponent(spaceId.value) + '/reservations',
    query: { view: 'list', bookingId },
  })
}

watch([spaceId, membershipId], load)
onMounted(load)
</script>

<template>
  <main class="page user-detail-page">
    <section class="page-heading page-heading--compact">
      <div>
        <button class="back-link" @click="router.push('/spaces/' + encodeURIComponent(spaceId) + '/users')">← 返回用户管理</button>
        <h1>{{ member?.nickname || '用户详情' }}</h1>
        <p v-if="member">{{ member.participantCount }} 个参与人 · {{ member.bookingCount }} 条预约记录</p>
      </div>
    </section>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="notice" class="alert alert--success">{{ notice }}</div>
    <div v-if="loading" class="empty-state">正在加载用户详情…</div>

    <template v-else-if="member">
      <section class="detail-section-grid">
        <article class="panel detail-section">
          <div class="compact-panel-heading"><h2>加入信息</h2></div>
          <dl class="detail-list">
            <div><dt>来源管理员</dt><dd>{{ sourceAdmin }}</dd></div>
            <div><dt>来源邀请码</dt><dd>{{ sourceInvite }}</dd></div>
            <div><dt>加入时间</dt><dd>{{ formatDate(member.joinedAt) }}</dd></div>
            <div><dt>状态</dt><dd>{{ member.status === 'active' ? '启用' : '已停用' }}</dd></div>
          </dl>
        </article>

        <article class="panel detail-section">
          <div class="compact-panel-heading"><h2>内部备注</h2><small>仅管理端可见</small></div>
          <div class="compact-editor">
            <textarea v-model="memberNote" rows="4" placeholder="记录运营侧需要长期保留的信息"></textarea>
            <button class="button button--primary" :disabled="saving" @click="saveMemberNote">保存备注</button>
          </div>
        </article>
      </section>

      <section class="panel detail-section">
        <div class="compact-panel-heading">
          <h2>参与人</h2>
          <span class="muted">{{ member.participants.length }} 人</span>
        </div>
        <div class="participant-detail-list">
          <article v-for="participant in member.participants" :key="participant.id" class="participant-detail-row">
            <div class="participant-identity">
              <strong>{{ participant.name }}</strong>
              <span>{{ participant.birthMonth }}</span>
              <span class="status-pill" :class="participant.status === 'active' ? 'status-pill--active' : 'status-pill--disabled'">
                {{ participant.status === 'active' ? '启用' : '已停用' }}
              </span>
            </div>
            <div class="participant-user-note">
              <span>用户备注</span>
              <p>{{ participant.userNote || '无' }}</p>
            </div>
            <label class="field participant-admin-note">
              <span>管理员内部备注</span>
              <textarea v-model="participant.adminNote" rows="2" placeholder="仅管理端可见"></textarea>
              <button class="button button--ghost" :disabled="saving" @click="saveParticipantNote(participant.id, participant.adminNote)">保存</button>
            </label>
          </article>
        </div>
      </section>

      <section class="panel detail-section">
        <div class="compact-panel-heading">
          <h2>预约记录</h2>
          <span class="muted">{{ bookings.length }} 条</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>时间</th><th>参与人</th><th>预约对象</th><th>状态</th></tr></thead>
            <tbody>
              <tr
                v-for="booking in bookings"
                :key="booking.id"
                class="clickable-row"
                tabindex="0"
                @click="openBooking(booking.id)"
                @keydown.enter.prevent="openBooking(booking.id)"
              >
                <td><strong>{{ formatBookingTime(booking.slot.startAt) }}</strong></td>
                <td>{{ booking.participant.name }}</td>
                <td>{{ booking.resource.name }}</td>
                <td><span class="status-pill" :class="'booking-status--' + booking.status">{{ statusLabel(booking.status) }}</span></td>
              </tr>
              <tr v-if="bookings.length === 0"><td colspan="4" class="empty-cell">这个用户还没有预约记录。</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.detail-section-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap: var(--space-12);margin-bottom: var(--space-12)}.detail-section{padding: 0;margin-bottom: var(--space-12)}.compact-panel-heading{min-height:46px;padding: 0 var(--space-16);border-bottom:var(--border-width) solid var(--color-border);display:flex;align-items:center;justify-content:space-between;gap: var(--space-12)}.compact-panel-heading h2{margin: 0;font-size:var(--font-size-15)}.compact-panel-heading small{color:var(--color-text-secondary);font-size:var(--font-size-11)}.detail-list{margin: 0;padding: var(--space-8) var(--space-16)}.detail-list>div{min-height:38px;display:grid;grid-template-columns:96px minmax(0,1fr);align-items:center;border-bottom:var(--border-width) solid var(--color-border-subtle)}.detail-list>div:last-child{border-bottom:0}.detail-list dt{font-size:var(--font-size-12);color:var(--color-text-secondary)}.detail-list dd{margin: 0;font-size:var(--font-size-13);font-weight:650;overflow-wrap:anywhere}.compact-editor{padding: var(--space-14) var(--space-16);display:grid;gap: var(--space-10)}.compact-editor textarea{width:100%;resize:vertical}.compact-editor .button{justify-self:end}.participant-detail-list{display:grid}.participant-detail-row{display:grid;grid-template-columns:minmax(150px,.7fr) minmax(180px,.8fr) minmax(260px,1.4fr);gap: var(--space-14);padding: var(--space-14) var(--space-16);border-bottom:var(--border-width) solid var(--color-border)}.participant-detail-row:last-child{border-bottom:0}.participant-identity{display:flex;align-items:center;gap: var(--space-8);flex-wrap:wrap}.participant-identity>span:not(.status-pill){font-size:var(--font-size-12);color:var(--color-text-secondary)}.participant-user-note>span{font-size:var(--font-size-11);color:var(--color-text-secondary)}.participant-user-note p{margin: var(--space-5) 0 0;font-size:var(--font-size-13);line-height:1.45}.participant-admin-note .button{justify-self:start;margin-top: var(--space-4)}@media(max-width:820px){.detail-section-grid{grid-template-columns:1fr}.participant-detail-row{grid-template-columns:1fr}.compact-editor .button{width:100%}}
</style>
