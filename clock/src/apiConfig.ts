const isStaging =
  typeof window !== "undefined" &&
  window.location.hostname === "staging-klukka.irdn.is";

export default {
  gateWayUrl: isStaging
    ? "https://clock-api-staging.irdn.is/"
    : "https://clock-api.irdn.is/",
};
