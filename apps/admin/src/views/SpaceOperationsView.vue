<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import LoadingOverlay from '../components/LoadingOverlay.vue'
import { getAdminApi } from '../services/adminApi'
import type {
  AdminMemberDetail,
  AdminMemberSummary,
  AdminResource,
  AdminSlotType,
  AdminSpace,
  AdminUserSummary,
  InviteSummary,
} from '../types/admin'

const api = getAdminApi()
const route = useRoute()

const space = ref<AdminSpace | null>(null)
const resources = ref<AdminResource[]>([])
const slotTypes = ref<AdminSlotType[]>([])
const members = ref<AdminMemberSummary[]>([])
const admins = ref<AdminUserSummary[]>([])
const invites = ref<InviteSummary[]>([])
const selectedMember = ref<AdminMemberDetail | null>(null)

const loading = ref(true)
const sectionLoading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')

const showResourceForm = ref(false)
const editingResource = ref<AdminResource | null>(null)
const resourceForm = reactive({ name: '', note: '' })

const showSlotTypeForm = ref(false)
const editingSlotType = ref<AdminSlotType | null>(null)
const slotTypeForm = reactive({ name: '' })

const memberFilters = reactive({
  invitedByAdminId: '',
  inviteCodeId: '',
})
const memberNoteDraft = ref('')

const sections = ['resources', 'slot-types', 'members'] as const
const section = computed(() => {
  const value = String(route.params.section ?? 'resources')
  return sections.includes(value as (typeof sections)[number]) ? value : 'resources'
})
const spaceId = computed(() => String(route.params.spaceId))

const activeResourceCount = computed(() => resources.value.filter((item) => item.status === 'active').length)
const activeSlotTypeCount = computed(() => slotTypes.value.filter((item) => item.status === 'active').length)

