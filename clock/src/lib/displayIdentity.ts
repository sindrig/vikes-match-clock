const LABEL_KEY = "clock_displayLabel";
const LABEL_PREFIX = "Skjár";

// Returns a stable, human-readable label for this display browser profile,
// creating and persisting one on first use. The label survives reloads and
// browser restarts (unlike the per-connection push key) so the admin can tell
// multiple physical screens at the same venue apart in the Skjáarvillur list.
export function getOrCreateDisplayLabel(): string {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(LABEL_KEY);
  if (existing) return existing;

  const suffix = crypto.randomUUID().slice(0, 4).toUpperCase();
  const label = `${LABEL_PREFIX} ${suffix}`;
  window.localStorage.setItem(LABEL_KEY, label);
  return label;
}

// Returns the physical screen size reported by the browser (e.g. "1920x1080")
// so the admin can match a report row to the screen it describes. Empty when
// the information is unavailable.
export function getDisplayResolution(): string {
  if (typeof window === "undefined" || !window.screen) return "";
  const { width, height } = window.screen;
  if (!width || !height) return "";
  return `${width}x${height}`;
}
