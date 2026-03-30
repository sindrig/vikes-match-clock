import { onCall } from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { ServerValue } from "firebase-admin/database";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

type AdminWriteData =
  | {
      action: "setUserLocations";
      targetUid: string;
      locations: Record<string, boolean>;
    }
  | {
      action: "createInvitation";
      email: string;
      locations: Record<string, boolean>;
    }
  | {
      action: "deleteInvitation";
      invitationId: string;
    }
  | {
      action: "updateInvitation";
      invitationId: string;
      locations: Record<string, boolean>;
    };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertNonEmptyString(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must be a non-empty string`,
    );
  }
}

function assertValidLocations(
  value: unknown,
  fieldName: string,
): asserts value is Record<string, boolean> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${fieldName} must be a plain object`,
    );
  }
  const obj = value as Record<string, unknown>;
  for (const [key, val] of Object.entries(obj)) {
    if (typeof key !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `${fieldName} keys must be strings`,
      );
    }
    if (typeof val !== "boolean") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `${fieldName} values must be booleans, got ${typeof val} for key "${key}"`,
      );
    }
  }
}

function assertValidEmail(value: unknown): asserts value is string {
  assertNonEmptyString(value, "email");
  if (!EMAIL_REGEX.test(value)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "email must be a valid email address",
    );
  }
}

async function verifyAdmin(callerUid: string): Promise<void> {
  const adminSnap = await db.ref(`admins/${callerUid}`).once("value");
  if (adminSnap.val() !== true) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can perform this operation",
    );
  }
}

async function handleSetUserLocations(data: {
  targetUid: unknown;
  locations: unknown;
}): Promise<{ success: true }> {
  assertNonEmptyString(data.targetUid, "targetUid");
  assertValidLocations(data.locations, "locations");
  await db.ref(`auth/${data.targetUid}`).set(data.locations);
  return { success: true };
}

async function handleCreateInvitation(data: {
  email: unknown;
  locations: unknown;
  callerEmail: string;
}): Promise<{ success: true; invitationId: string }> {
  assertValidEmail(data.email);
  assertValidLocations(data.locations, "locations");
  const normalizedEmail = data.email.trim().toLowerCase();
  const ref = db.ref("invitations").push();
  await ref.set({
    email: normalizedEmail,
    locations: data.locations,
    createdBy: data.callerEmail,
    createdAt: ServerValue.TIMESTAMP,
  });
  return { success: true, invitationId: ref.key! };
}

async function handleDeleteInvitation(data: {
  invitationId: unknown;
}): Promise<{ success: true }> {
  assertNonEmptyString(data.invitationId, "invitationId");
  await db.ref(`invitations/${data.invitationId}`).remove();
  return { success: true };
}

async function handleUpdateInvitation(data: {
  invitationId: unknown;
  locations: unknown;
}): Promise<{ success: true }> {
  assertNonEmptyString(data.invitationId, "invitationId");
  assertValidLocations(data.locations, "locations");
  await db
    .ref(`invitations/${data.invitationId}/locations`)
    .set(data.locations);
  return { success: true };
}

export const adminWrite = onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Must be authenticated",
    );
  }

  const callerUid = request.auth.uid;
  await verifyAdmin(callerUid);

  const typedData = request.data as AdminWriteData;

  switch (typedData.action) {
    case "setUserLocations":
      functions.logger.info("setUserLocations", { callerUid });
      return handleSetUserLocations(typedData);

    case "createInvitation": {
      functions.logger.info("createInvitation", { callerUid });
      const callerEmail = request.auth.token.email ?? callerUid;
      return handleCreateInvitation({ ...typedData, callerEmail });
    }

    case "deleteInvitation":
      functions.logger.info("deleteInvitation", { callerUid });
      return handleDeleteInvitation(typedData);

    case "updateInvitation":
      functions.logger.info("updateInvitation", { callerUid });
      return handleUpdateInvitation(typedData);

    default: {
      const unknownAction = (request.data as { action?: string }).action;
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Unknown action: ${unknownAction}`,
      );
    }
  }
});
