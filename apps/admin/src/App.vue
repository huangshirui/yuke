<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import AppIcon from './components/AppIcon.vue'
import { getAdminApi } from './services/adminApi'
import { rememberSpace, resolveRememberedSpace, spacePath } from './services/adminShell'
import type { AdminSpace, CurrentAdmin } from './types/admin'

const api = getAdminApi()
const route = useRoute()
const router = useRouter()

const admin = ref<CurrentAdmin | null>(null)
const spaces = ref<AdminSpace[]>([])
const fallbackSpaceId = ref('')
const shellError = ref('')
const spaceMenuOpen = ref(false)

const routeSpaceId = computed(() => String(route.params.spaceId || ''))
const currentSpace = computed(() =>
  spaces.value.find((space) => space.id === routeSpaceId.value) ??
  spaces.value.find((space) => space.id === fallbackSpaceId.value) ??
  null
)
const isSuperAdmin = computed(() => admin.value?.platformRole === 'super_admin')
const adminInitial = computed(() => (admin.value?.email || 'A').slice(0, 1).toUpperCase())
const roleLabel = computed(() => isSuperAdmin.value ? 'Super Admin · 超级管理员' : 'Admin · 空间管理员')

function currentPath(section: string) {
  return currentSpace.value ? spacePath(currentSpace.value.id, section) : '/'
}

async function refreshSpaces() {
  spaces.value = await api.listSpaces()
  const remembered = resolveRememberedSpace(spaces.value)
  fallbackSpaceId.value = remembered?.id ?? ''
}

async function loadShell() {
  shellError.value = ''
  try {
    const [nextAdmin] = await Promise.all([
      api.getCurrentAdmin(),
      refreshSpaces(),
    ])
    admin.value = nextAdmin
    if (routeSpaceId.value && spaces.value.some((space) => space.id === routeSpaceId.value)) {
      fallbackSpaceId.value = routeSpaceId.value
      rememberSpace(routeSpaceId.value)
    }
  } catch (cause) {
    shellError.value = cause instanceof Error ? cause.message : '管理后台初始化失败。'
  }
}

async function switchSpace(spaceId: string) {
  rememberSpace(spaceId)
  fallbackSpaceId.value = spaceId
  spaceMenuOpen.value = false
  await router.push(spacePath(spaceId))
}

async function openSpaceManagement(create = false) {
  spaceMenuOpen.value = false
  await router.push(create ? { path: '/spaces', query: { create: '1' } } : '/spaces')
}

watch(
  () => route.params.spaceId,
  async (value) => {
    spaceMenuOpen.value = false
    const spaceId = String(value || '')
    if (!spaceId) return
    if (!spaces.value.some((space) => space.id === spaceId)) {
      try { await refreshSpaces() } catch { return }
    }
    if (spaces.value.some((space) => space.id === spaceId)) {
      fallbackSpaceId.value = spaceId
      rememberSpace(spaceId)
    }
  },
)

onMounted(loadShell)
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-logo-wrap"><img src="/yu-logo.png" alt="" class="brand-logo" /></span>
        <div>
          <strong>Yu言在线</strong>
          <small>Admin Console</small>
        </div>
      </div>

      <nav v-if="currentSpace" class="primary-nav" aria-label="当前空间主导航">
        <div class="nav-group">
          <span class="nav-group-label">运营</span>
          <RouterLink :to="currentPath('overview')" class="nav-item">
            <AppIcon name="overview" /><span>概览</span>
          </RouterLink>
          <RouterLink :to="currentPath('reservations')" class="nav-item">
            <AppIcon name="bookings" /><span>预约</span>
          </RouterLink>
          <RouterLink :to="currentPath('users')" class="nav-item">
            <AppIcon name="users" /><span>用户管理</span>
          </RouterLink>
        </div>

        <div class="nav-group">
          <span class="nav-group-label">资源配置</span>
          <RouterLink :to="currentPath('resources')" class="nav-item">
            <AppIcon name="resource" /><span>预约对象</span>
          </RouterLink>
          <RouterLink :to="currentPath('slot-types')" class="nav-item">
            <AppIcon name="tag" /><span>时段类型</span>
          </RouterLink>
        </div>

        <div class="nav-group">
          <span class="nav-group-label">空间设置</span>
          <RouterLink :to="currentPath('settings')" class="nav-item">
            <AppIcon name="settings" /><span>规则设置</span>
          </RouterLink>
          <RouterLink v-if="isSuperAdmin" :to="currentPath('admins')" class="nav-item">
            <AppIcon name="admin" /><span>管理员管理</span>
          </RouterLink>
        </div>

        <div class="nav-group">
          <span class="nav-group-label">数据</span>
          <span class="nav-item nav-item--disabled">
            <AppIcon name="reconciliation" /><span>对账</span><small class="coming-badge">即将开放</small>
          </span>
        </div>
      </nav>

      <div v-else class="sidebar-empty">
        <span>尚未选择空间</span>
      </div>

      <div class="sidebar-bottom">
        <div v-if="shellError" class="sidebar-error">{{ shellError }}</div>

        <div class="space-switcher">
          <button
            class="space-switcher-button"
            :aria-expanded="spaceMenuOpen"
            aria-haspopup="menu"
            @click="spaceMenuOpen = !spaceMenuOpen"
          >
            <strong>{{ currentSpace?.name || '选择空间' }}</strong>
            <span class="switch-chevron" :class="{ open: spaceMenuOpen }">›</span>
          </button>

          <div v-if="spaceMenuOpen" class="space-menu" role="menu">
            <div class="space-menu-heading">
              <strong>切换空间</strong>
              <button class="icon-button icon-button--plain" aria-label="关闭空间切换" @click="spaceMenuOpen = false">×</button>
            </div>
            <div class="space-menu-list">
              <button
                v-for="space in spaces"
                :key="space.id"
                class="space-menu-item"
                :class="{ active: space.id === currentSpace?.id }"
                role="menuitem"
                @click="switchSpace(space.id)"
              >
                <span>{{ space.name }}</span>
                <span v-if="space.id === currentSpace?.id" class="space-check">✓</span>
              </button>
              <div v-if="spaces.length === 0" class="space-menu-empty">还没有可访问空间。</div>
            </div>
            <div v-if="isSuperAdmin" class="space-menu-actions">
              <button @click="openSpaceManagement(true)"><AppIcon name="plus" />新建空间</button>
              <button @click="openSpaceManagement(false)"><AppIcon name="external" />管理空间</button>
            </div>
          </div>
        </div>

        <div v-if="admin" class="account-card">
          <span class="avatar">{{ adminInitial }}</span>
          <div>
            <strong>{{ admin.email }}</strong>
            <small>{{ roleLabel }}</small>
          </div>
        </div>
      </div>
    </aside>

    <div class="main-frame">
      <RouterView />
    </div>
  </div>
</template>
