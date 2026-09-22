<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { CUTOFF_MINUTES, type CutoffMinutes, type SpaceSettings } from '@yuke/shared'
import LoadingOverlay from '../components/LoadingOverlay.vue'
import { getAdminApi } from '../services/adminApi'
import type { AdminSpace, AdminUserSummary, InviteMemberSummary, InviteSummary } from '../types/admin'

const api = getAdminApi()
const route = useRoute()

const space = ref<AdminSpace | null>(null)
const settings = reactive<SpaceSettings>({
  bookingCutoffMinutes: null,
  cancellationCutoffMinutes: null,
})
const admins = ref<AdminUserSummary[]>([])
const invites = ref<InviteSummary[]>([])
const inviteMembers = ref<InviteMemberSummary[]>([])
const selectedInvite = ref<InviteSummary | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const adminEmail = ref('')
const showInviteForm = ref(false)
const inviteForm = reactive({ label: '', expiresAt: defaultExpiry() })

const sections = ['settings', 'admins', 'invites'] as const
const section = computed(() => {
  const value = String(route.params.section ?? 'settings')
  return sections.includes(value as (typeof sections)[number]) ? value : 'settings'
})
const spaceId = computed(() => String(route.params.spaceId))
const cutoffOptions = [
  ...CUTOFF_MINUTES.map((value) => ({ value, label: cutoffLabel(value) })),
  { value: null, label: '不限' },
]

function cutoffLabel(value: number) {
  if (value < 60) return value + ' 分钟'
  if (value === 60) return '1 小时'
  if (value === 240) return '4 小时'
  if (value === 1440) return '24 小时'
  return value + ' 分钟'
}

function defaultExpiry() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function inviteStatus(invite: InviteSummary) {
  if (invite.status === 'revoked') return '已撤销'
  return new Date(invite.expiresAt).getTime() <= Date.now() ? '已过期' : '有效'
}

function clearMessages() {
  error.value = ''
  notice.value = ''
}

async function load() {
  loading.value = true
  clearMessages()
  selectedInvite.value = null
  inviteMembers.value = []
  try {
    const [spaces, nextSettings, nextAdmins, nextInvites] = await Promise.all([
      api.listSpaces(),
      api.getSettings(spaceId.value),
      api.listAdmins(spaceId.value),
      api.listInvites(spaceId.value),
    ])
    space.value = spaces.find((item) => item.id === spaceId.value) ?? null
    if (!space.value) throw new Error('找不到这个空间。')
    settings.bookingCutoffMinutes = nextSettings.bookingCutoffMinutes
    settings.cancellationCutoffMinutes = nextSettings.cancellationCutoffMinutes
    admins.value = nextAdmins
    invites.value = nextInvites
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '空间加载失败。'
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  clearMessages()
  try {
    await api.updateSettings(spaceId.value, {
      bookingCutoffMinutes: settings.bookingCutoffMinutes as CutoffMinutes,
      cancellationCutoffMinutes: settings.cancellationCutoffMinutes as CutoffMinutes,
    })
    notice.value = '预约规则已保存。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败。'
  } finally {
    saving.value = false
  }
}

async function toggleSpaceStatus() {
  if (!space.value) return
  saving.value = true
  clearMessages()
  try {
    space.value = await api.setSpaceStatus(
      space.value.id,
      space.value.status === 'active' ? 'disabled' : 'active',
    )
    notice.value = space.value.status === 'active' ? '空间已启用。' : '空间已停用。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '状态更新失败。'
  } finally {
    saving.value = false
  }
}

async function addAdmin() {
  clearMessages()
  const email = adminEmail.value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    error.value = '请输入有效的用户邮箱。'
    return
  }
  saving.value = true
  try {
    await api.assignAdminByEmail(spaceId.value, email)
    admins.value = await api.listAdmins(spaceId.value)
    adminEmail.value = ''
    notice.value = '用户已添加，可访问当前空间。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '用户添加失败。'
  } finally {
    saving.value = false
  }
}

async function removeAdmin(admin: AdminUserSummary) {
  clearMessages()
  saving.value = true
  try {
    await api.removeAdmin(spaceId.value, admin.id)
    admins.value = await api.listAdmins(spaceId.value)
    notice.value = '用户权限已移除。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '移除失败。'
  } finally {
    saving.value = false
  }
}

async function createInvite() {
  clearMessages()
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
  clearMessages()
  saving.value = true
  try {
    await api.revokeInvite(spaceId.value, invite.id)
    invites.value = await api.listInvites(spaceId.value)
    if (selectedInvite.value?.id === invite.id) {
      selectedInvite.value = invites.value.find((item) => item.id === invite.id) ?? null
    }
    notice.value = '邀请码已撤销；已加入的客户不受影响。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '撤销失败。'
  } finally {
    saving.value = false
  }
}

