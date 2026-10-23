<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="notfound card">
    <p class="notfound__code">404</p>
    <h1 class="page__title">页面不存在</h1>
    <p class="muted">你访问的地址不存在或已被移动。</p>
    <RouterLink class="btn btn--primary" to="/">返回角色首页</RouterLink>
  </div>
</template>
