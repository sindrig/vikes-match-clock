<script lang="ts">
import { GoogleAuthProvider } from "firebase/auth";
export const googleAuthProvider = new GoogleAuthProvider();
</script>

<script lang="ts" setup>
import { signInWithPopup, signOut } from "firebase/auth";
import {
  useCurrentUser,
  useFirebaseAuth,
  useIsCurrentUserLoaded,
} from "vuefire";

definePageMeta({
  linkTitle: "Login",
  order: 2,
});

const auth = useFirebaseAuth()!; // only exists on client side
const user = useCurrentUser();
const isUserLoaded = useIsCurrentUserLoaded();

// display errors if any
const error = ref<Error | null>(null);

function signinPopup() {
  error.value = null;
  signInWithPopup(auth, googleAuthProvider).catch((reason) => {
    console.error("Failed signinPopup", reason);
    error.value = reason;
  });
}
const router = useRouter();
const logout = () => {
  // remove user from local storage
  // localStorage.removeItem("user");
  signOut(auth);
  // redirect to login page
  router.push("/login");
};
</script>

<template>
  <main>
    <h2>Login</h2>

    <ClientOnly>
      <p v-if="!isUserLoaded">Loading</p>
    </ClientOnly>

    <ErrorBox v-if="error" :error="error" />

    <template v-if="user">
      <div>
        You are currently logged in as:
        <br />
        <img
          class="avatar"
          v-if="user.photoURL"
          :src="user.photoURL"
          referrerpolicy="no-referrer"
        />
        <br />
        <strong>{{ user.displayName }}</strong>
      </div>
      <button @click="logout">Log out and reset data</button>
    </template>

    <template v-else>
      <button @click="signinPopup()">SignIn with Google</button>
    </template>
  </main>
</template>

<style scoped>
.avatar {
  padding: 1em 0;
}

main > button {
  margin: 1em 0;
}
</style>
