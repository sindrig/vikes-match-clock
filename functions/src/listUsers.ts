import { onCall } from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

interface UserEntry {
  uid: string;
  email: string | undefined;
  displayName: string | undefined;
  createdAt: string | undefined;
  lastSignIn: string | undefined;
  disabled: boolean;
}

export const listUsers = onCall(
  { enforceAppCheck: true },
  async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be authenticated to list users"
    );
  }

  const callerUid = request.auth.uid;
  const adminSnap = await db.ref(`admins/${callerUid}`).once("value");
  if (adminSnap.val() !== true) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can list users"
    );
  }

  const users: UserEntry[] = [];
  let nextPageToken: string | undefined;

  do {
    const listResult = await admin.auth().listUsers(1000, nextPageToken);
    for (const userRecord of listResult.users) {
      users.push({
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        createdAt: userRecord.metadata.creationTime,
        lastSignIn: userRecord.metadata.lastSignInTime,
        disabled: userRecord.disabled,
      });
    }
    nextPageToken = listResult.pageToken;
  } while (nextPageToken);

  functions.logger.info("Listed users", {
    callerUid,
    userCount: users.length,
  });

  return { users };
});
