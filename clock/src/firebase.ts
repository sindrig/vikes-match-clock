import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth";
import {
  getDatabase,
  Database,
  connectDatabaseEmulator,
} from "firebase/database";
import {
  getStorage,
  FirebaseStorage,
  ref as storageRef,
  uploadBytes,
  uploadString,
  getDownloadURL,
  listAll,
  deleteObject,
  ListResult,
  StorageReference,
} from "firebase/storage";

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  storageBucket: string;
}

const prodConfig: FirebaseConfig = {
  apiKey: "AIzaSyDhdG6cVA2xTfHhceCUA6N4I1EgdDIL1oA",
  authDomain: "vikes-match-clock-firebase.firebaseapp.com",
  databaseURL: "https://vikes-match-clock-firebase.firebaseio.com",
  storageBucket: "vikes-match-clock-firebase.appspot.com",
};

const devConfig: FirebaseConfig = {
  apiKey: "AIzaSyCX-4CXktMfJL47nrrpc1y8Q73j09ItmQI",
  authDomain: "vikes-match-clock-staging.firebaseapp.com",
  databaseURL: "https://vikes-match-clock-staging.firebaseio.com",
  storageBucket: "vikes-match-clock-staging.appspot.com",
};

const emulatorConfig: FirebaseConfig = {
  apiKey: "test-api-key",
  authDomain: "vikes-match-clock-test.firebaseapp.com",
  databaseURL: "http://127.0.0.1:9000?ns=vikes-match-clock-test",
  storageBucket: "vikes-match-clock-test.appspot.com",
};

const isTest = import.meta.env.VITE_USE_EMULATOR === "true";
const isDev = !isTest && import.meta.env.MODE !== "production";
const isStaging =
  typeof window !== "undefined" &&
  window.location.hostname === "staging-klukka.irdn.is";

let fbConfig: FirebaseConfig;
if (isTest) {
  fbConfig = emulatorConfig;
} else if (isDev || isStaging) {
  console.warn("Using development firebase, be advised");
  fbConfig = devConfig;
} else {
  fbConfig = prodConfig;
}

const app: FirebaseApp = initializeApp(fbConfig);
const auth: Auth = getAuth(app);
const database: Database = getDatabase(app);
const storage: FirebaseStorage = getStorage(app);

if (isTest) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectDatabaseEmulator(database, "127.0.0.1", 9000);
}

const storageHelpers = {
  ref: (path: string): StorageReference => storageRef(storage, path),
  uploadBytes: (path: string, data: Blob | Uint8Array | ArrayBuffer) =>
    uploadBytes(storageRef(storage, path), data),
  uploadString: (path: string, data: string) =>
    uploadString(storageRef(storage, path), data),
  getDownloadURL: (path: string) => getDownloadURL(storageRef(storage, path)),
  listAll: (path: string): Promise<ListResult> =>
    listAll(storageRef(storage, path)),
  deleteObject: (path: string) => deleteObject(storageRef(storage, path)),
};

export {
  app,
  auth,
  database,
  storage,
  storageHelpers,
  storageRef,
  uploadBytes,
  uploadString,
  getDownloadURL,
  listAll,
  deleteObject,
};

export type { StorageReference, ListResult };
