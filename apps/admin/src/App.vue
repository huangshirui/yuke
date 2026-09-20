<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { adminDataMode } from './services/adminApi'
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">Yu</span>
        <div>
          <strong>Yu言在线</strong>
          <small>Admin Console</small>
        </div>
      </div>

      <nav class="primary-nav" aria-label="主导航">
        <RouterLink to="/spaces" class="nav-item">
          <span class="nav-icon">⌂</span><span>空间管理</span>
        </RouterLink>
        <RouterLink to="/bookings" class="nav-item">
          <span class="nav-icon">◫</span><span>预约管理</span>
        </RouterLink>
        <span class="nav-item nav-item--disabled"><span class="nav-icon">◎</span><span>用户管理</span><small>后续</small></span>
        <span class="nav-item nav-item--disabled"><span class="nav-icon">⌁</span><span>对账</span><small>后续</small></span>
      </nav>

      <div class="sidebar-footer">
        <span class="mode-dot" :class="{ 'mode-dot--api': adminDataMode === 'api' }"></span>
        <span>{{ adminDataMode === 'api' ? 'API 数据' : 'Mock 数据' }}</span>
      </div>
    </aside>

    <div class="main-frame">
      <header class="topbar">
        <div><span class="eyebrow">运营管理</span><strong>通用预约控制台</strong></div>
        <div class="admin-chip">
          <span class="avatar">A</span>
          <div><strong>管理员</strong><small>Cloudflare Access</small></div>
        </div>
      </header>
      <RouterView />
    </div>
  </div>
</template>
