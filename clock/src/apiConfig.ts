const isDev =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

const isStaging =
  typeof window !== "undefined" &&
  window.location.hostname === "staging-klukka.irdn.is";

function getGatewayUrl(): string {
  if (isDev) return "http://localhost:8000/";
  if (isStaging) return "https://clock-api-staging.irdn.is/";
  return "https://clock-api.irdn.is/";
}

export default {
  gateWayUrl: getGatewayUrl(),
};
