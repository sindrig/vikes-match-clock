<script lang="ts" setup>
import type { MatchIdsResponse, MatchIdsMatch } from "~/models/api-responses";
const router = useRouter();
const user = useCurrentUser();

const params = useRoute().params;

const { data, error } = useFetch<MatchIdsResponse>(
  `${gateWayUrl}/match-report?homeTeam=${params.home}&awayTeam=${params.away}&pitchId=${params.location}`,
);

watch(data, async () => {
  if (data.value?.matches) {
    if (data.value.matches.length === 1) {
      selectMatch(data.value.matches[0]);
    }
  }
});

const selectMatch = (match: MatchIdsMatch) => {
  router.push(
    `/control/${params.location}/${params.home}/${params.away}/${match.id}`,
  );
};
</script>

<template>
  <main>
    <div v-if="error">Error: {{ error }}</div>
    <div v-for="match in data?.matches" :key="match.id">
      <button @click="selectMatch(match)">
        {{ params.home }} - {{ params.away }} ({{ match.group }}) @
        {{ match.starts }}
      </button>
    </div>
  </main>
</template>
