import { ref, onValue, set, off, DatabaseReference } from "firebase/database";
import { database } from "./firebase";

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
    stateType: "match" | "controller" | "view",
    data: unknown,
  ): Promise<void> =>
    set(ref(database, `states/${listenPrefix}/${stateType}`), data),
};
