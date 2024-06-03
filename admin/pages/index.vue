<script lang="ts" setup>
import { ref as databaseRef } from "firebase/database";
import type { Location } from "~/models/clock-config";
const db = useDatabase();
const router = useRouter();
const user = useCurrentUser();
const allowedClocks = useDatabaseObject<{ key: string }>(
  user.value ? databaseRef(db, `auth/${user.value.uid}`) : null,
);
const locations = useDatabaseObject<{ [key: string]: Location }>(
  user.value ? databaseRef(db, `locations`) : null,
);

const allowedClocksKeys = ref<string[]>([]);

watch(
  allowedClocks,
  () =>
    (allowedClocksKeys.value = Object.entries(allowedClocks)
      .filter(([_, v]) => v)
      .map(([k, _]) => k)),
);

const setLocation = (value: string | number) => {
  router.push(`/control/${value}`);
};
const requestLocation = (value: string | number) => {
  console.log("value", value);
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
        <li v-for="(location, key) in locations" :key="key">
          <UButton
            @click="
              key in allowedClocks ? setLocation(key) : requestLocation(key)
            "
            :color="key in allowedClocks ? 'green' : 'red'"
          >
            {{ location.label }}
          </UButton>
        </li>
      </ul>
    </div>
  </main>
</template>
