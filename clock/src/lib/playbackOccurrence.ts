// IDs belong to selections, never reusable media or subscription deliveries.
export function isPlaybackOccurrenceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

// Legacy means truly absent. Malformed present fields never become legacy.
export function matchesPlaybackOccurrence(
  rawAsset: unknown,
  observedId: string | null,
): boolean {
  if (!rawAsset || typeof rawAsset !== "object" || Array.isArray(rawAsset)) {
    return false;
  }
  const raw = rawAsset as Record<string, unknown>;
  if (observedId === null) {
    return !Object.prototype.hasOwnProperty.call(raw, "occurrenceId");
  }
  return isPlaybackOccurrenceId(observedId) && raw.occurrenceId === observedId;
}
