<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LoadingOverlay from '../components/LoadingOverlay.vue'
import { getAdminApi } from '../services/adminApi'
import { spacePath } from '../services/adminShell'
import type {
  AdminBooking,
  AdminMemberSummary,
  AdminResource,
  AdminScheduleSlot,
  AdminSpace,
} from '../types/admin'

const api = getAdminApi()
const route = useRoute()
const router = useRouter()

const space = ref<AdminSpace | null>(null)
const bookings = ref<AdminBooking[]>([])
const members = ref<AdminMemberSummary[]>([])
const resources = ref<AdminResource[]>([])
const slots = ref<AdminScheduleSlot[]>([])
const loading = ref(true)
const error = ref('')

const spaceId = computed(() => String(route.params.spaceId || ''))

function dateInTimezone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const read = (type: string) => parts.find((part) => part.type === type)?.value
  return `${read('year')}-${read('month')}-${read('day')}`
}

function addDays(date: string, days: number) {
  const value = new Date(date + 'T12:00:00Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const today = computed(() => dateInTimezone(space.value?.timezone || 'UTC'))
const todayBookings = computed(() =>
  bookings.value
    .filter((item) => item.slot.localDate === today.value && item.status !== 'cancelled')
    .sort((a, b) => Date.parse(a.slot.startAt) - Date.parse(b.slot.startAt))
)
const activeMembers = computed(() => members.value.filter((item) => item.status === 'active'))
const activeSlots = computed(() => slots.value.filter((item) => item.status === 'open' && item.bookable))
const weekBookings = computed(() => bookings.value.filter((item) =>
  item.slot.localDate >= today.value &&
  item.slot.localDate <= addDays(today.value, 6) &&
  item.status !== 'cancelled'
))

const trend = computed(() => {
  const start = addDays(today.value, -6)
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index)
    const valid = bookings.value.filter((item) => item.slot.localDate === date && item.status !== 'cancelled').length
    const cancelled = bookings.value.filter((item) => item.slot.localDate === date && item.status === 'cancelled').length
    return { date, valid, cancelled, total: valid + cancelled }
  })
})
const maxTrend = computed(() => Math.max(1, ...trend.value.map((item) => item.total)))
const latestMembers = computed(() =>
  [...members.value].sort((a, b) => Date.parse(b.joinedAt) - Date.parse(a.joinedAt)).slice(0, 4)
)

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: space.value?.timezone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function shortDate(value: string) {
  return value.slice(5).replace('-', '/')
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const spaces = await api.listSpaces()
    space.value = spaces.find((item) => item.id === spaceId.value) ?? null
    if (!space.value) throw new Error('找不到这个空间。')

    const from = addDays(today.value, -6)
    const to = addDays(today.value, 6)
    const [nextBookings, nextMembers, nextResources] = await Promise.all([
      api.listBookings(spaceId.value, { from, to }),
      api.listMembers(spaceId.value),
      api.listResources(spaceId.value),
    ])
    bookings.value = nextBookings
    members.value = nextMembers
    resources.value = nextResources

    const slotGroups = await Promise.all(
      nextResources
        .filter((item) => item.status === 'active')
        .map((item) => api.listScheduleSlots(spaceId.value, item.id, today.value, to))
    )
    slots.value = slotGroups.flat()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '概览加载失败。'
  } finally {
    loading.value = false
  }
}

watch(spaceId, load)
onMounted(load)
</script>

