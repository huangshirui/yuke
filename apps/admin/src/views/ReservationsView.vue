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
        <p>在一个工作台里查看时段、预约状态，并处理预约变更。</p>
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
.operations-heading{margin-bottom: var(--space-10)}
.view-switch{display:flex;gap: var(--space-3);padding: var(--space-3);border-radius:var(--radius-9);background:var(--color-tab-bg)}
.view-switch button{min-height:32px;padding: 0 var(--space-13);border:0;border-radius:var(--radius-7);background:transparent;color:var(--color-text-secondary);font-size:var(--font-size-13);font-weight:700}
.view-switch button.active{background:var(--color-white);color:var(--color-text-primary);box-shadow:var(--shadow-view-switch)}
@media(max-width:820px){.operations-heading{align-items:stretch}.view-switch{width:100%}.view-switch button{flex:1}}
</style>
