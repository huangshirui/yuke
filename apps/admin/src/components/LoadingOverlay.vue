<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), {
  label: '正在加载…',
})
</script>

<template>
  <div class="loading-overlay" role="status" aria-live="polite">
    <span class="loading-spinner" aria-hidden="true"></span>
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.loading-overlay{
  position:absolute;
  inset:0;
  z-index:6;
  display:flex;
  align-items:flex-start;
  justify-content:center;
  gap:var(--space-8);
  padding-top:var(--space-20);
  background:var(--color-loading-mask);
  color:var(--color-text-secondary);
  font-size:var(--font-size-13);
  font-weight:650;
  cursor:progress;
  border-radius:inherit;
}
.loading-spinner{
  width:var(--loading-spinner-size);
  height:var(--loading-spinner-size);
  border:var(--loading-spinner-stroke) solid var(--color-border);
  border-top-color:var(--color-primary);
  border-radius:50%;
  animation:admin-loading-spin .72s linear infinite;
}
@keyframes admin-loading-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.loading-spinner{animation:none;border-top-color:var(--color-primary)}}
</style>
