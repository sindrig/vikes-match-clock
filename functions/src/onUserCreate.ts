import * as functionsV1 from "firebase-functions/v1";
import { auth } from "firebase-admin";
type UserRecord = auth.UserRecord;
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

interface InvitationRecord {
  email: string;
  locations: Record<string, boolean>;
}

function isInvitationRecord(value: unknown): value is InvitationRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.email !== "string") {
    return false;
  }
  if (typeof record.locations !== "object" || record.locations === null) {
    return false;
  }
  const locations = record.locations as Record<string, unknown>;
  return Object.values(locations).every((v) => typeof v === "boolean");
}

export const onUserCreate = functionsV1.auth.user().onCreate(async (user: UserRecord) => {
  const rawEmail = user.email;
  if (!rawEmail) {
    functionsV1.logger.info("New user has no email, skipping invitation check", {
      uid: user.uid,
    });
    return;
  }

  const normalizedEmail = rawEmail.trim().toLowerCase();
  functionsV1.logger.info("Checking invitations for new user", {
    uid: user.uid,
    email: normalizedEmail,
  });

  const invitationsSnap = await db.ref("invitations").once("value");
  if (!invitationsSnap.exists()) {
    functionsV1.logger.info("No invitations found");
    return;
  }

  const invitations = invitationsSnap.val() as Record<string, unknown>;
  const matchingKeys: string[] = [];
  const mergedLocations: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(invitations)) {
    if (!isInvitationRecord(value)) {
      continue;
    }
    if (value.email.trim().toLowerCase() !== normalizedEmail) {
      continue;
    }
    matchingKeys.push(key);
    for (const [locationKey, locationValue] of Object.entries(
      value.locations
    )) {
      mergedLocations[locationKey] = locationValue;
    }
  }

  if (matchingKeys.length === 0) {
    functionsV1.logger.info("No matching invitations for email", {
      email: normalizedEmail,
    });
    return;
  }

  functionsV1.logger.info("Found matching invitations", {
    email: normalizedEmail,
    count: matchingKeys.length,
    locations: mergedLocations,
  });

  // Write auth grants first — only delete invitations if write succeeds
  await db.ref(`auth/${user.uid}`).set(mergedLocations);

  // Delete all matching invitations
  const deleteUpdates: Record<string, null> = {};
  for (const key of matchingKeys) {
    deleteUpdates[`invitations/${key}`] = null;
  }
  await db.ref().update(deleteUpdates);

  functionsV1.logger.info("Processed invitations for new user", {
    uid: user.uid,
    email: normalizedEmail,
    locationsGranted: Object.keys(mergedLocations).length,
    invitationsDeleted: matchingKeys.length,
  });
});
