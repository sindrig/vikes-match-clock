const SESSION_STORAGE_KEY = "clock_sessionId";

// Returns the opaque browser-session ID stored in sessionStorage, creating and
// persisting one on first use. The ID survives reloads and restored tabs within
// a browser session but is regenerated when a new session starts. It is never
// an identity substitute; Firebase Auth's UID remains the accountable operator.
export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";

  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  return id;
}
