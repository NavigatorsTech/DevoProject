<template>
  <div>
    <v-container>
      <v-row justify="center">
        <v-col cols="12" md="10">
          <v-card border max-width="400" class="mx-auto">
            <v-card-title class="text-h5">Check your email</v-card-title>
            <v-card-text>
              We've sent a verification link to <strong>{{ email }}</strong>.
              Click the link, then come back here and continue.
            </v-card-text>
            <v-card-actions class="d-flex flex-column ga-2">
              <v-btn block variant="outlined" :loading="resending" @click="resend">Resend email</v-btn>
              <v-btn block color="primary" variant="elevated" :loading="continuing" @click="continueToApp">
                I've verified - continue
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
    <v-snackbar v-model="snack" :timeout="4000" :color="snackColor">
      {{ snackText }}
      <template v-slot:actions>
        <v-btn variant="text" @click="snack = false">Close</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { sendEmailVerification } from 'firebase/auth'

// Rehydration only, matching pages/index.vue's pattern - deliberately no
// login-check, since someone who just registered but hasn't verified yet is
// still `isAuthenticated` and must be able to reach this page.
definePageMeta({ middleware: ['check-auth'] })

const userStore = useUserStore()

const email = ref('')
const resending = ref(false)
const continuing = ref(false)
const snack = ref(false)
const snackColor = ref('')
const snackText = ref('')

function firebaseUser() {
  return useNuxtApp().$firebaseAuth.currentUser
}

onMounted(async () => {
  const user = firebaseUser()
  if (!user) {
    navigateTo('/auth')
    return
  }
  email.value = user.email ?? ''

  // Covers landing here fresh (e.g. via a bookmark, or after clicking the
  // email's own "continue" link in a new tab) with an already-verified
  // account - skip straight through rather than making them click twice.
  await user.reload()
  if (user.emailVerified) {
    await continueToApp()
  }
})

async function resend() {
  const user = firebaseUser()
  if (!user) return
  resending.value = true
  try {
    await sendEmailVerification(user)
    snack.value = true
    snackColor.value = 'success'
    snackText.value = 'Verification email sent again.'
  } catch (e) {
    console.error(e)
    snack.value = true
    snackColor.value = 'error'
    snackText.value = "Couldn't resend the email - please try again shortly."
  } finally {
    resending.value = false
  }
}

async function continueToApp() {
  continuing.value = true
  try {
    const done = await userStore.completeVerification()
    if (done) {
      navigateTo('/')
      return
    }
    snack.value = true
    snackColor.value = 'error'
    snackText.value = 'Still not verified - check your inbox (and spam folder), or resend the email.'
  } catch (e) {
    console.error(e)
    snack.value = true
    snackColor.value = 'error'
    snackText.value = "Couldn't finish setting up your account - please try again shortly."
  } finally {
    continuing.value = false
  }
}
</script>
