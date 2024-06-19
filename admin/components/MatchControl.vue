<script lang="ts" setup>
import { ref as databaseRef } from "firebase/database";

import type {
  PitchConfig,
  MatchConfig,
  NumericMatchConfigAttrs,
} from "~/models/clock-config";
import type { MatchListMatch } from "~/models/api-responses";
import { update } from "firebase/database";

const emit = defineEmits<{
  (e: "update", value: MatchListMatch): void;
}>();

const props = defineProps<{
  location: string;
}>();
const root = `states/${props.location}`;

const db = useDatabase();
const locationConfig = useDatabaseObject<PitchConfig>(databaseRef(db, root));
const updateMatch = (match: Partial<MatchConfig>) => {
  update(
    databaseRef(db),
    transformPartialUpdates(root, {
      match,
    }),
  );
};
const updateNumber = (attr: keyof NumericMatchConfigAttrs, value: number) => {
  if (locationConfig.value) {
    updateMatch({ [attr]: (locationConfig.value.match[attr] || 0) + value });
  }
};
</script>

<template>
  <div v-if="locationConfig">
    <button @click="updateNumber('homeScore', 1)">+1 home</button>
    <button @click="updateNumber('homeScore', -1)">-1 home</button>
    <button @click="updateNumber('awayScore', 1)">+1 away</button>
    <button @click="updateNumber('awayScore', -1)">-1 away</button>
    <button @click="updateMatch({ started: Date.now() })">begin match</button>
    <button
      @click="
        updateMatch({
          started: 0,
          timeElapsed:
            (locationConfig.match.timeElapsed || 0) +
            Math.floor(Date.now() - locationConfig.match.started),
        })
      "
    >
      pause match
    </button>
  </div>
</template>

<style scoped>
button {
  display: block;
  clear: both;
}
</style>
