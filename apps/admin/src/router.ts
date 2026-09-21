import { createRouter, createWebHistory } from 'vue-router'
import EntryView from './views/EntryView.vue'
import OverviewView from './views/OverviewView.vue'
import SpacesView from './views/SpacesView.vue'
import SpaceDetailView from './views/SpaceDetailView.vue'
import SpaceOperationsView from './views/SpaceOperationsView.vue'
import ReservationsView from './views/ReservationsView.vue'
import UsersView from './views/UsersView.vue'
import UserDetailView from './views/UserDetailView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'entry', component: EntryView },
    { path: '/spaces', name: 'spaces', component: SpacesView },
    { path: '/spaces/:spaceId', redirect: (to) => '/spaces/' + to.params.spaceId + '/overview' },
    { path: '/spaces/:spaceId/overview', name: 'space-overview', component: OverviewView },
    { path: '/spaces/:spaceId/reservations', name: 'space-reservations', component: ReservationsView },
    {
      path: '/spaces/:spaceId/bookings',
      redirect: (to) => ({ path: '/spaces/' + to.params.spaceId + '/reservations', query: { ...to.query, view: 'list' } }),
    },
    {
      path: '/spaces/:spaceId/schedule',
      redirect: (to) => ({ path: '/spaces/' + to.params.spaceId + '/reservations', query: { ...to.query } }),
    },
    { path: '/spaces/:spaceId/users', name: 'space-users', component: UsersView },
    { path: '/spaces/:spaceId/users/:membershipId', name: 'space-user-detail', component: UserDetailView },
    {
      path: '/spaces/:spaceId/:section(resources|slot-types)',
      name: 'space-operations',
      component: SpaceOperationsView,
    },
    {
      path: '/spaces/:spaceId/:section(settings|admins)',
      name: 'space-detail',
      component: SpaceDetailView,
    },
    {
      path: '/spaces/:spaceId/invites',
      redirect: (to) => '/spaces/' + to.params.spaceId + '/users',
    },
    {
      path: '/spaces/:spaceId/members',
      redirect: (to) => '/spaces/' + to.params.spaceId + '/users',
    },
    {
      path: '/bookings',
      redirect: (to) => {
        const spaceId = String(to.query.spaceId || '')
        return spaceId ? '/spaces/' + encodeURIComponent(spaceId) + '/reservations?view=list' : '/'
      },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
