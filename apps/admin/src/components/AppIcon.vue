<script setup lang="ts">
defineProps<{ name: string }>()
</script>

<template>
  <svg class="app-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <template v-if="name === 'overview'">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6" />
    </template>
    <template v-else-if="name === 'bookings'">
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16M8 14h3" />
    </template>
    <template v-else-if="name === 'schedule'">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </template>
    <template v-else-if="name === 'users'">
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19c.7-3.2 2.6-5 5.5-5s4.8 1.8 5.5 5M15 7.2a3 3 0 0 1 0 5.6M16 14.2c2.4.4 3.9 2 4.5 4.8" />
    </template>
    <template v-else-if="name === 'resource'">
      <path d="m12 3 7 4-7 4-7-4 7-4Z" />
      <path d="m5 7 7 4 7-4v10l-7 4-7-4V7Z" />
      <path d="M12 11v10" />
    </template>
    <template v-else-if="name === 'tag'">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H13l7 7-9 9-7-7V5.5Z" />
      <circle cx="8.5" cy="8.5" r="1.2" />
    </template>
    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7.4 7.4 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11a7.4 7.4 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" />
    </template>
    <template v-else-if="name === 'admin'">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20c.6-4.3 2.8-6.5 6.5-6.5s5.9 2.2 6.5 6.5" />
    </template>
    <template v-else-if="name === 'reconciliation'">
      <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4" />
    </template>
    <template v-else-if="name === 'chevron'">
      <path d="m9 6 6 6-6 6" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14M5 12h14" />
    </template>
    <template v-else-if="name === 'external'">
      <path d="M14 4h6v6M20 4l-9 9M18 13v6H5V6h6" />
    </template>
  </svg>
</template>
