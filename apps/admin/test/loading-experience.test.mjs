import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const view = (name) => readFileSync(new URL('../src/views/' + name, import.meta.url), 'utf8')

test('admin pages keep stable shells visible while primary data loads', () => {
  const pages = [
    'BookingsView.vue',
    'OverviewView.vue',
    'ScheduleView.vue',
    'SpaceDetailView.vue',
    'SpaceOperationsView.vue',
    'SpacesView.vue',
    'UserDetailView.vue',
    'UsersView.vue',
  ]
  for (const page of pages) {
    const source = view(page)
    assert.equal(
      /v-if="[^"]*loading[^"]*"[^>]*class="[^"]*empty-state[^"]*"[^>]*>\s*正在加载/.test(source),
      false,
      page + ' replaces its stable shell with an empty loading state',
    )
    assert.match(source, /LoadingOverlay/, page + ' should use the shared loading overlay')
  }
})

test('schedule grid is visible from 07:00 through the 24:00 boundary', () => {
  const source = view('ScheduleView.vue')
  assert.match(source, /const GRID_START_MINUTE = 7 \* 60/)
  assert.match(source, /const GRID_END_MINUTE = 24 \* 60/)
  assert.match(source, /GRID_STEP_MINUTES = 30/)
  assert.match(source, /time-boundary-label/)
  assert.match(source, /minutesLabel\(GRID_END_MINUTE\)/)
})

test('schedule refreshes use a local loading state and reject stale slot responses', () => {
  const source = view('ScheduleView.vue')
  assert.match(source, /const slotsLoading = ref\(false\)/)
  assert.match(source, /const requestVersion = \+\+slotsRequestVersion/)
  assert.match(source, /requestVersion === slotsRequestVersion/)
  assert.match(source, /LoadingOverlay v-if="loading \|\| slotsLoading" label="正在加载排期…"/)
})


test('schedule calendar keeps slot and booking details inside the current workspace', () => {
  const source = view('ScheduleView.vue')

  assert.doesNotMatch(source, /router\.push\(/)
  assert.match(source, /const selectedBookingSlot = ref<AdminScheduleSlot \| null>\(null\)/)
  assert.match(source, /selectedBooking\.value = await api\.getBooking/)
  assert.match(source, /class="detail-drawer/)
  assert.match(source, /function slotMainLabel\(slot: AdminScheduleSlot\)/)
  assert.match(source, /return '空'/)
  assert.match(source, /slot-card--booked/)
  assert.match(source, /slot-card--pending/)
  assert.match(source, /slot-card--settled/)
  assert.match(source, /查看所属时段/)
})
