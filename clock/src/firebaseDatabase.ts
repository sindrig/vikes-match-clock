import {
  ref,
  onValue,
  set,
  update,
  remove,
  off,
  DatabaseReference,
} from "firebase/database";
import { database, storageHelpers } from "./firebase";
import type { ClubOverride } from "./types";

export interface FirebaseSyncConfig {
  listenPrefix: string;
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
};

export const saveClubOverride = async (
  prefix: string,
  id: string,
  override: ClubOverride,
): Promise<void> => {
  const path = `states/${prefix}/clubOverrides/${id}`;
  await update(ref(database, path), override);
};

export const deleteClubOverride = async (
  prefix: string,
  id: string,
): Promise<void> => {
  const rtdbPath = `states/${prefix}/clubOverrides/${id}`;
  await remove(ref(database, rtdbPath));

  const storagePath = `${prefix}/club-logos/${id}`;
  await storageHelpers.deleteObject(storagePath);
};

export const generateClubOverrideId = (): string => {
  return crypto.randomUUID();
};
