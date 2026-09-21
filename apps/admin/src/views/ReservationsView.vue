<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ScheduleView from './ScheduleView.vue'
import BookingsView from './BookingsView.vue'

const route = useRoute()
const router = useRouter()

const activeView = computed<'calendar' | 'list'>(() =>
  route.query.view === 'list' ? 'list' : 'calendar'
)

function switchView(view: 'calendar' | 'list') {
  const query = { ...route.query }
  if (view === 'calendar') {
    delete query.view
  } else {
    query.view = 'list'
  }
  router.replace({ path: route.path, query })
}
</script>

<template>
  <main class="page reservations-page">
    <section class="page-heading page-heading--compact operations-heading">
      <div>
        <h1>预约</h1>
        <p>在一个工作台里查看开放时段、预约状态，并处理预约变更。</p>
      </div>
      <nav class="view-switch" aria-label="预约视图">
        <button :class="{ active: activeView === 'calendar' }" @click="switchView('calendar')">日历</button>
        <button :class="{ active: activeView === 'list' }" @click="switchView('list')">列表</button>
      </nav>
    </section>

    <ScheduleView v-if="activeView === 'calendar'" embedded />
    <BookingsView v-else embedded />
  </main>
</template>

<style scoped>
.operations-heading{margin-bottom:10px}
.view-switch{display:flex;gap:3px;padding:3px;border-radius:9px;background:#e9eeef}
.view-switch button{min-height:32px;padding:0 13px;border:0;border-radius:7px;background:transparent;color:var(--muted);font-size:13px;font-weight:700}
.view-switch button.active{background:#fff;color:var(--ink);box-shadow:0 1px 5px rgba(23,32,42,.08)}
@media(max-width:820px){.operations-heading{align-items:stretch}.view-switch{width:100%}.view-switch button{flex:1}}
</style>
