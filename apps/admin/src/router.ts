import { createRouter, createWebHistory } from 'vue-router'
import SpacesView from './views/SpacesView.vue'
import SpaceDetailView from './views/SpaceDetailView.vue'
import SpaceOperationsView from './views/SpaceOperationsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/spaces' },
    { path: '/spaces', name: 'spaces', component: SpacesView },
    {
      path: '/spaces/:spaceId/:section(settings|admins|invites)?',
      name: 'space-detail',
      component: SpaceDetailView,
    },
    {
      path: '/spaces/:spaceId/:section(resources|slot-types|members)',
      name: 'space-operations',
      component: SpaceOperationsView,
    },
    { path: '/:pathMatch(.*)*', redirect: '/spaces' },
  ],
})
