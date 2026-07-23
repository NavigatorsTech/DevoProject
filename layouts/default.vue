<template>
  <v-app>
    <v-navigation-drawer v-model="drawer" temporary location="right">
      <v-list>
        <v-list-item
          v-for="(item, i) in items"
          :key="i"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="item.title"
          exact
        />
        <v-list-item
          v-if="!userStore.isAuthenticated"
          to="/auth"
          prepend-icon="mdi-account-circle"
          title="Login"
          exact
        />
        <v-list-item
          v-if="userStore.isAuthenticated"
          to="/"
          prepend-icon="mdi-exit-to-app"
          title="Logout"
          exact
          @click="logout"
        />
      </v-list>
    </v-navigation-drawer>
    <v-app-bar color="indigo">
      <v-toolbar-title>{{ title }}</v-toolbar-title>
      <v-spacer />
      <v-app-bar-nav-icon @click.stop="drawer = !drawer" />
    </v-app-bar>
    <v-main>
      <v-container>
        <NuxtPage />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
// Theme is dark-mode-only via nuxt.config.ts's defaultTheme, so the Nuxt 2
// version's side-effecting `setTheme` computed (which forced dark mode as a
// read side effect) is no longer needed at all.
const userStore = useUserStore()

const drawer = ref(false)
const title = 'QT App'
const items = [
  { icon: 'mdi-home', title: 'QT App', to: '/' },
  { icon: 'mdi-pencil', title: 'Journal', to: '/journalList' },
  { icon: 'mdi-clipboard-text', title: 'Plans', to: '/plansList' }
]

function logout() {
  userStore.logout()
}
</script>
