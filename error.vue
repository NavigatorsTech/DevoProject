<template>
  <v-app>
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="10">
          <v-card border>
            <v-list-item>
              <v-list-item-title class="text-h5 mb-1 text-wrap">
                Your Personal QT and Journaling App
              </v-list-item-title>
              <v-list-item-subtitle v-if="error?.statusCode === 404" class="text-high-emphasis text-wrap" style="opacity: 1">
                {{ pageNotFound }}
                <br />You will have to log in to view this page
              </v-list-item-subtitle>
              <v-list-item-subtitle v-else class="text-high-emphasis text-wrap" style="opacity: 1">
                {{ otherError }}
                <br />You will have to log in to view this page
              </v-list-item-subtitle>
            </v-list-item>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
    <div class="d-flex justify-center ga-2">
      <v-btn color="primary" variant="elevated" @click="proceedToLogin">Proceed to log in</v-btn>
      <v-btn color="primary" variant="outlined" @click="goHome">Go to homepage</v-btn>
    </div>
  </v-app>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{
  error: NuxtError
}>()

const pageNotFound = '404 Not Found'
const otherError = 'An error occurred'

useHead(() => ({
  title: props.error?.statusCode === 404 ? pageNotFound : otherError
}))

function proceedToLogin() {
  clearError({ redirect: '/auth' })
}

function goHome() {
  clearError({ redirect: '/' })
}
</script>
