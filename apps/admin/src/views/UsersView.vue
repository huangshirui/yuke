<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getAdminApi } from '../services/adminApi'
import type {
  AdminMemberDetail,
  AdminMemberSummary,
  AdminUserSummary,
  InviteMemberSummary,
  InviteSummary,
} from '../types/admin'

const api = getAdminApi()
const route = useRoute()

const members = ref<AdminMemberSummary[]>([])
const admins = ref<AdminUserSummary[]>([])
const invites = ref<InviteSummary[]>([])
const inviteMembers = ref<InviteMemberSummary[]>([])
const selectedMember = ref<AdminMemberDetail | null>(null)
const selectedInvite = ref<InviteSummary | null>(null)

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const activeTab = ref<'members' | 'invites'>('members')
const showInviteForm = ref(false)
const memberNoteDraft = ref('')

const filters = reactive({
  invitedByAdminId: '',
  inviteCodeId: '',
})
const inviteForm = reactive({
  label: '',
  expiresAt: defaultExpiry(),
})

const spaceId = computed(() => String(route.params.spaceId || ''))
const activeInviteCount = computed(() =>
  invites.value.filter((invite) =>
    invite.status === 'active' && new Date(invite.expiresAt).getTime() > Date.now()
  ).length
)
const participantCount = computed(() =>
  members.value.reduce((total, member) => total + member.participantCount, 0)
)

