<script lang="ts" setup>
import { ref as databaseRef } from "firebase/database";

import type { PitchConfig } from "~/models/pitch-config";
import { gateWayUrl } from "~/utils/api-config";
import type { MatchList, MatchListMatch } from "~/models/api-responses";

const db = useDatabase();
const location = useRoute().params.location;
const user = useCurrentUser();
const router = useRouter();
const locationConfig = useDatabaseObject<PitchConfig>(
  user.value ? databaseRef(db, `${location}`) : null,
);

const url = computed(
  () => `${gateWayUrl}/match-list?location=${locationConfig.value?.pitch}`,
);

const { data, error } = useFetch<MatchList>(url, {
  immediate: false,
});

const selectedMatch = ref<MatchListMatch | null>(null);

const selectMatch = async (match: MatchListMatch) => {
  selectedMatch.value = match;
};

watch(selectedMatch, async () => {
  if (selectedMatch.value) {
    if (selectedMatch.value.matchId) {
      router.push(
        `/control/${location}/${selectedMatch.value.home.name}/${selectedMatch.value.away.name}/${selectedMatch.value.matchId}`,
      );
    } else if (locationConfig.value) {
      router.push(
        `/control/${location}/${selectedMatch.value.home.name}/${selectedMatch.value.away.name}`,
      );
    }
  }
});
</script>

<template>
  <main>
    {{ locationConfig?.match.homeTeam }} - {{ locationConfig?.match.awayTeam }}
    <br />
    <div v-if="locationConfig">pitch id: {{ locationConfig.pitch }} <br /></div>
    <div v-if="error">Error: {{ error }}</div>
    <div v-else-if="data">
      <div
        v-for="match in data.matches"
        :key="match.home.id + match.away.id + match.time"
      >
        <button @click="selectMatch(match)">
          {{ match.time }}: {{ match.home.name }} - {{ match.away.name }}
        </button>
      </div>
    </div>
    <div v-else>Loading...</div>
  </main>
</template>
