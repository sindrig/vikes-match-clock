<script lang="ts" setup>
import { ref as databaseRef, push, update } from "firebase/database";
import type { UserState } from "~/models/user-data";

const db = useDatabase();

const user = useCurrentUser();
const allowedClocks = useDatabaseObject<{ key: string }>(
  user.value ? databaseRef(db, `auth/${user.value.uid}`) : null,
);
const state = useDatabaseObject<UserState>(
  user.value ? databaseRef(db, `user_data/${user.value!.uid}`) : null,
);

const stringSetter = (attr: string) => {
  return (value: string) => {
    const path = ["user_data", user.value!.uid, attr].join("/");
    update(databaseRef(db), { [path]: value });
  };
};

const setLocation = stringSetter("location");
</script>

<template>
  <main>
    <div v-if="!allowedClocks || Object.keys(allowedClocks).length === 0">
      There are no available locations for you. <br />
      Contact an admin and provide him with your user id: {{ user!.uid }}
    </div>
    <div v-else-if="!state?.location">
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
    state: {{ state }} <br />
    allowedClocks: {{ allowedClocks }} <br />
  </main>
</template>
