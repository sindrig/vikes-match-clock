import { ref, update, serverTimestamp } from "firebase/database";
import { database } from "./firebase";
import type { AuditStateArea } from "./types";

// Identity and logical action carried by an audited state mutation.
export interface AuditEventPayload {
  uid: string;
  sessionId: string;
  action: string;
  stateArea: AuditStateArea;
}

// Commits a state mutation and its audit record as one atomic root-level
// update: either both land or neither does. `diff` is the exact update-path
// map (relative to states/{listenPrefix}/{stateArea}) that becomes the audit
// event's `changes` field. The event key is generated here so a retried call
// produces a fresh event rather than overwriting an existing record.
//
// Every entry is expanded into full slash-delimited leaf paths: `update()`
// treats nested object values as raw data, so a diff key like `queues/{id}`
// cannot appear inside an object value (the server rejects keys containing
// "/") and a whole-node key would replace siblings. Expanding the paths keeps
// the merge atomic and preserves all unrelated state children.
//
// The audit `changes` is stored as a JSON string rather than a nested object:
// Realtime Database prunes null children on write, so an object like
// `{ currentAsset: null }` would collapse to an empty node and the audit
// event would either truncate the deletion or fail the rules validation.
// Serializing preserves the exact map (including null deletions and slashed
// paths) intact.
export function writeAuditedState(
  listenPrefix: string,
  stateArea: AuditStateArea,
  diff: Record<string, unknown>,
  audit: AuditEventPayload,
): Promise<void> {
  const eventId = crypto.randomUUID();
  const stateBase = `states/${listenPrefix}/${stateArea}`;
  const auditBase = `audit/${listenPrefix}/${eventId}`;
  const updates: Record<string, unknown> = {
    [`${auditBase}/timestamp`]: serverTimestamp(),
    [`${auditBase}/uid`]: audit.uid,
    [`${auditBase}/sessionId`]: audit.sessionId,
    [`${auditBase}/action`]: audit.action,
    [`${auditBase}/stateArea`]: stateArea,
    [`${auditBase}/changes`]: JSON.stringify(diff),
  };
  for (const [path, value] of Object.entries(diff)) {
    updates[`${stateBase}/${path}`] = value;
  }
  return update(ref(database), updates);
}

// Writes ONLY the audit record for a command whose state mutation was already
// committed atomically elsewhere (e.g. a Firebase transaction that performed
// compare-and-set on the state subtree). Keeps exactly one audit event per
// successful command. A failed audit write is surfaced to the caller so it can
// be logged rather than silently dropping accountability.
export function writeAuditOnly(
  listenPrefix: string,
  stateArea: AuditStateArea,
  diff: Record<string, unknown>,
  audit: AuditEventPayload,
): Promise<void> {
  const eventId = crypto.randomUUID();
  const auditBase = `audit/${listenPrefix}/${eventId}`;
  const updates: Record<string, unknown> = {
    [`${auditBase}/timestamp`]: serverTimestamp(),
    [`${auditBase}/uid`]: audit.uid,
    [`${auditBase}/sessionId`]: audit.sessionId,
    [`${auditBase}/action`]: audit.action,
    [`${auditBase}/stateArea`]: stateArea,
    [`${auditBase}/changes`]: JSON.stringify(diff),
  };
  return update(ref(database), updates);
}

export const firebaseDatabase = {
  writeAudited: writeAuditedState,
  writeAuditOnly,
};

export const generateClubOverrideId = (): string => {
  return crypto.randomUUID();
};
