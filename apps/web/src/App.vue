<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import { sessionState } from './stores/session'
</script>

<template>
  <div class="app-shell">
    <AppHeader v-if="sessionState.account" />
    <main class="app-main" :class="{ 'app-main--guest': !sessionState.account }">
      <RouterView />
    </main>
  </div>
</template>
