<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAdminApi } from '../services/adminApi'
import type {
  AdminMemberSummary,
  AdminUserSummary,
  InviteMemberSummary,
  InviteSummary,
} from '../types/admin'

const api = getAdminApi()
const route = useRoute()
const router = useRouter()

const members = ref<AdminMemberSummary[]>([])
const admins = ref<AdminUserSummary[]>([])
const invites = ref<InviteSummary[]>([])
const inviteMembers = ref<InviteMemberSummary[]>([])
const selectedInvite = ref<InviteSummary | null>(null)

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const activeTab = ref<'members' | 'invites'>('members')
const inviteModalOpen = ref(false)

const filters = reactive({
  invitedByAdminId: '',
  inviteCodeId: '',
})
const inviteForm = reactive({
  label: '',
  expiresAt: defaultExpiry(),
})

const spaceId = computed(() => String(route.params.spaceId || ''))

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

function openMember(member: AdminMemberSummary) {
  router.push(
    '/spaces/' + encodeURIComponent(spaceId.value) +
    '/users/' + encodeURIComponent(member.membershipId)
  )
}

function startInvite() {
  clearFeedback()
  inviteForm.label = ''
  inviteForm.expiresAt = defaultExpiry()
  inviteModalOpen.value = true
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
    inviteModalOpen.value = false
    activeTab.value = 'invites'
    notice.value = '邀请码已创建，可在邀请记录中复制。'
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
    <section class="page-heading page-heading--compact">
      <div>
        <h1>用户管理</h1>
        <p>查看用户与参与人、追踪邀请来源，并管理邀请入口。</p>
      </div>
      <button class="button button--primary" @click="startInvite">+ 邀请用户</button>
    </section>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="notice" class="alert alert--success">{{ notice }}</div>

    <nav class="section-tabs compact-tabs" aria-label="用户管理子导航">
      <button :class="{ active: activeTab === 'members' }" @click="activeTab = 'members'">用户</button>
      <button :class="{ active: activeTab === 'invites' }" @click="activeTab = 'invites'">邀请记录</button>
    </nav>

    <section v-if="activeTab === 'members'" class="panel">
      <div class="filter-bar compact-filter-bar">
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
            <tr><th>用户</th><th>参与人</th><th>邀请来源</th><th>加入时间</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="member in members"
              :key="member.membershipId"
              class="clickable-row"
              tabindex="0"
              @click="openMember(member)"
              @keydown.enter.prevent="openMember(member)"
            >
              <td><strong>{{ member.nickname || '未命名用户' }}</strong></td>
              <td>{{ member.participantCount }} 个</td>
              <td>
                <div>{{ adminLabel(member.invitedByAdminId) }}</div>
                <small class="muted">{{ inviteLabel(member.inviteCodeId) }}</small>
              </td>
              <td>{{ formatDate(member.joinedAt) }}</td>
            </tr>
            <tr v-if="members.length === 0"><td colspan="4" class="empty-cell">当前条件下没有用户。</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-else class="panel">
      <div class="compact-panel-heading">
        <div>
          <h2>邀请记录</h2>
          <p>邀请码只限制有效期、不限制使用人数；加入后会保留来源。</p>
        </div>
      </div>
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
            <tr v-if="invites.length === 0"><td colspan="5" class="empty-cell">还没有邀请码。点击右上角“邀请用户”创建第一个邀请入口。</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="inviteModalOpen" class="modal-backdrop" @click.self="inviteModalOpen = false">
      <form class="modal invite-modal" role="dialog" aria-modal="true" aria-label="邀请用户" @submit.prevent="createInvite">
        <div class="modal-heading">
          <div><h2>邀请用户</h2><p>创建一个有有效期、可多人使用的邀请入口。</p></div>
          <button type="button" class="icon-button" aria-label="关闭邀请用户" @click="inviteModalOpen = false">×</button>
        </div>
        <div class="form-stack">
          <label class="field">
            <span>用途标记（可选）</span>
            <input v-model="inviteForm.label" placeholder="例如：秋季活动" />
          </label>
          <label class="field">
            <span>有效期至</span>
            <input v-model="inviteForm.expiresAt" type="datetime-local" />
            <small>有效期内可多人使用；用户加入后会记录来源管理员与邀请码。</small>
          </label>
          <div class="modal-actions">
            <button type="button" class="button button--ghost" @click="inviteModalOpen = false">取消</button>
            <button class="button button--primary" :disabled="saving">{{ saving ? '创建中…' : '创建邀请码' }}</button>
          </div>
        </div>
      </form>
    </div>

    <div v-if="selectedInvite" class="modal-backdrop" @click.self="selectedInvite = null">
      <section class="modal invite-source-modal" role="dialog" aria-modal="true" aria-label="邀请来源用户">
        <div class="modal-heading">
          <div>
            <h2>{{ selectedInvite.label || selectedInvite.code }}</h2>
            <p>通过这个邀请码加入的用户</p>
          </div>
          <button class="icon-button" aria-label="关闭来源用户" @click="selectedInvite = null">×</button>
        </div>
        <div v-if="inviteMembers.length === 0" class="empty-state">还没有用户通过这个邀请码加入。</div>
        <div v-else class="member-list modal-member-list">
          <button
            v-for="member in inviteMembers"
            :key="member.membershipId"
            class="member-card clickable-member-card"
            @click="openMember(member)"
          >
            <div>
              <strong>{{ member.nickname || '未命名用户' }}</strong>
              <small>{{ member.participantCount }} 个参与人 · {{ formatDate(member.joinedAt) }} 加入</small>
            </div>
            <span class="row-chevron">›</span>
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.compact-filter-bar{padding: var(--space-12) var(--space-14);gap: var(--space-10)}.compact-panel-heading{min-height:50px;padding: var(--space-8) var(--space-16);border-bottom:var(--border-width) solid var(--color-border);display:flex;align-items:center;justify-content:space-between}.compact-panel-heading h2{margin: 0;font-size:var(--font-size-15)}.compact-panel-heading p{margin: var(--space-3) 0 0;color:var(--color-text-secondary);font-size:var(--font-size-12)}.invite-modal{width:min(520px,100%)}.invite-source-modal{width:min(620px,100%)}.modal-member-list{padding: var(--space-6)}.clickable-member-card{width:100%;border:0;background:var(--color-white);color:var(--color-text-primary);display:flex;align-items:center;justify-content:space-between;text-align:left;border-radius:var(--radius-8)}.clickable-member-card:hover{background:var(--color-hover-subtle)}.compact-tabs{margin-bottom: var(--space-10)}
</style>
