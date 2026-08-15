import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// These tests need a running Firebase emulator with the RTDB rules loaded
// (CI starts one; locally opt in with RUN_RULES_TESTS=true). They are skipped
// otherwise so the default functions test run stays hermetic.
const RUN_RULES_TESTS = process.env.RUN_RULES_TESTS === "true";

const rules = readFileSync(
  resolve(__dirname, "../../../firebase-rules.json"),
  "utf8",
);

const describeRules = RUN_RULES_TESTS ? describe : describe.skip;

const LOCATION = "vikuti";
const UID = "operator-1";
const OUTSIDER = "outsider-1";

const validEvent = {
  timestamp: 1700000000000,
  uid: UID,
  sessionId: "session-abc",
  action: "match.start",
  stateArea: "match",
  changes: { started: 1700000000000 },
};

describeRules("Firebase audit rules", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "vikes-match-clock-test",
      database: {
        host: "127.0.0.1",
        port: 9000,
        rules,
      },
    });
    await env.clearDatabase();
    // Grant the operator the venue, and give the outsider a different venue.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref(`auth/${UID}`).set({ [LOCATION]: true });
      await ctx.database().ref(`auth/${OUTSIDER}`).set({ otherVenue: true });
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("allows an authorized operator to create an audit event for their venue", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertSucceeds(db.ref(`audit/${LOCATION}/event1`).set(validEvent));
  });

  it("rejects an event claiming another operator's identity", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertFails(
      db
        .ref(`audit/${LOCATION}/impersonation`)
        .set({ ...validEvent, uid: "someone-else" }),
    );
  });

  it("rejects an event missing a required field", async () => {
    const db = env.authenticatedContext(UID).database();
    const { changes: _changes, ...withoutChanges } = validEvent;
    await assertFails(
      db.ref(`audit/${LOCATION}/incomplete`).set(withoutChanges),
    );
  });

  it("rejects an event with an unknown state area", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertFails(
      db
        .ref(`audit/${LOCATION}/bad-area`)
        .set({ ...validEvent, stateArea: "scores" }),
    );
  });

  it("rejects modifying an existing audit event", async () => {
    const db = env.authenticatedContext(UID).database();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref(`audit/${LOCATION}/existing`).set(validEvent);
    });
    await assertFails(
      db
        .ref(`audit/${LOCATION}/existing`)
        .set({ ...validEvent, action: "match.reset" }),
    );
  });

  it("rejects deleting an existing audit event", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertFails(db.ref(`audit/${LOCATION}/existing`).remove());
  });

  it("rejects a write from a user without venue access", async () => {
    const db = env.authenticatedContext(OUTSIDER).database();
    await assertFails(db.ref(`audit/${LOCATION}/outsider-event`).set(validEvent));
  });

  it("denies unauthorized reads of audit history", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref(`audit/${LOCATION}/event1`).set(validEvent);
    });
    const db = env.authenticatedContext(OUTSIDER).database();
    await assertFails(db.ref(`audit/${LOCATION}`).once("value"));
  });

  it("allows an authorized operator to read audit history", async () => {
    const db = env.authenticatedContext(UID).database();
    const snap = await db.ref(`audit/${LOCATION}`).once("value");
    expect(snap.val()).not.toBeNull();
  });

  it("commits a state mutation and its audit event atomically", async () => {
    const db = env.authenticatedContext(UID).database();
    const updates: Record<string, unknown> = {
      [`states/${LOCATION}/match`]: { homeScore: 1 },
      [`audit/${LOCATION}/atomic1`]: validEvent,
    };
    await assertSucceeds(db.ref().update(updates));
    const score = await db.ref(`states/${LOCATION}/match/homeScore`).once("value");
    expect(score.val()).toBe(1);
  });

  it("rejects the state mutation when its audit event would be invalid", async () => {
    const db = env.authenticatedContext(UID).database();
    const updates: Record<string, unknown> = {
      [`states/${LOCATION}/match`]: { homeScore: 2 },
      [`audit/${LOCATION}/atomic-bad`]: { ...validEvent, uid: "someone-else" },
    };
    await assertFails(db.ref().update(updates));
    const score = await db.ref(`states/${LOCATION}/match/homeScore`).once("value");
    // The mutation must not be observable without its audit record.
    expect(score.val()).not.toBe(2);
  });
});
