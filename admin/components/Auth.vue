<script lang="ts">
import { GoogleAuthProvider } from "firebase/auth";
export const googleAuthProvider = new GoogleAuthProvider();
</script>

<script lang="ts" setup>
import { signInWithPopup, signOut } from "firebase/auth";
import { ref as databaseRef } from "firebase/database";
import {
  useCurrentUser,
  useFirebaseAuth,
  useIsCurrentUserLoaded,
} from "vuefire";
import { update } from "firebase/database";
import type { ControllerConfig } from "~/models/clock-config";

definePageMeta({
  linkTitle: "Login",
  order: 2,
});

const auth = useFirebaseAuth()!; // only exists on client side
const user = useCurrentUser();
const isUserLoaded = useIsCurrentUserLoaded();
const db = useDatabase();

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
const logout = async () => {
  const location = useRoute().params.location as string;
  console.log("update");
  await update(
    databaseRef(db),
    transformPartialUpdates(location, {
      controller: <ControllerConfig>{ view: "idle" },
    }),
  );
  console.log("signout");
  await signOut(auth);
  // redirect to home page
  console.log("router");
  router.push("/");
};
</script>

<template>
  <main>
    <ClientOnly>
      <p v-if="!isUserLoaded">Loading</p>
    </ClientOnly>

    <ErrorBox v-if="error" :error="error" />

    <template v-if="user">
      <div>
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
