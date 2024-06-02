<script lang="ts" setup>
import { ref as databaseRef } from "firebase/database";

import type { PitchConfig, Screen } from "~/models/clock-config";
import { gateWayUrl } from "~/utils/api-config";
import type { MatchList, MatchListMatch } from "~/models/api-responses";

const emit = defineEmits<{
  (e: "update", value: MatchListMatch, newMatch: boolean): void;
}>();

const props = defineProps<{
  location: string;
}>();

const db = useDatabase();
const locationConfig = useDatabaseObject<PitchConfig>(
  databaseRef(db, `${props.location}`),
);
const screenConfig = useDatabaseObject<Screen>(
  databaseRef(db, `screens/${props.location}`),
);

watch(screenConfig, () => {
  console.log("screenConfig.value?.pitch", screenConfig.value?.pitch);
  execute();
});

const { data, error, execute } = useFetch<MatchList>(
  computed(
    () =>
      `${gateWayUrl}/match-report/v2?action=get-matches&location=${screenConfig.value?.pitch}`,
  ),
  {
    immediate: false,
  },
);
</script>

<template>
  <div
    v-if="
      locationConfig?.match &&
      locationConfig?.match.inProgress &&
      locationConfig.controller.view === 'match'
    "
  >
    <button @click="emit('update', locationConfig.match.inProgress, false)">
      Í gangi:{{ locationConfig?.match.homeTeam }} -
      {{ locationConfig?.match.awayTeam }}
    </button>
  </div>
  <div v-if="error">Error: {{ error }}</div>
  <div v-else-if="data">
    <div
      v-for="match in data.matches"
      :key="match.home.id + match.away.id + match.time"
    >
      <button @click="emit('update', match, true)">
        {{ match.time }}: {{ match.home.name }} - {{ match.away.name }}
      </button>
    </div>
  </div>
  <div v-else>Loading...</div>
</template>
