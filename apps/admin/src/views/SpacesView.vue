<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CUTOFF_MINUTES, type CutoffMinutes } from '@yuke/shared'
import { getAdminApi } from '../services/adminApi'
import type { AdminSpace } from '../types/admin'

const api = getAdminApi()
const route = useRoute()
const router = useRouter()
const spaces = ref<AdminSpace[]>([])
const loading = ref(true)
const error = ref('')
const showCreate = ref(false)
const saving = ref(false)

const form = reactive({
  name: '',
  timezone: 'Asia/Shanghai',
  bookingCutoffMinutes: 60 as CutoffMinutes,
  cancellationCutoffMinutes: 240 as CutoffMinutes,
})

const activeCount = computed(() => spaces.value.filter((space) => space.status === 'active').length)
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

async function load() {
  loading.value = true
  error.value = ''
  try {
    spaces.value = await api.listSpaces()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '空间加载失败。'
  } finally {
    loading.value = false
  }
}

async function createSpace() {
  if (!form.name.trim()) {
    error.value = '请输入空间名称。'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const created = await api.createSpace({
      name: form.name,
      timezone: form.timezone,
      settings: {
        bookingCutoffMinutes: form.bookingCutoffMinutes,
        cancellationCutoffMinutes: form.cancellationCutoffMinutes,
      },
    })
    showCreate.value = false
    form.name = ''
    await load()
    await router.push('/spaces/' + created.id + '/overview')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '创建失败。'
  } finally {
    saving.value = false
  }
}

async function toggleStatus(space: AdminSpace) {
  error.value = ''
  try {
    await api.setSpaceStatus(space.id, space.status === 'active' ? 'disabled' : 'active')
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '状态更新失败。'
  }
}

onMounted(async () => {
  if (route.query.create === '1') showCreate.value = true
  await load()
})
</script>

<template>
  <main class="page">
    <section class="page-heading">
      <div>
        <span class="eyebrow">Spaces</span>
        <h1>空间管理</h1>
        <p>每个空间的数据和运营设置彼此隔离。停用空间会保留历史数据，但不再接受新的预约。</p>
      </div>
      <button class="button button--primary" @click="showCreate = true">+ 新建空间</button>
    </section>

    <div v-if="error" class="alert alert--error">{{ error }}</div>

    <section class="metric-row">
      <article class="metric-card"><span>空间总数</span><strong>{{ spaces.length }}</strong></article>
      <article class="metric-card"><span>运行中</span><strong>{{ activeCount }}</strong></article>
      <article class="metric-card"><span>已停用</span><strong>{{ spaces.length - activeCount }}</strong></article>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2>全部空间</h2>
          <p>进入空间后可继续配置管理员、预约规则和邀请码。</p>
        </div>
      </div>

      <div v-if="loading" class="empty-state">正在加载空间…</div>
      <div v-else-if="spaces.length === 0" class="empty-state">
        <strong>还没有空间</strong><span>创建第一个空间后即可开始配置。</span>
      </div>
      <div v-else class="table-wrap">
        <table>
          <thead><tr><th>空间</th><th>时区</th><th>状态</th><th class="align-right">操作</th></tr></thead>
          <tbody>
            <tr v-for="space in spaces" :key="space.id">
              <td>
                <button class="link-button space-name" @click="router.push('/spaces/' + space.id + '/settings')">{{ space.name }}</button>
                <small class="mono">{{ space.id }}</small>
              </td>
              <td>{{ space.timezone }}</td>
              <td>
                <span class="status-pill" :class="'status-pill--' + space.status">
                  {{ space.status === 'active' ? '运行中' : '已停用' }}
                </span>
              </td>
              <td class="align-right actions">
                <button class="button button--ghost" @click="router.push('/spaces/' + space.id + '/settings')">管理</button>
                <button class="button button--ghost" @click="toggleStatus(space)">{{ space.status === 'active' ? '停用' : '启用' }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="create-space-title">
        <div class="modal-heading">
          <div><span class="eyebrow">New Space</span><h2 id="create-space-title">新建空间</h2></div>
          <button class="icon-button" aria-label="关闭" @click="showCreate = false">×</button>
        </div>

        <form class="form-stack" @submit.prevent="createSpace">
          <label class="field">
            <span>空间名称</span>
            <input v-model="form.name" autofocus placeholder="例如：示例预约空间" />
          </label>
          <label class="field">
            <span>时区</span>
            <select v-model="form.timezone">
              <option value="Asia/Shanghai">Asia/Shanghai</option>
              <option value="Asia/Hong_Kong">Asia/Hong_Kong</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
            </select>
          </label>
          <div class="field-grid">
            <label class="field">
              <span>最晚预约时间</span>
              <select v-model="form.bookingCutoffMinutes">
                <option v-for="option in cutoffOptions" :key="'book-' + String(option.value)" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label class="field">
              <span>取消截止时间</span>
              <select v-model="form.cancellationCutoffMinutes">
                <option v-for="option in cutoffOptions" :key="'cancel-' + String(option.value)" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="button button--ghost" @click="showCreate = false">取消</button>
            <button class="button button--primary" :disabled="saving">{{ saving ? '创建中…' : '创建空间' }}</button>
          </div>
        </form>
      </section>
    </div>
  </main>
</template>
