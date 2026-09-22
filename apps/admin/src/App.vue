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
const accessDenied = ref(false)
const spaceMenuOpen = ref(false)

const routeSpaceId = computed(() => String(route.params.spaceId || ''))
const currentSpace = computed(() =>
  spaces.value.find((space) => space.id === routeSpaceId.value) ??
  spaces.value.find((space) => space.id === fallbackSpaceId.value) ??
  null
)
const isSuperAdmin = computed(() => admin.value?.platformRole === 'super_admin')
const adminDisplayName = computed(() =>
  admin.value?.displayName?.trim() || admin.value?.email || '用户'
)
const adminInitial = computed(() => adminDisplayName.value.slice(0, 1).toUpperCase())
const spaceInitial = computed(() => {
  const name = currentSpace.value?.name.trim()
  return name ? name.slice(0, 1).toUpperCase() : 'Y'
})
const roleLabel = computed(() => isSuperAdmin.value ? '超级用户' : '服务方用户')

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
    const error = cause as Error & { code?: string; statusCode?: number }
    if (error?.code === 'SPACE_ACCESS_DENIED' || error?.statusCode === 403) {
      accessDenied.value = true
      window.setTimeout(logout, 400)
      return
    }
    shellError.value = cause instanceof Error ? cause.message : '管理后台初始化失败。'
  }
}

async function switchSpace(spaceId: string) {
  rememberSpace(spaceId)
  fallbackSpaceId.value = spaceId
  spaceMenuOpen.value = false
  await router.push(spacePath(spaceId))
}

function logout() {
  window.location.replace('/cdn-cgi/access/logout')
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
  <main v-if="accessDenied" class="access-gate">
    <section class="access-gate__card" role="status" aria-live="polite">
      <span class="brand-logo-wrap access-gate__logo"><img src="/yu-logo.png" alt="" class="brand-logo" /></span>
      <span class="eyebrow">Yu言在线运营后台</span>
      <h1>此账号没有后台访问权限</h1>
      <p>当前登录邮箱尚未被添加为后台用户。正在自动退出，请使用已授权的邮箱重新登录。</p>
      <button class="button button--primary" type="button" @click="logout">立即退出并重新登录</button>
    </section>
  </main>

  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="space-switcher space-switcher--brand">
        <button
          class="space-brand-button"
          :aria-expanded="spaceMenuOpen"
          aria-haspopup="menu"
          @click="spaceMenuOpen = !spaceMenuOpen"
        >
          <span class="space-brand-mark" aria-hidden="true">{{ spaceInitial }}</span>
          <span class="space-brand-copy">
            <strong>{{ currentSpace?.name || '选择服务方' }}</strong>
            <small>运营后台</small>
          </span>
          <span class="switch-chevron" :class="{ open: spaceMenuOpen }">›</span>
        </button>

        <div v-if="spaceMenuOpen" class="space-menu" role="menu">
          <div class="space-menu-heading">
            <strong>切换服务方</strong>
            <button class="icon-button icon-button--plain" aria-label="关闭服务方切换" @click="spaceMenuOpen = false">×</button>
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
            <div v-if="spaces.length === 0" class="space-menu-empty">还没有可访问服务方。</div>
          </div>
          <div v-if="isSuperAdmin" class="space-menu-actions">
            <button @click="openSpaceManagement(true)"><AppIcon name="plus" />新建服务方</button>
            <button @click="openSpaceManagement(false)"><AppIcon name="external" />管理服务方</button>
          </div>
        </div>
      </div>

      <nav v-if="currentSpace" class="primary-nav" aria-label="当前服务方主导航">
        <div class="nav-group">
          <span class="nav-group-label">运营</span>
          <RouterLink :to="currentPath('overview')" class="nav-item">
            <AppIcon name="overview" /><span>概览</span>
          </RouterLink>
          <RouterLink :to="currentPath('reservations')" class="nav-item">
            <AppIcon name="bookings" /><span>预约</span>
          </RouterLink>
          <RouterLink :to="currentPath('users')" class="nav-item">
            <AppIcon name="users" /><span>客户管理</span>
          </RouterLink>
        </div>

        <div class="nav-group">
          <span class="nav-group-label">预约配置</span>
          <RouterLink :to="currentPath('resources')" class="nav-item">
            <AppIcon name="resource" /><span>预约项目</span>
          </RouterLink>
          <RouterLink :to="currentPath('slot-types')" class="nav-item">
            <AppIcon name="tag" /><span>时段类型</span>
          </RouterLink>
        </div>

        <div class="nav-group">
          <span class="nav-group-label">服务方设置</span>
          <RouterLink :to="currentPath('settings')" class="nav-item">
            <AppIcon name="settings" /><span>规则设置</span>
          </RouterLink>
          <RouterLink v-if="isSuperAdmin" :to="currentPath('admins')" class="nav-item">
            <AppIcon name="admin" /><span>用户管理</span>
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
        <span>尚未选择服务方</span>
      </div>

      <div class="sidebar-bottom">
        <div v-if="shellError" class="sidebar-error">{{ shellError }}</div>

        <div v-if="admin" class="account-card">
          <span class="avatar">{{ adminInitial }}</span>
          <div class="account-card__identity">
            <strong>{{ adminDisplayName }}</strong>
            <small>{{ admin.email }} · {{ roleLabel }}</small>
          </div>
          <button class="account-logout" type="button" @click="logout">退出登录</button>
        </div>
      </div>
    </aside>

    <div class="main-frame">
      <RouterView />
    </div>
  </div>
</template>
