<script lang="ts" setup>
import type { MatchListMatch } from "~/models/api-responses";
import type { MatchConfig, ControllerConfig } from "~/models/clock-config";
import { transformPartialUpdates } from "~/utils/database";
import { ref as databaseRef, update } from "firebase/database";

const db = useDatabase();

const match = ref<MatchListMatch | null>(null);
const location = useRoute().params.location as string;

const selectMatch = async (m: MatchListMatch, newMatch: boolean) => {
  match.value = m;
  const matchConfig: Partial<MatchConfig> = {
    inProgress: m,
    homeTeam: m.home.name,
    homeTeamId: m.home.id,
    awayTeam: m.away.name,
    awayTeamId: m.away.id,
  };
  if (newMatch) {
    matchConfig.started = 0;
    matchConfig.timeElapsed = 0;
    matchConfig.homeScore = 0;
    matchConfig.awayScore = 0;
  }
  const controllerConfig: ControllerConfig = {
    view: "match",
    selectedMatch: m.match_id,
  };
  await update(
    databaseRef(db, "states"),
    transformPartialUpdates(location, {
      match: matchConfig,
      controller: controllerConfig,
    }),
  );
};
</script>

<template>
  <main>
    <MatchSelector v-if="!match" @update="selectMatch" :location="location" />
    <MatchControl v-else :location="location" />
    {{ match }}
  </main>
</template>
