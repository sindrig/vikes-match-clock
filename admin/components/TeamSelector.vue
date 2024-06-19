<script lang="ts" setup>
import type { MatchListMatchTeam } from "~/models/api-responses";
import { clubIds } from "~/data/club-ids";

const team = defineModel<MatchListMatchTeam>();
</script>

<template>
  <USelectMenu
    v-model="team"
    :options="clubIds"
    option-attribute="name"
    searchable
    searchable-placeholder="Search available teams..."
  />
</template>
