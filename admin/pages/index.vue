<script lang="ts" setup>
import { ref as databaseRef } from "firebase/database";

const db = useDatabase();
const router = useRouter();
const user = useCurrentUser();
const allowedClocks = useDatabaseObject<{ key: string }>(
  user.value ? databaseRef(db, `auth/${user.value.uid}`) : null,
);

const setLocation = (value: string) => {
  router.push(`/control/${value}`);
};
</script>

<template>
  <main>
    <div v-if="!allowedClocks || Object.keys(allowedClocks).length === 0">
      There are no available locations for you. <br />
      Contact an admin and provide him with your user id: {{ user!.uid }}
    </div>
    <div v-else>
      <h1>Which clock do you want to control?</h1>
      <ul>
        <li
          v-for="clock in Object.entries(allowedClocks)
            .filter(([_, v]) => v)
            .map(([k, _]) => k)"
          :key="clock"
        >
          <button @click="setLocation(clock)">
            {{ clock }}
          </button>
        </li>
      </ul>
    </div>
    allowedClocks: {{ allowedClocks }} <br />
  </main>
</template>
