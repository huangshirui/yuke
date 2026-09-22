<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getAdminApi } from '../services/adminApi'
import { resolveRememberedSpace, rememberSpace, spacePath } from '../services/adminShell'

const router = useRouter()
const error = ref('')

onMounted(async () => {
  try {
    const spaces = await getAdminApi().listSpaces()
    const target = resolveRememberedSpace(spaces)
    if (!target) {
      await router.replace('/spaces')
      return
    }
    rememberSpace(target.id)
    await router.replace(spacePath(target.id))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法进入管理后台。'
  }
})
</script>

<template>
  <main class="page">
    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-else class="empty-state">正在进入最近使用的服务方…</div>
  </main>
</template>
