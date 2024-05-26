<script setup>
const user = useCurrentUser();
</script>

<template>
  <Auth />
  <NuxtPage v-if="user" />
</template>