async function showMembers(invite: InviteSummary) {
  clearMessages()
  selectedInvite.value = invite
  try {
    inviteMembers.value = await api.listInviteMembers(spaceId.value, invite.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '来源客户加载失败。'
  }
}

async function copyCode(code: string) {
  clearMessages()
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
  <main class="page">
      <section class="page-heading">
        <div>
          <h1>{{ section === 'admins' ? '用户管理' : section === 'invites' ? '邀请客户' : '规则设置' }}</h1>
          <p>
            {{ section === 'admins'
              ? '管理可访问当前空间的用户。'
              : section === 'invites'
                ? '管理客户加入当前空间的邀请入口。'
                : '配置当前空间的预约与取消规则。' }}
          </p>
        </div>
        <span v-if="space" class="page-context">{{ space.name }}</span>
      </section>

      <div v-if="error" class="alert alert--error">{{ error }}</div>
      <div v-if="notice" class="alert alert--success">{{ notice }}</div>

      <section v-if="section === 'settings'" class="panel loading-surface" :aria-busy="loading">
        <LoadingOverlay v-if="loading" label="正在加载规则…" />
        <div class="panel-heading">
          <div>
            <span class="eyebrow">预约规则</span>
            <h2>预约规则</h2>
            <p>两个截止时间使用同一套固定选项，但互相独立。</p>
          </div>
        </div>
        <form class="settings-form" @submit.prevent="saveSettings">
          <label class="field">
            <span>最晚预约时间</span>
            <select v-model="settings.bookingCutoffMinutes">
              <option v-for="option in cutoffOptions" :key="'booking-' + String(option.value)" :value="option.value">{{ option.label }}</option>
            </select>
            <small>进入截止时间后，不再允许创建新的预约。</small>
          </label>
          <label class="field">
            <span>取消截止时间</span>
            <select v-model="settings.cancellationCutoffMinutes">
              <option v-for="option in cutoffOptions" :key="'cancel-' + String(option.value)" :value="option.value">{{ option.label }}</option>
            </select>
            <small>客户超过截止时间后不能自行取消，有权限的用户仍可处理。</small>
          </label>
          <div><button class="button button--primary" :disabled="saving">{{ saving ? '保存中…' : '保存规则' }}</button></div>
        </form>
      </section>

      <section v-if="section === 'admins'" class="panel loading-surface" :aria-busy="loading">
        <LoadingOverlay v-if="loading" label="正在加载用户…" />
        <div class="panel-heading">
          <div>
            <span class="eyebrow">访问权限</span>
            <h2>空间用户</h2>
            <p>通过邮箱管理可访问当前空间的用户。</p>
          </div>
        </div>

        <div class="inline-form admin-user-form">
          <label class="field field--grow">
            <span>用户邮箱</span>
            <input v-model="adminEmail" type="email" autocomplete="off" placeholder="例如：operator@example.invalid" @keyup.enter="addAdmin" />
          </label>
          <small class="admin-user-form__help">输入邮箱即可添加；尚未登录过的邮箱也可以提前获得当前空间权限。</small>
          <button class="button button--primary" :disabled="saving" @click="addAdmin">添加用户</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead><tr><th>邮箱</th><th>身份</th><th>状态</th><th class="align-right">操作</th></tr></thead>
            <tbody>
              <tr v-for="admin in admins" :key="admin.id">
                <td><strong>{{ admin.email }}</strong></td>
                <td>{{ admin.platformRole === 'super_admin' ? '超级用户' : '空间用户' }}</td>
                <td>{{ admin.status === 'active' ? '启用' : '停用' }}</td>
                <td class="align-right"><button class="button button--danger-ghost" :disabled="saving" @click="removeAdmin(admin)">移除</button></td>
              </tr>
              <tr v-if="!loading && admins.length === 0"><td colspan="4" class="empty-cell">当前没有空间用户。</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="section === 'invites'" class="panel loading-surface" :aria-busy="loading">
        <LoadingOverlay v-if="loading" label="正在加载邀请码…" />
        <div class="panel-heading">
          <div>
            <span class="eyebrow">邀请设置</span>
            <h2>邀请码</h2>
            <p>邀请码只限制有效期、不限制使用人数；每个加入关系都会记录来源用户与来源邀请码。</p>
          </div>
          <button class="button button--primary" @click="showInviteForm = !showInviteForm">{{ showInviteForm ? '收起' : '+ 新建邀请码' }}</button>
        </div>

        <form v-if="showInviteForm" class="invite-form" @submit.prevent="createInvite">
          <label class="field">
            <span>用途标记（可选）</span>
            <input v-model="inviteForm.label" placeholder="例如：示例渠道 A" />
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
                <td>
                  <span class="status-pill" :class="inviteStatus(invite) === '有效' ? 'status-pill--active' : 'status-pill--disabled'">
                    {{ inviteStatus(invite) }}
                  </span>
                </td>
                <td><button class="link-button" @click="showMembers(invite)">{{ invite.memberCount }} 人 · 查看来源</button></td>
                <td class="align-right">
                  <button v-if="invite.status === 'active'" class="button button--danger-ghost" :disabled="saving" @click="revokeInvite(invite)">撤销</button>
                  <span v-else class="muted">已撤销</span>
                </td>
              </tr>
              <tr v-if="!loading && invites.length === 0"><td colspan="5" class="empty-cell">还没有邀请码。</td></tr>
            </tbody>
          </table>
        </div>

        <aside v-if="selectedInvite" class="source-panel">
          <div class="source-panel__heading">
            <div><span class="eyebrow">邀请来源</span><h3>{{ selectedInvite.label || selectedInvite.code }} 的来源客户</h3></div>
            <button class="icon-button" aria-label="关闭" @click="selectedInvite = null">×</button>
          </div>
          <div v-if="inviteMembers.length === 0" class="empty-state">还没有客户通过这个邀请码加入。</div>
          <div v-else class="member-list">
            <article v-for="member in inviteMembers" :key="member.membershipId" class="member-card">
              <div><strong>{{ member.nickname }}</strong><small>{{ member.participantCount }} 个参与人 · {{ formatDate(member.joinedAt) }} 加入</small></div>
            </article>
          </div>
        </aside>
      </section>
  </main>
</template>
