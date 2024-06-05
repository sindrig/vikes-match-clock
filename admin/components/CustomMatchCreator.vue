<script lang="ts" setup>
import type {
  MatchListMatch,
  MatchListMatchTeam,
} from "~/models/api-responses";
import type { FormError, FormSubmitEvent } from "#ui/types";

const emit = defineEmits<{
  (e: "update", value: MatchListMatch): void;
}>();

const showForm = ref<boolean>(false);

const state = reactive<{
  home: MatchListMatchTeam | undefined;
  away: MatchListMatchTeam | undefined;
}>({
  home: undefined,
  away: undefined,
});

const validate = (state: any): FormError[] => {
  const errors = [];
  if (!state.home) errors.push({ path: "home", message: "Required" });
  if (!state.away) errors.push({ path: "away", message: "Required" });
  return errors;
};

async function onSubmit(
  event: FormSubmitEvent<{
    home: MatchListMatchTeam;
    away: MatchListMatchTeam;
  }>,
) {
  const dateIso = new Date().toISOString().split("T");
  const date = dateIso[0];
  const time = dateIso[1].split(".")[0];
  emit("update", {
    ...event.data,
    date,
    time,
    match_id: "custom",
    competition: "",
  });
}
</script>

<template>
  <div v-if="showForm">
    <UForm
      :validate="validate"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormGroup label="Home team" name="home">
        <TeamSelector v-model="state.home" />
      </UFormGroup>
      <UFormGroup label="Away team" name="away">
        <TeamSelector v-model="state.away" />
      </UFormGroup>

      <UButton type="submit"> Start custom match </UButton>
    </UForm>
  </div>
  <UButton color="red" v-else @click="showForm = true">
    <slot></slot>
  </UButton>
</template>
