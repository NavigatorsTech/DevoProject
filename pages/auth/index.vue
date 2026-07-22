<template>
  <div>
    <v-form ref="lazyForm">
      <v-card width="400" class="mx-auto mt-5">
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
        <v-card-actions>
          <v-btn color="success" variant="elevated" @click="register">Register</v-btn>
          <v-spacer />
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
      <v-btn variant="text" @click="snack = false">Close</v-btn>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { sendPasswordResetEmail, type Auth } from 'firebase/auth'

const userStore = useUserStore()

const lazyForm = ref()
const showPassword = ref(false)
const email = ref('')
const password = ref('')
const snack = ref(false)
const snackColor = ref('')
const snackText = ref('')

const emailRules = [
  (v: string) => !!v || 'Please enter an email address', // !! converts to boolean
  (v: string) => /.+@.+\..+/.test(v) || 'E-mail must be valid'
]

function login() {
  userStore.authenticateUser({ isLogin: true, id: email.value, pwd: password.value })
}

function register() {
  userStore.authenticateUser({ isLogin: false, id: email.value, pwd: password.value })
}

function loginWithGoogle() {
  userStore.authenticateWithGoogle()
}

async function passwordReset() {
  try {
    const auth = useNuxtApp().$firebaseAuth as Auth
    await sendPasswordResetEmail(auth, email.value, { url: 'https://qt.navigators.tech' })
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
    if (isAuthenticated) {
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