function clearMessages() {
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

function adminLabel(adminId: string) {
  const admin = admins.value.find((item) => item.id === adminId)
  return admin?.email ?? adminId
}

function inviteLabel(inviteId: string) {
  const invite = invites.value.find((item) => item.id === inviteId)
  return invite?.label || invite?.code || inviteId
}

async function loadSpace() {
  const spaces = await api.listSpaces()
  space.value = spaces.find((item) => item.id === spaceId.value) ?? null
  if (!space.value) throw new Error('找不到这个空间。')
}

async function loadResources() {
  resources.value = await api.listResources(spaceId.value)
}

async function loadSlotTypes() {
  slotTypes.value = await api.listSlotTypes(spaceId.value)
}

async function loadMembers() {
  const [nextMembers, nextAdmins, nextInvites] = await Promise.all([
    api.listMembers(spaceId.value, {
      invitedByAdminId: memberFilters.invitedByAdminId || undefined,
      inviteCodeId: memberFilters.inviteCodeId || undefined,
    }),
    api.listAdmins(spaceId.value),
    api.listInvites(spaceId.value),
  ])
  members.value = nextMembers
  admins.value = nextAdmins
  invites.value = nextInvites
}

async function loadSection() {
  if (!space.value) return
  sectionLoading.value = true
  clearMessages()
  selectedMember.value = null
  try {
    if (section.value === 'resources') await loadResources()
    if (section.value === 'slot-types') await loadSlotTypes()
    if (section.value === 'members') await loadMembers()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '数据加载失败。'
  } finally {
    sectionLoading.value = false
  }
}

async function load() {
  loading.value = true
  clearMessages()
  try {
    await loadSpace()
    await loadSection()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '空间加载失败。'
  } finally {
    loading.value = false
  }
}

function openResourceForm(resource?: AdminResource) {
  editingResource.value = resource ?? null
  resourceForm.name = resource?.name ?? ''
  resourceForm.note = resource?.note ?? ''
  showResourceForm.value = true
}

async function saveResource() {
  clearMessages()
  const name = resourceForm.name.trim()
  if (!name) {
    error.value = '请输入预约对象名称。'
    return
  }
  saving.value = true
  try {
    if (editingResource.value) {
      await api.updateResource(spaceId.value, editingResource.value.id, {
        name,
        note: resourceForm.note.trim() || null,
      })
      notice.value = '预约对象已更新。'
    } else {
      await api.createResource(spaceId.value, {
        name,
        note: resourceForm.note.trim() || null,
      })
      notice.value = '预约对象已创建。'
    }
    showResourceForm.value = false
    await loadResources()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '预约对象保存失败。'
  } finally {
    saving.value = false
  }
}

async function toggleResource(resource: AdminResource) {
  clearMessages()
  saving.value = true
  try {
    const next = resource.status === 'active' ? 'inactive' : 'active'
    await api.setResourceStatus(spaceId.value, resource.id, next)
    await loadResources()
    notice.value = next === 'active' ? '预约对象已启用。' : '预约对象已停用；历史数据仍然保留。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '预约对象状态更新失败。'
  } finally {
    saving.value = false
  }
}

function openSlotTypeForm(slotType?: AdminSlotType) {
  editingSlotType.value = slotType ?? null
  slotTypeForm.name = slotType?.name ?? ''
  showSlotTypeForm.value = true
}

async function saveSlotType() {
  clearMessages()
  const name = slotTypeForm.name.trim()
  if (!name) {
    error.value = '请输入时段类型名称。'
    return
  }
  saving.value = true
  try {
    if (editingSlotType.value) {
      await api.updateSlotType(spaceId.value, editingSlotType.value.id, { name })
      notice.value = '时段类型已更新。'
    } else {
      await api.createSlotType(spaceId.value, { name })
      notice.value = '时段类型已创建。'
    }
    showSlotTypeForm.value = false
    await loadSlotTypes()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '时段类型保存失败。'
  } finally {
    saving.value = false
  }
}

async function toggleSlotType(slotType: AdminSlotType) {
  clearMessages()
  saving.value = true
  try {
    const next = slotType.status === 'active' ? 'inactive' : 'active'
    await api.setSlotTypeStatus(spaceId.value, slotType.id, next)
    await loadSlotTypes()
    notice.value = next === 'active' ? '时段类型已启用。' : '时段类型已停用；历史数据仍然保留。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '时段类型状态更新失败。'
  } finally {
    saving.value = false
  }
}

async function applyMemberFilters() {
  clearMessages()
  selectedMember.value = null
  sectionLoading.value = true
  try {
    await loadMembers()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '客户列表加载失败。'
  } finally {
    sectionLoading.value = false
  }
}

async function resetMemberFilters() {
  memberFilters.invitedByAdminId = ''
  memberFilters.inviteCodeId = ''
  await applyMemberFilters()
}

async function openMember(member: AdminMemberSummary) {
  clearMessages()
  try {
    selectedMember.value = await api.getMember(spaceId.value, member.membershipId)
    memberNoteDraft.value = selectedMember.value.adminNote ?? ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '客户详情加载失败。'
  }
}

async function saveMemberNote() {
  if (!selectedMember.value) return
  clearMessages()
  saving.value = true
  try {
    const value = memberNoteDraft.value.trim() || null
    await api.updateMemberAdminNote(spaceId.value, selectedMember.value.membershipId, value)
    selectedMember.value.adminNote = value
    const summary = members.value.find((item) => item.membershipId === selectedMember.value?.membershipId)
    if (summary) summary.adminNote = value
    notice.value = '客户内部备注已保存。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '内部备注保存失败。'
  } finally {
    saving.value = false
  }
}

async function saveParticipantNote(participantId: string, value: string | null) {
  if (!selectedMember.value) return
  clearMessages()
  saving.value = true
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

watch(spaceId, load)
watch(section, loadSection)
onMounted(load)
</script>

<template>
  <main class="page">
      <section class="page-heading">
        <div>
          <h1>{{ section === 'resources' ? '预约对象' : section === 'slot-types' ? '时段类型' : '客户管理' }}</h1>
          <p>
            {{ section === 'resources'
              ? '维护当前空间可被预约的资源。'
              : section === 'slot-types'
                ? '维护时段分类，用于小程序展示与后续统计。'
                : '查看当前空间的客户与参与人。' }}
          </p>
        </div>
        <span v-if="space" class="page-context">{{ space.name }}</span>
      </section>

      <div v-if="error" class="alert alert--error">{{ error }}</div>
      <div v-if="notice" class="alert alert--success">{{ notice }}</div>

      <section v-if="section === 'resources'" class="panel loading-surface" :aria-busy="loading || sectionLoading">
        <LoadingOverlay v-if="loading || sectionLoading" label="正在加载预约对象…" />
        <div class="panel-heading">
          <div>
            <span class="eyebrow">预约对象</span>
            <h2>预约对象</h2>
            <p>预约对象停用后保留历史记录，但不能继续用于新时段和新预约。</p>
          </div>
          <button class="button button--primary" @click="openResourceForm()">+ 新建预约对象</button>
        </div>

        <div class="summary-strip">
          <span><strong>{{ resources.length }}</strong> 个预约对象</span>
          <span><strong>{{ activeResourceCount }}</strong> 个启用中</span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>预约对象</th><th>备注</th><th>状态</th><th class="align-right">操作</th></tr>
            </thead>
            <tbody>
              <tr v-for="resource in resources" :key="resource.id">
                <td><strong>{{ resource.name }}</strong></td>
                <td class="secondary-cell">{{ resource.note || '—' }}</td>
                <td>
                  <span class="status-pill" :class="resource.status === 'active' ? 'status-pill--active' : 'status-pill--disabled'">
                    {{ resource.status === 'active' ? '启用' : '已停用' }}
                  </span>
                </td>
                <td class="align-right">
                  <div class="actions">
                    <button class="button button--ghost" @click="openResourceForm(resource)">编辑</button>
                    <button
                      class="button"
                      :class="resource.status === 'active' ? 'button--danger-ghost' : 'button--ghost'"
                      :disabled="saving"
                      @click="toggleResource(resource)"
                    >
                      {{ resource.status === 'active' ? '停用' : '启用' }}
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="!loading && !sectionLoading && resources.length === 0">
                <td colspan="4" class="empty-cell">还没有预约对象。创建后才能配置可预约时段。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-else-if="section === 'slot-types'" class="panel loading-surface" :aria-busy="loading || sectionLoading">
        <LoadingOverlay v-if="loading || sectionLoading" label="正在加载时段类型…" />
        <div class="panel-heading">
          <div>
            <span class="eyebrow">时段配置</span>
            <h2>时段类型</h2>
            <p>类型会展示在小程序预约时段中，也用于后续对账统计。已使用的类型只停用、不删除。</p>
          </div>
          <button class="button button--primary" @click="openSlotTypeForm()">+ 新建时段类型</button>
        </div>

        <div class="summary-strip">
          <span><strong>{{ slotTypes.length }}</strong> 个类型</span>
          <span><strong>{{ activeSlotTypeCount }}</strong> 个启用中</span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>类型名称</th><th>状态</th><th class="align-right">操作</th></tr>
            </thead>
            <tbody>
              <tr v-for="slotType in slotTypes" :key="slotType.id">
                <td><strong>{{ slotType.name }}</strong></td>
                <td>
                  <span class="status-pill" :class="slotType.status === 'active' ? 'status-pill--active' : 'status-pill--disabled'">
                    {{ slotType.status === 'active' ? '启用' : '已停用' }}
                  </span>
                </td>
                <td class="align-right">
                  <div class="actions">
                    <button class="button button--ghost" @click="openSlotTypeForm(slotType)">编辑</button>
                    <button
                      class="button"
                      :class="slotType.status === 'active' ? 'button--danger-ghost' : 'button--ghost'"
                      :disabled="saving"
                      @click="toggleSlotType(slotType)"
                    >
                      {{ slotType.status === 'active' ? '停用' : '启用' }}
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="!loading && !sectionLoading && slotTypes.length === 0">
                <td colspan="3" class="empty-cell">还没有时段类型。至少创建一个启用类型后再配置时段。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-else class="panel loading-surface" :aria-busy="loading || sectionLoading">
        <LoadingOverlay v-if="loading || sectionLoading" label="正在加载客户…" />
        <div class="panel-heading">
          <div>
            <span class="eyebrow">客户资料</span>
            <h2>客户与参与人</h2>
            <p>查看加入来源和参与人资料；内部备注仅在管理端可见，不会展示到小程序。</p>
          </div>
        </div>

        <div class="filter-bar">
          <label class="field">
            <span>来源用户</span>
            <select v-model="memberFilters.invitedByAdminId">
              <option value="">全部用户</option>
              <option v-for="admin in admins" :key="admin.id" :value="admin.id">{{ admin.email }}</option>
            </select>
          </label>
          <label class="field">
            <span>来源邀请码</span>
            <select v-model="memberFilters.inviteCodeId">
              <option value="">全部邀请码</option>
              <option v-for="invite in invites" :key="invite.id" :value="invite.id">{{ invite.label || invite.code }}</option>
            </select>
          </label>
          <div class="filter-actions">
            <button class="button button--primary" @click="applyMemberFilters">筛选</button>
            <button class="button button--ghost" @click="resetMemberFilters">清除</button>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>客户</th><th>参与人</th><th>邀请来源</th><th>加入时间</th><th class="align-right">操作</th></tr>
            </thead>
            <tbody>
              <tr v-for="member in members" :key="member.membershipId">
                <td>
                  <strong>{{ member.nickname }}</strong>
                </td>
                <td>{{ member.participantCount }} 个</td>
                <td>
                  <div>{{ adminLabel(member.invitedByAdminId) }}</div>
                  <small class="muted">{{ inviteLabel(member.inviteCodeId) }}</small>
                </td>
                <td>{{ formatDate(member.joinedAt) }}</td>
                <td class="align-right"><button class="button button--ghost" @click="openMember(member)">查看详情</button></td>
              </tr>
              <tr v-if="!loading && !sectionLoading && members.length === 0">
                <td colspan="5" class="empty-cell">当前筛选条件下没有客户。</td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside v-if="selectedMember" class="source-panel member-detail-panel">
          <div class="source-panel__heading">
            <div>
              <span class="eyebrow">客户详情</span>
              <h3>{{ selectedMember.nickname }}</h3>
              <p class="muted">
                {{ selectedMember.participantCount }} 个参与人 · {{ selectedMember.bookingCount }} 条预约记录
              </p>
            </div>
            <button class="icon-button" aria-label="关闭客户详情" @click="selectedMember = null">×</button>
          </div>

          <div class="detail-meta">
            <div><span>来源用户</span><strong>{{ adminLabel(selectedMember.invitedByAdminId) }}</strong></div>
            <div><span>来源邀请码</span><strong>{{ inviteLabel(selectedMember.inviteCodeId) }}</strong></div>
            <div><span>加入时间</span><strong>{{ formatDate(selectedMember.joinedAt) }}</strong></div>
          </div>

          <div class="note-editor">
            <label class="field">
              <span>客户内部备注</span>
              <textarea v-model="memberNoteDraft" rows="3" placeholder="仅管理端可见"></textarea>
              <small>此备注不会展示给小程序客户。</small>
            </label>
            <button class="button button--primary" :disabled="saving" @click="saveMemberNote">保存客户备注</button>
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
                <div>
                  <span>客户备注</span>
                  <p>{{ participant.userNote || '无' }}</p>
                </div>
                <label class="field">
                  <span>内部备注</span>
                  <textarea v-model="participant.adminNote" rows="2" placeholder="仅管理端可见"></textarea>
                  <button
                    class="button button--ghost"
                    :disabled="saving"
                    @click="saveParticipantNote(participant.id, participant.adminNote)"
                  >
                    保存参与人备注
                  </button>
                </label>
              </div>
            </article>
            <div v-if="selectedMember.participants.length === 0" class="empty-state">这个客户还没有参与人。</div>
          </div>
        </aside>
      </section>

    <div v-if="showResourceForm" class="modal-backdrop" @click.self="showResourceForm = false">
      <form class="modal" role="dialog" aria-modal="true" aria-label="预约对象编辑" @submit.prevent="saveResource">
        <div class="modal-heading">
          <div><span class="eyebrow">预约对象</span><h2>{{ editingResource ? '编辑预约对象' : '新建预约对象' }}</h2></div>
          <button type="button" class="icon-button" aria-label="关闭" @click="showResourceForm = false">×</button>
        </div>
        <div class="form-stack">
          <label class="field">
            <span>名称</span>
            <input v-model="resourceForm.name" placeholder="例如：预约对象 A" />
          </label>
          <label class="field">
            <span>备注（可选）</span>
            <textarea v-model="resourceForm.note" rows="4" placeholder="仅用于管理端识别和运营说明"></textarea>
          </label>
          <div class="modal-actions">
            <button type="button" class="button button--ghost" @click="showResourceForm = false">取消</button>
            <button class="button button--primary" :disabled="saving">{{ saving ? '保存中…' : '保存预约对象' }}</button>
          </div>
        </div>
      </form>
    </div>

    <div v-if="showSlotTypeForm" class="modal-backdrop" @click.self="showSlotTypeForm = false">
      <form class="modal" role="dialog" aria-modal="true" aria-label="时段类型编辑" @submit.prevent="saveSlotType">
        <div class="modal-heading">
          <div><span class="eyebrow">时段类型</span><h2>{{ editingSlotType ? '编辑时段类型' : '新建时段类型' }}</h2></div>
          <button type="button" class="icon-button" aria-label="关闭" @click="showSlotTypeForm = false">×</button>
        </div>
        <div class="form-stack">
          <label class="field">
            <span>类型名称</span>
            <input v-model="slotTypeForm.name" placeholder="例如：标准时段" />
            <small>类型会展示在小程序，并用于后续按类型统计数量。</small>
          </label>
          <div class="modal-actions">
            <button type="button" class="button button--ghost" @click="showSlotTypeForm = false">取消</button>
            <button class="button button--primary" :disabled="saving">{{ saving ? '保存中…' : '保存时段类型' }}</button>
          </div>
        </div>
      </form>
    </div>
  </main>
</template>
