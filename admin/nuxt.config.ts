// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  devServer: {
    port: 3001,
  },
  devtools: { enabled: true },
  // modules: ["@nuxt/ui"],
  modules: ["@nuxt/ui", "nuxt-vuefire"],
  // ssr: true,
  vuefire: {
    auth: {
      enabled: true,
    },
    config:
      process.env.NODE_ENV === "production"
        ? {
            apiKey: "AIzaSyDhdG6cVA2xTfHhceCUA6N4I1EgdDIL1oA",
            authDomain: "vikes-match-clock-firebase.firebaseapp.com",
            databaseURL: "https://vikes-match-clock-firebase.firebaseio.com",
            projectId: "vikes-match-clock-firebase",
            storageBucket: "vikes-match-clock-firebase.appspot.com",
            messagingSenderId: "861256792475",
            appId: "1:861256792475:web:7968ebb26dc716ac5c093e",
          }
        : {
            apiKey: "AIzaSyCX-4CXktMfJL47nrrpc1y8Q73j09ItmQI",
            authDomain: "vikes-match-clock-staging.firebaseapp.com",
            databaseURL: "https://vikes-match-clock-staging.firebaseio.com",
            projectId: "vikes-match-clock-staging",
            storageBucket: "vikes-match-clock-staging.appspot.com",
            messagingSenderId: "367337313960",
            appId: "1:367337313960:web:2b552eb5378c7a4590d49d",
          },
  },
});
