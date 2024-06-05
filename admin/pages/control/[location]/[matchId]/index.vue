<script lang="ts" setup>
const db = useDatabase();

const { location } = useRoute().params;
</script>

<template>
  <main>
    <MatchControl :location="location as string" />
  </main>
</template>
