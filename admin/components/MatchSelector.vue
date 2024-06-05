<script lang="ts" setup>
import { ref as databaseRef } from "firebase/database";

import type { Location, PitchConfig } from "~/models/clock-config";
import { gateWayUrl } from "~/utils/api-config";
import type { MatchList, MatchListMatch } from "~/models/api-responses";

const emit = defineEmits<{
  (e: "update", value: MatchListMatch, newMatch: boolean): void;
}>();

const props = defineProps<{
  location: string;
  debugDate?: string;
}>();

const db = useDatabase();

const stateConfig = useDatabaseObject<PitchConfig>(
  databaseRef(db, `states/${props.location}`),
);
const locationConfig = useDatabaseObject<Location>(
  databaseRef(db, `locations/${props.location}`),
);

onMounted(() => {
  if (locationConfig.value?.pitchIds) {
    execute();
  }
});

const { data, error, execute } = useFetch<MatchList>(
  computed(
    () =>
      `${gateWayUrl}/match-report/v2?action=get-matches&${locationConfig.value?.pitchIds
        .map((v) => `location=${v}`)
        .join("&")}${props.debugDate ? `&date=${props.debugDate}` : ""}`,
  ),
  {
    immediate: false,
  },
);
</script>

<template>
  <div
    v-if="
      stateConfig?.match &&
      stateConfig?.match.inProgress &&
      stateConfig.controller.view === 'match'
    "
  >
    <UButton
      color="orange"
      @click="emit('update', stateConfig.match.inProgress, false)"
    >
      Í gangi:{{ stateConfig?.match.homeTeam }} -
      {{ stateConfig?.match.awayTeam }}
    </UButton>
  </div>
  <div v-if="error">Error: {{ error }}</div>
  <div v-else-if="data">
    <div
      v-for="match in data.matches"
      :key="match.home.id + match.away.id + match.time"
    >
      <UButton @click="emit('update', match, true)">
        {{ match.time }}: {{ match.home.name }} - {{ match.away.name }} ({{
          match.competition
        }})
      </UButton>
    </div>
  </div>
  <div v-else>Loading...</div>
  <CustomMatchCreator @update="(match) => emit('update', match, true)">
    Custom match
  </CustomMatchCreator>
</template>
