import { onSchedule } from "firebase-functions/v2/scheduler";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

// Audit records are retained for 90 days from their server timestamp; anything
// older is removed by this scheduled trusted job. The client rules stay
// append-only, so operators can never treat retention as an early-delete
// mechanism.
export const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const AUDIT_CLEANUP_BATCH_SIZE = 100;
// A single run stays bounded even if a venue accumulates a very large expired
// backlog; leftover records are picked up by the next daily run.
export const AUDIT_CLEANUP_MAX_PAGES_PER_LOCATION = 500;

async function deleteExpiredForLocation(
  location: string,
  cutoff: number,
): Promise<number> {
  let deleted = 0;
  for (let page = 0; page < AUDIT_CLEANUP_MAX_PAGES_PER_LOCATION; page++) {
    const query = db
      .ref(`audit/${location}`)
      .orderByChild("timestamp")
      .endAt(cutoff)
      .limitToFirst(AUDIT_CLEANUP_BATCH_SIZE);
    const snapshot = await query.once("value");
    const events = snapshot.val();
    if (!events || typeof events !== "object") break;

    const updates: Record<string, null> = {};
    for (const [id, event] of Object.entries(
      events as Record<string, unknown>,
    )) {
      // Delete only records strictly older than 90 days; an event exactly at
      // the boundary is retained ("90 days old or newer" is never removed).
      if (event && typeof event === "object") {
        const timestamp = (event as Record<string, unknown>).timestamp;
        if (typeof timestamp === "number" && timestamp < cutoff) {
          updates[`audit/${location}/${id}`] = null;
        }
      }
    }
    // A page that only holds boundary/retained records means no further
    // candidates exist; stop to avoid re-scanning the same page.
    if (Object.keys(updates).length === 0) break;

    await db.ref().update(updates);
    deleted += Object.keys(updates).length;
  }
  return deleted;
}

// Deletes every audit event older than `cutoff` across all venues. Deleting an
// already-removed record is harmless, so retries after a partial failure are
// safe.
export async function cleanupExpiredAuditEvents(cutoff: number): Promise<number> {
  const locationsSnap = await db.ref("audit").once("value");
  const locations = locationsSnap.val();
  if (!locations || typeof locations !== "object") return 0;

  let totalDeleted = 0;
  for (const location of Object.keys(locations)) {
    const deleted = await deleteExpiredForLocation(location, cutoff);
    totalDeleted += deleted;
  }
  return totalDeleted;
}

export const cleanupAuditLog = onSchedule("every 24 hours", async () => {
  const cutoff = Date.now() - AUDIT_RETENTION_MS;
  const deleted = await cleanupExpiredAuditEvents(cutoff);
  functions.logger.info("Audit log cleanup completed", { cutoff, deleted });
});