<template>
  <main class="page overview-page">
    <section class="page-heading overview-heading">
      <div>
        <h1>概览</h1>
        <p v-if="space">欢迎回来。这里是「{{ space.name }}」的运营概览，帮助你快速了解当前预约情况。</p>
      </div>
      <span v-if="space" class="date-chip">{{ today }}（今天）</span>
    </section>

    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div class="overview-content loading-surface" :aria-busy="loading">
      <LoadingOverlay v-if="loading" label="正在加载运营概览…" />
      <section class="overview-metrics">
        <article class="overview-metric"><span>今日预约</span><strong>{{ todayBookings.length }}</strong><small>当前有效预约</small></article>
        <article class="overview-metric"><span>注册客户</span><strong>{{ activeMembers.length }}</strong><small>当前空间客户</small></article>
        <article class="overview-metric"><span>未来 7 天预约</span><strong>{{ weekBookings.length }}</strong><small>不含已取消</small></article>
        <article class="overview-metric"><span>可预约时段</span><strong>{{ activeSlots.length }}</strong><small>未来 7 天</small></article>
      </section>

      <section class="overview-grid">
        <article class="panel overview-card overview-today">
          <div class="overview-card-heading">
            <h2>今日预约</h2>
            <button class="link-button" @click="router.push({ path: spacePath(spaceId, 'reservations'), query: { view: 'list' } })">查看全部 →</button>
          </div>
          <div v-if="!loading && todayBookings.length === 0" class="empty-state compact">今天还没有预约。</div>
          <button
            v-for="booking in todayBookings.slice(0, 6)"
            :key="booking.id"
            class="today-booking-row"
            @click="router.push(spacePath(spaceId, 'bookings'))"
          >
            <span class="today-time">{{ formatTime(booking.slot.startAt) }}–{{ formatTime(booking.slot.endAt) }}</span>
            <span class="today-main"><strong>{{ booking.slotType.name }}</strong><small>{{ booking.participant.name }}</small></span>
            <span class="today-resource">{{ booking.resource.name }}</span>
            <span class="row-chevron">›</span>
          </button>
        </article>

        <article class="panel overview-card">
          <div class="overview-card-heading">
            <h2>近 7 天预约趋势</h2>
            <div class="trend-legend"><span><i class="legend-dot"></i>有效</span><span><i class="legend-dot cancelled"></i>已取消</span></div>
          </div>
          <div class="trend-chart" aria-label="近 7 天预约趋势">
            <div v-for="item in trend" :key="item.date" class="trend-column">
              <div class="trend-bar-shell">
                <div class="trend-bar valid" :style="{ height: (item.valid / maxTrend * 100) + '%' }"></div>
                <div class="trend-bar cancelled" :style="{ height: (item.cancelled / maxTrend * 100) + '%' }"></div>
              </div>
              <span>{{ shortDate(item.date) }}</span>
            </div>
          </div>
        </article>

        <article class="panel overview-card">
          <div class="overview-card-heading"><h2>常用操作</h2></div>
          <div class="quick-actions">
            <button @click="router.push(spacePath(spaceId, 'reservations'))"><strong>新建开放时间</strong><small>设置可预约时段</small></button>
            <button @click="router.push(spacePath(spaceId, 'users'))"><strong>邀请客户</strong><small>生成或管理邀请码</small></button>
            <button @click="router.push(spacePath(spaceId, 'resources'))"><strong>添加预约对象</strong><small>维护预约资源</small></button>
            <button @click="router.push(spacePath(spaceId, 'settings'))"><strong>规则设置</strong><small>预约与取消规则</small></button>
          </div>
        </article>

        <article class="panel overview-card">
          <div class="overview-card-heading"><h2>待处理事项</h2></div>
          <div class="task-list">
            <div><strong>{{ todayBookings.length }}</strong><span>个今日有效预约需要关注</span></div>
            <div><strong>{{ activeSlots.length }}</strong><span>个未来 7 天开放时段可预约</span></div>
            <div><strong>{{ resources.filter((item) => item.status === 'active').length }}</strong><span>个预约对象正在启用</span></div>
          </div>
        </article>

        <article class="panel overview-card overview-latest">
          <div class="overview-card-heading">
            <h2>最新客户</h2>
            <button class="link-button" @click="router.push(spacePath(spaceId, 'users'))">查看全部 →</button>
          </div>
          <div v-if="!loading && latestMembers.length === 0" class="empty-state compact">还没有客户加入。</div>
          <div v-for="member in latestMembers" :key="member.membershipId" class="latest-user-row">
            <span class="user-avatar">{{ member.nickname.slice(0, 1) || 'U' }}</span>
            <strong>{{ member.nickname || '未命名客户' }}</strong>
            <small>{{ member.participantCount }} 个参与人</small>
          </div>
        </article>
      </section>
    </div>
  </main>
</template>
