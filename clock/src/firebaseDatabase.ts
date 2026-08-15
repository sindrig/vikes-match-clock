import {
  ref,
  onValue,
  set,
  update,
  off,
  DatabaseReference,
  serverTimestamp,
} from "firebase/database";
import { database, storageHelpers } from "./firebase";
import type { AuditStateArea, ClubOverride } from "./types";

export interface FirebaseSyncConfig {
  listenPrefix: string;
}

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
export function writeAuditedState(
  listenPrefix: string,
  stateArea: AuditStateArea,
  diff: Record<string, unknown>,
  audit: AuditEventPayload,
): Promise<void> {
  const eventId = crypto.randomUUID();
  const updates: Record<string, unknown> = {
    [`states/${listenPrefix}/${stateArea}`]: diff,
    [`audit/${listenPrefix}/${eventId}`]: {
      timestamp: serverTimestamp(),
      uid: audit.uid,
      sessionId: audit.sessionId,
      action: audit.action,
      stateArea,
      changes: diff,
    },
  };
  return update(ref(database), updates);
}

export const firebaseDatabase = {
  ref: (path: string): DatabaseReference => ref(database, path),

  set: <T>(path: string, data: T): Promise<void> =>
    set(ref(database, path), data),

  onValue: (
    path: string,
    callback: (data: unknown) => void,
    errorCallback?: (error: Error) => void,
  ) => {
    const dbRef = ref(database, path);
    return onValue(
      dbRef,
      (snapshot) => callback(snapshot.val()),
      errorCallback,
    );
  },

  off: (path: string): void => {
    off(ref(database, path));
  },

  syncState: (
    listenPrefix: string,
    stateType: "match" | "controller" | "view" | "perimeter",
    data: Record<string, unknown>,
  ): Promise<void> =>
    update(ref(database, `states/${listenPrefix}/${stateType}`), data),

  writeAudited: writeAuditedState,
};

export const saveClubOverride = async (
  prefix: string,
  id: string,
  override: ClubOverride,
  audit: AuditEventPayload,
): Promise<void> => {
  await writeAuditedState(prefix, "clubOverrides", { [id]: override }, audit);
};

export const deleteClubOverride = async (
  prefix: string,
  id: string,
  audit: AuditEventPayload,
): Promise<void> => {
  await writeAuditedState(prefix, "clubOverrides", { [id]: null }, audit);

  const storagePath = `${prefix}/club-logos/${id}`;
  await storageHelpers.deleteObject(storagePath);
};

export const generateClubOverrideId = (): string => {
  return crypto.randomUUID();
};