function defaultExpiry() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function clearFeedback() {
  error.value = ''
  notice.value = ''
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function inviteStatus(invite: InviteSummary) {
  if (invite.status === 'revoked') return '已撤销'
  return new Date(invite.expiresAt).getTime() <= Date.now() ? '已过期' : '有效'
}

function adminLabel(adminId: string) {
  return admins.value.find((item) => item.id === adminId)?.email ?? '已移除管理员'
}

function inviteLabel(inviteId: string) {
  const invite = invites.value.find((item) => item.id === inviteId)
  return invite?.label || invite?.code || '历史邀请码'
}

async function load() {
  loading.value = true
  clearFeedback()
  selectedMember.value = null
  selectedInvite.value = null
  try {
    const [nextMembers, nextAdmins, nextInvites] = await Promise.all([
      api.listMembers(spaceId.value),
      api.listAdmins(spaceId.value),
      api.listInvites(spaceId.value),
    ])
    members.value = nextMembers
    admins.value = nextAdmins
    invites.value = nextInvites
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '用户管理加载失败。'
  } finally {
    loading.value = false
  }
}

async function applyFilters() {
  loading.value = true
  clearFeedback()
  selectedMember.value = null
  try {
    members.value = await api.listMembers(spaceId.value, {
      invitedByAdminId: filters.invitedByAdminId || undefined,
      inviteCodeId: filters.inviteCodeId || undefined,
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '用户筛选失败。'
  } finally {
    loading.value = false
  }
}

async function resetFilters() {
  filters.invitedByAdminId = ''
  filters.inviteCodeId = ''
  await applyFilters()
}

async function openMember(member: AdminMemberSummary) {
  clearFeedback()
  try {
    selectedMember.value = await api.getMember(spaceId.value, member.membershipId)
    memberNoteDraft.value = selectedMember.value.adminNote ?? ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '用户详情加载失败。'
  }
}

async function saveMemberNote() {
  if (!selectedMember.value) return
  saving.value = true
  clearFeedback()
  try {
    const value = memberNoteDraft.value.trim() || null
    await api.updateMemberAdminNote(spaceId.value, selectedMember.value.membershipId, value)
    selectedMember.value.adminNote = value
    const summary = members.value.find(
      (item) => item.membershipId === selectedMember.value?.membershipId
    )
    if (summary) summary.adminNote = value
    notice.value = '用户内部备注已保存。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '内部备注保存失败。'
  } finally {
    saving.value = false
  }
}

async function saveParticipantNote(participantId: string, value: string | null) {
  if (!selectedMember.value) return
  saving.value = true
  clearFeedback()
  try {
    const next = value?.trim() || null
    await api.updateParticipantAdminNote(spaceId.value, participantId, next)
    const participant = selectedMember.value.participants.find((item) => item.id === participantId)
    if (participant) participant.adminNote = next
    notice.value = '参与人内部备注已保存。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '参与人备注保存失败。'
  } finally {
    saving.value = false
  }
}

function startInvite() {
  activeTab.value = 'invites'
  showInviteForm.value = true
}

async function createInvite() {
  clearFeedback()
  if (!inviteForm.expiresAt) {
    error.value = '请选择有效期。'
    return
  }
  saving.value = true
  try {
    await api.createInvite(spaceId.value, {
      label: inviteForm.label.trim() || null,
      expiresAt: new Date(inviteForm.expiresAt).toISOString(),
    })
    invites.value = await api.listInvites(spaceId.value)
    inviteForm.label = ''
    inviteForm.expiresAt = defaultExpiry()
    showInviteForm.value = false
    notice.value = '邀请码已创建。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '邀请码创建失败。'
  } finally {
    saving.value = false
  }
}

async function revokeInvite(invite: InviteSummary) {
  clearFeedback()
  saving.value = true
  try {
    await api.revokeInvite(spaceId.value, invite.id)
    invites.value = await api.listInvites(spaceId.value)
    notice.value = '邀请码已撤销；已经加入的用户不受影响。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '邀请码撤销失败。'
  } finally {
    saving.value = false
  }
}

async function showInviteMembers(invite: InviteSummary) {
  clearFeedback()
  selectedInvite.value = invite
  try {
    inviteMembers.value = await api.listInviteMembers(spaceId.value, invite.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '来源用户加载失败。'
  }
}

async function copyCode(code: string) {
  clearFeedback()
  if (!navigator.clipboard) {
    error.value = '当前浏览器不支持自动复制，请手动复制邀请码。'
    return
  }
  await navigator.clipboard.writeText(code)
  notice.value = '邀请码已复制。'
}

watch(spaceId, load)
onMounted(load)
</script>

<template>
  <main class="page users-page">
    <section class="page-heading">
      <div>
        <h1>用户管理</h1>
        <p>统一管理用户、参与人以及邀请入口，并保留每个用户的加入来源。</p>
      </div>
      <button class="button button--primary" @click="startInvite">+ 邀请用户</button>
    </section>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="notice" class="alert alert--success">{{ notice }}</div>

    <section class="overview-metrics users-metrics">
      <article class="overview-metric"><span>用户</span><strong>{{ members.length }}</strong><small>当前筛选结果</small></article>
      <article class="overview-metric"><span>参与人</span><strong>{{ participantCount }}</strong><small>当前筛选结果</small></article>
      <article class="overview-metric"><span>有效邀请码</span><strong>{{ activeInviteCount }}</strong><small>可继续加入</small></article>
    </section>

    <nav class="section-tabs" aria-label="用户管理子导航">
      <button :class="{ active: activeTab === 'members' }" @click="activeTab = 'members'">用户与参与人</button>
      <button :class="{ active: activeTab === 'invites' }" @click="activeTab = 'invites'">邀请用户</button>
    </nav>

    <section v-if="activeTab === 'members'" class="panel">
      <div class="filter-bar">
        <label class="field">
          <span>来源管理员</span>
          <select v-model="filters.invitedByAdminId">
            <option value="">全部管理员</option>
            <option v-for="admin in admins" :key="admin.id" :value="admin.id">{{ admin.email }}</option>
          </select>
        </label>
        <label class="field">
          <span>来源邀请码</span>
          <select v-model="filters.inviteCodeId">
            <option value="">全部邀请码</option>
            <option v-for="invite in invites" :key="invite.id" :value="invite.id">{{ invite.label || invite.code }}</option>
          </select>
        </label>
        <div class="filter-actions">
          <button class="button button--primary" :disabled="loading" @click="applyFilters">筛选</button>
          <button class="button button--ghost" :disabled="loading" @click="resetFilters">清除</button>
        </div>
      </div>

      <div v-if="loading" class="empty-state">正在加载用户…</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr><th>用户</th><th>参与人</th><th>邀请来源</th><th>加入时间</th><th class="align-right">操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="member in members" :key="member.membershipId">
              <td><strong>{{ member.nickname || '未命名用户' }}</strong></td>
              <td>{{ member.participantCount }} 个</td>
              <td>
                <div>{{ adminLabel(member.invitedByAdminId) }}</div>
                <small class="muted">{{ inviteLabel(member.inviteCodeId) }}</small>
              </td>
              <td>{{ formatDate(member.joinedAt) }}</td>
              <td class="align-right"><button class="button button--ghost" @click="openMember(member)">查看详情</button></td>
            </tr>
            <tr v-if="members.length === 0"><td colspan="5" class="empty-cell">当前条件下没有用户。</td></tr>
          </tbody>
        </table>
      </div>

      <aside v-if="selectedMember" class="source-panel member-detail-panel">
        <div class="source-panel__heading">
          <div>
            <span class="eyebrow">Member Detail</span>
            <h3>{{ selectedMember.nickname || '未命名用户' }}</h3>
            <p class="muted">{{ selectedMember.participantCount }} 个参与人 · {{ selectedMember.bookingCount }} 条预约记录</p>
          </div>
          <button class="icon-button" aria-label="关闭用户详情" @click="selectedMember = null">×</button>
        </div>

        <div class="detail-meta">
          <div><span>来源管理员</span><strong>{{ adminLabel(selectedMember.invitedByAdminId) }}</strong></div>
          <div><span>来源邀请码</span><strong>{{ inviteLabel(selectedMember.inviteCodeId) }}</strong></div>
          <div><span>加入时间</span><strong>{{ formatDate(selectedMember.joinedAt) }}</strong></div>
        </div>

        <div class="note-editor">
          <label class="field">
            <span>用户内部备注</span>
            <textarea v-model="memberNoteDraft" rows="3" placeholder="仅管理端可见"></textarea>
          </label>
          <button class="button button--primary" :disabled="saving" @click="saveMemberNote">保存用户备注</button>
        </div>

        <div class="participant-list">
          <article v-for="participant in selectedMember.participants" :key="participant.id" class="participant-card">
            <div class="participant-card__heading">
              <div>
                <strong>{{ participant.name }}</strong>
                <small>{{ participant.birthMonth }}</small>
              </div>
              <span class="status-pill" :class="participant.status === 'active' ? 'status-pill--active' : 'status-pill--disabled'">
                {{ participant.status === 'active' ? '启用' : '已停用' }}
              </span>
            </div>
            <div class="participant-notes">
              <div><span>用户备注</span><p>{{ participant.userNote || '无' }}</p></div>
              <label class="field">
                <span>管理员内部备注</span>
                <textarea v-model="participant.adminNote" rows="2" placeholder="仅管理端可见"></textarea>
                <button class="button button--ghost" :disabled="saving" @click="saveParticipantNote(participant.id, participant.adminNote)">保存参与人备注</button>
              </label>
            </div>
          </article>
        </div>
      </aside>
    </section>

    <section v-else class="panel">
      <div class="panel-heading">
        <div>
          <h2>邀请用户</h2>
          <p>邀请码只限制有效期、不限制使用人数。用户加入后会保留来源管理员与邀请码。</p>
        </div>
        <button class="button button--primary" @click="showInviteForm = !showInviteForm">{{ showInviteForm ? '收起' : '+ 新建邀请码' }}</button>
      </div>

      <form v-if="showInviteForm" class="invite-form" @submit.prevent="createInvite">
        <label class="field">
          <span>用途标记（可选）</span>
          <input v-model="inviteForm.label" placeholder="例如：秋季活动" />
        </label>
        <label class="field">
          <span>有效期至</span>
          <input v-model="inviteForm.expiresAt" type="datetime-local" />
        </label>
        <button class="button button--primary" :disabled="saving">{{ saving ? '创建中…' : '生成邀请码' }}</button>
      </form>

      <div class="table-wrap">
        <table>
          <thead><tr><th>标记 / 邀请码</th><th>有效期</th><th>状态</th><th>已加入</th><th class="align-right">操作</th></tr></thead>
          <tbody>
            <tr v-for="invite in invites" :key="invite.id">
              <td>
                <strong>{{ invite.label || '未命名邀请码' }}</strong>
                <div class="code-line"><code>{{ invite.code }}</code><button class="link-button" @click="copyCode(invite.code)">复制</button></div>
              </td>
              <td>{{ formatDate(invite.expiresAt) }}</td>
              <td><span class="status-pill" :class="inviteStatus(invite) === '有效' ? 'status-pill--active' : 'status-pill--disabled'">{{ inviteStatus(invite) }}</span></td>
              <td><button class="link-button" @click="showInviteMembers(invite)">{{ invite.memberCount }} 人 · 查看来源</button></td>
              <td class="align-right">
                <button v-if="invite.status === 'active'" class="button button--danger-ghost" :disabled="saving" @click="revokeInvite(invite)">撤销</button>
                <span v-else class="muted">已撤销</span>
              </td>
            </tr>
            <tr v-if="invites.length === 0"><td colspan="5" class="empty-cell">还没有邀请码。点击右上角创建第一个邀请入口。</td></tr>
          </tbody>
        </table>
      </div>

      <aside v-if="selectedInvite" class="source-panel">
        <div class="source-panel__heading">
          <div><span class="eyebrow">Invite Source</span><h3>{{ selectedInvite.label || selectedInvite.code }} 的来源用户</h3></div>
          <button class="icon-button" aria-label="关闭来源用户" @click="selectedInvite = null">×</button>
        </div>
        <div v-if="inviteMembers.length === 0" class="empty-state">还没有用户通过这个邀请码加入。</div>
        <div v-else class="member-list">
          <article v-for="member in inviteMembers" :key="member.membershipId" class="member-card">
            <div><strong>{{ member.nickname || '未命名用户' }}</strong><small>{{ member.participantCount }} 个参与人 · {{ formatDate(member.joinedAt) }} 加入</small></div>
          </article>
        </div>
      </aside>
    </section>
  </main>
</template>
