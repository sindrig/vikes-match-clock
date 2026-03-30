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
exports.onUserCreate = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.database();
function isInvitationRecord(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value;
    if (typeof record.email !== "string") {
        return false;
    }
    if (typeof record.locations !== "object" || record.locations === null) {
        return false;
    }
    const locations = record.locations;
    return Object.values(locations).every((v) => typeof v === "boolean");
}
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
    const rawEmail = user.email;
    if (!rawEmail) {
        functions.logger.info("New user has no email, skipping invitation check", {
            uid: user.uid,
        });
        return;
    }
    const normalizedEmail = rawEmail.trim().toLowerCase();
    functions.logger.info("Checking invitations for new user", {
        uid: user.uid,
        email: normalizedEmail,
    });
    const invitationsSnap = await db.ref("invitations").once("value");
    if (!invitationsSnap.exists()) {
        functions.logger.info("No invitations found");
        return;
    }
    const invitations = invitationsSnap.val();
    const matchingKeys = [];
    const mergedLocations = {};
    for (const [key, value] of Object.entries(invitations)) {
        if (!isInvitationRecord(value)) {
            continue;
        }
        if (value.email.trim().toLowerCase() !== normalizedEmail) {
            continue;
        }
        matchingKeys.push(key);
        for (const [locationKey, locationValue] of Object.entries(value.locations)) {
            mergedLocations[locationKey] = locationValue;
        }
    }
    if (matchingKeys.length === 0) {
        functions.logger.info("No matching invitations for email", {
            email: normalizedEmail,
        });
        return;
    }
    functions.logger.info("Found matching invitations", {
        email: normalizedEmail,
        count: matchingKeys.length,
        locations: mergedLocations,
    });
    // Write auth grants first — only delete invitations if write succeeds
    await db.ref(`auth/${user.uid}`).set(mergedLocations);
    // Delete all matching invitations
    const deleteUpdates = {};
    for (const key of matchingKeys) {
        deleteUpdates[`invitations/${key}`] = null;
    }
    await db.ref().update(deleteUpdates);
    functions.logger.info("Processed invitations for new user", {
        uid: user.uid,
        email: normalizedEmail,
        locationsGranted: Object.keys(mergedLocations).length,
        invitationsDeleted: matchingKeys.length,
    });
});
//# sourceMappingURL=onUserCreate.js.map