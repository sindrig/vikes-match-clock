"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminWrite = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.database();
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function assertNonEmptyString(value, fieldName) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new functions.https.HttpsError("invalid-argument", `${fieldName} must be a non-empty string`);
    }
}
function assertValidLocations(value, fieldName) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new functions.https.HttpsError("invalid-argument", `${fieldName} must be a plain object`);
    }
    const obj = value;
    for (const [key, val] of Object.entries(obj)) {
        if (typeof key !== "string") {
            throw new functions.https.HttpsError("invalid-argument", `${fieldName} keys must be strings`);
        }
        if (typeof val !== "boolean") {
            throw new functions.https.HttpsError("invalid-argument", `${fieldName} values must be booleans, got ${typeof val} for key "${key}"`);
        }
    }
}
function assertValidEmail(value) {
    assertNonEmptyString(value, "email");
    if (!EMAIL_REGEX.test(value)) {
        throw new functions.https.HttpsError("invalid-argument", "email must be a valid email address");
    }
}
async function verifyAdmin(callerUid) {
    const adminSnap = await db.ref(`admins/${callerUid}`).once("value");
    if (adminSnap.val() !== true) {
        throw new functions.https.HttpsError("permission-denied", "Only admins can perform this operation");
    }
}
async function handleSetUserLocations(data) {
    assertNonEmptyString(data.targetUid, "targetUid");
    assertValidLocations(data.locations, "locations");
    await db.ref(`auth/${data.targetUid}`).set(data.locations);
    return { success: true };
}
async function handleCreateInvitation(data) {
    assertValidEmail(data.email);
    assertValidLocations(data.locations, "locations");
    const normalizedEmail = data.email.trim().toLowerCase();
    const ref = db.ref("invitations").push();
    await ref.set({
        email: normalizedEmail,
        locations: data.locations,
    });
    return { success: true, invitationId: ref.key };
}
async function handleDeleteInvitation(data) {
    assertNonEmptyString(data.invitationId, "invitationId");
    await db.ref(`invitations/${data.invitationId}`).remove();
    return { success: true };
}
async function handleUpdateInvitation(data) {
    assertNonEmptyString(data.invitationId, "invitationId");
    assertValidLocations(data.locations, "locations");
    await db
        .ref(`invitations/${data.invitationId}/locations`)
        .set(data.locations);
    return { success: true };
}
exports.adminWrite = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }
    const callerUid = context.auth.uid;
    await verifyAdmin(callerUid);
    const typedData = data;
    switch (typedData.action) {
        case "setUserLocations":
            functions.logger.info("setUserLocations", { callerUid });
            return handleSetUserLocations(typedData);
        case "createInvitation":
            functions.logger.info("createInvitation", { callerUid });
            return handleCreateInvitation(typedData);
        case "deleteInvitation":
            functions.logger.info("deleteInvitation", { callerUid });
            return handleDeleteInvitation(typedData);
        case "updateInvitation":
            functions.logger.info("updateInvitation", { callerUid });
            return handleUpdateInvitation(typedData);
        default: {
            const unknownAction = data.action;
            throw new functions.https.HttpsError("invalid-argument", `Unknown action: ${unknownAction}`);
        }
    }
});
//# sourceMappingURL=adminWrite.js.map