<template>
  <div>
    <v-form ref="lazyForm">
      <v-card max-width="400" class="mx-auto mt-5">
        <v-card-title>
          <h1 class="text-h4">Login</h1>
        </v-card-title>
        <v-card-text>
          <v-text-field
            v-model="email"
            :rules="emailRules"
            label="Email"
            prepend-icon="mdi-account-circle"
            required
          />
          <v-text-field
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            label="Password"
            prepend-icon="mdi-lock"
            :append-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
            @click:append="showPassword = !showPassword"
            @keyup.enter="login"
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="flex-wrap justify-space-between">
          <v-btn color="success" variant="elevated" @click="register">Register</v-btn>
          <v-btn color="info" variant="elevated" @click="login">Login</v-btn>
        </v-card-actions>
        <v-divider />
        <v-card-actions>
          <v-btn block variant="outlined" @click="loginWithGoogle">
            <v-icon class="mr-2">mdi-google</v-icon>
            Sign in with Google
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-form>
    <div class="d-flex justify-center mt-4">
      <span class="text-primary" style="cursor: pointer" @click="validate()">Forgot Password?</span>
    </div>
    <v-snackbar v-model="snack" :timeout="4000" :color="snackColor">
      {{ snackText }}
      <template v-slot:actions>
        <v-btn variant="text" @click="snack = false">Close</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { sendPasswordResetEmail, type Auth } from 'firebase/auth'
import { authContinueUrl } from '~/stores/user'

const userStore = useUserStore()

const lazyForm = ref()
const showPassword = ref(false)
const email = ref('')
const password = ref('')
const snack = ref(false)
const snackColor = ref('')
const snackText = ref('')
// Set right before a register attempt so the isAuthenticated watcher below
// knows to send them to the "check your email" page instead of home - login
// (and Google sign-in, which never sets this) still goes straight to '/'.
const justRegistered = ref(false)

const emailRules = [
  (v: string) => !!v || 'Please enter an email address', // !! converts to boolean
  (v: string) => /.+@.+\..+/.test(v) || 'E-mail must be valid'
]

function login() {
  userStore.authenticateUser({ isLogin: true, id: email.value, pwd: password.value })
}

async function register() {
  justRegistered.value = true
  await userStore.authenticateUser({ isLogin: false, id: email.value, pwd: password.value })
  if (userStore.errorOccured) {
    // sendEmailVerification or the follow-up /api/users/register call failed
    // (Firebase account creation itself may still have succeeded) - reset so
    // the isAuthenticated watcher below falls back to its normal '/' behavior
    // rather than sending them to a "check your email" page when no email
    // was actually sent. The error snackbar (watched separately) shows why.
    justRegistered.value = false
    return
  }
  navigateTo('/auth/verify-email')
}

function loginWithGoogle() {
  userStore.authenticateWithGoogle()
}

async function passwordReset() {
  try {
    const auth = useNuxtApp().$firebaseAuth as Auth
    await sendPasswordResetEmail(auth, email.value, { url: authContinueUrl() })
    snack.value = true
    snackColor.value = 'success'
    snackText.value = 'Password Reset Email Sent!'
  } catch (e) {
    // When firebase returns an error looking up email in the database
    console.error(e)
    snack.value = true
    snackColor.value = 'error'
    snackText.value = 'Error, Email Not Found!'
  }
}

async function validate() {
  const { valid } = await lazyForm.value.validate()
  if (valid) {
    passwordReset()
  }
}

watch(
  () => userStore.isAuthenticated,
  (isAuthenticated) => {
    // Deliberately skips entirely while justRegistered is true, rather than
    // branching on it to decide the destination: isAuthenticated can flip
    // true (via onIdTokenChanged, as soon as Firebase's SDK notices the new
    // account) well before register()'s own await chain finishes, or fails,
    // below - register() alone owns navigation for that case once it knows
    // the real outcome, so this watcher must not race it.
    if (isAuthenticated && !justRegistered.value) {
      navigateTo('/')
    }
  }
)

watch(
  () => userStore.errorOccured,
  (errorOccured) => {
    if (errorOccured) {
      snack.value = true
      snackColor.value = 'error'
      snackText.value = userStore.getErrorMessage
      userStore.clearError()
    }
  }
)
</script>
