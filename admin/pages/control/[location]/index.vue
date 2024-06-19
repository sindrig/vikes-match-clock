<script lang="ts" setup>
import type { MatchListMatch } from "~/models/api-responses";
import type { MatchConfig, ControllerConfig } from "~/models/clock-config";
import type { MatchReport } from "~/models/api-responses";
import { transformPartialUpdates } from "~/utils/database";
import defaultHalfStops, { groupStops } from "~/data/halfStops";
import { ref as databaseRef, update } from "firebase/database";

const db = useDatabase();
const router = useRouter();

const match = ref<MatchListMatch | null>(null);
const resetMatch = ref<boolean>(false);
const route = useRoute();
const location = route.params.location as string;

const { data, error, execute, pending } = useFetch<MatchReport>(
  computed(
    () =>
      `${gateWayUrl}/match-report/v2?action=get-report&matchId=${match.value?.match_id}`,
  ),
  {
    immediate: false,
  },
);
const selectMatch = async (m: MatchListMatch, newMatch: boolean) => {
  match.value = m;
  resetMatch.value = newMatch;
  if (m.match_id !== "custom") {
    await execute();
  }
};

watch([match, data], async () => {
  const m = match.value;
  if (m && (data.value || m.match_id === "custom")) {
    const matchConfig: Partial<MatchConfig> = {
      inProgress: m,
      homeTeam: m.home.name,
      homeTeamId: m.home.id,
      awayTeam: m.away.name,
      awayTeamId: m.away.id,
      halfStops: defaultHalfStops,
    };
    const group = parseInt(m.competition.slice(0, 1), 10);
    if (group && !isNaN(group) && groupStops[group]) {
      matchConfig.halfStops = groupStops[group];
    }
    if (resetMatch.value) {
      matchConfig.started = 0;
      matchConfig.timeElapsed = 0;
      matchConfig.homeScore = 0;
      matchConfig.awayScore = 0;
    }
    const controllerConfig: ControllerConfig = {
      view: "match",
      selectedMatch: m.match_id !== "custom" ? m.match_id : null,
      currentAsset: 0,
    };
    if (data.value) {
      controllerConfig.availableMatches = { [m.match_id]: data.value };
    }
    if (!error.value) {
      await update(
        databaseRef(db, "states"),
        transformPartialUpdates(location, {
          match: matchConfig,
          controller: controllerConfig,
        }),
      );
      router.push(`/control/${location}/${m.match_id}`);
    }
  }
});
</script>

<template>
  <main>
    <UAlert
      v-if="error"
      icon="i-heroicons-command-line"
      color="red"
      variant="solid"
      title="Error fetching match report!"
      :description="error.message"
    />
    <UAlert v-if="match && pending" title="Loading match report.." />
    <MatchSelector
      v-else
      @update="selectMatch"
      :location="location"
      :debug-date="route.query.date as string"
    />
  </main>
</template>
