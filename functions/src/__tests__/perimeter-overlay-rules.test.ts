import { describe, it, beforeAll, afterAll } from "vitest";
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
const BUCKET = "vikes-match-clock-firebase.appspot.com";

const validFileOverlay = {
  version: 1,
  id: "11111111-1111-4111-8111-111111111111",
  columns: [
    {
      durationMs: 10000,
      files: {
        "2": {
          name: "goal-48.mp4",
          source: `gs://${BUCKET}/${LOCATION}/perimeter/goal-48.mp4`,
        },
        "4": {
          name: "goal-40.mp4",
          source: `gs://${BUCKET}/${LOCATION}/perimeter/goal-40.mp4`,
          generation: "1700000000000000",
        },
      },
    },
  ],
};

const validScorerOverlay = {
  version: 2,
  kind: "goal-scorer",
  id: "22222222-2222-4222-8222-222222222222",
  player: { id: "2492", name: "Jón Jónsson", number: "7" },
};

const validGoalVideoConfig = {
  files: {
    "2": {
      name: "goal-48.mp4",
      source: `gs://${BUCKET}/${LOCATION}/perimeter/goal-48.mp4`,
      generation: "1700000000000001",
    },
    "4": {
      name: "goal-40.mp4",
      source: `gs://${BUCKET}/${LOCATION}/perimeter/goal-40.mp4`,
      generation: "1700000000000002",
    },
  },
};

describeRules("Firebase perimeter overlay rules", () => {
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
      await ctx
        .database()
        .ref(`auth/${UID}`)
        .set({ [LOCATION]: true });
      await ctx.database().ref(`auth/${OUTSIDER}`).set({ otherVenue: true });
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("allows an authorized operator to write a valid version-1 file overlay", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertSucceeds(
      db.ref(`states/${LOCATION}/perimeter/overlay`).set(validFileOverlay),
    );
  });

  it("allows an authorized operator to clear the overlay", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertSucceeds(
      db.ref(`states/${LOCATION}/perimeter/overlay`).remove(),
    );
  });

  it("allows a valid version-2 semantic scorer command", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertSucceeds(
      db.ref(`states/${LOCATION}/perimeter/overlay`).set(validScorerOverlay),
    );
  });

  it("rejects unauthenticated writes", async () => {
    const db = env.unauthenticatedContext().database();
    await assertFails(
      db.ref(`states/${LOCATION}/perimeter/overlay`).set(validFileOverlay),
    );
    await assertFails(
      db.ref(`states/${LOCATION}/perimeter/overlay`).set(validScorerOverlay),
    );
  });

  it("rejects writes from an operator without venue access", async () => {
    const db = env.authenticatedContext(OUTSIDER).database();
    await assertFails(
      db.ref(`states/${LOCATION}/perimeter/overlay`).set(validScorerOverlay),
    );
  });

  it("rejects unknown versions", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertFails(
      db
        .ref(`states/${LOCATION}/perimeter/overlay`)
        .set({ ...validFileOverlay, version: 3 }),
    );
  });

  it("rejects a version-1 command carrying version-2 scorer fields", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertFails(
      db
        .ref(`states/${LOCATION}/perimeter/overlay`)
        .set({ ...validFileOverlay, kind: "goal-scorer" }),
    );
    await assertFails(
      db
        .ref(`states/${LOCATION}/perimeter/overlay`)
        .set({ ...validFileOverlay, player: validScorerOverlay.player }),
    );
  });

  it("rejects a version-2 command missing the goal-scorer kind or player", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertFails(
      db
        .ref(`states/${LOCATION}/perimeter/overlay`)
        .set({ ...validScorerOverlay, kind: "file" }),
    );
    const { player: _player, ...withoutPlayer } = validScorerOverlay;
    await assertFails(
      db.ref(`states/${LOCATION}/perimeter/overlay`).set(withoutPlayer),
    );
  });

  it("rejects a version-2 command carrying version-1 columns", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertFails(
      db
        .ref(`states/${LOCATION}/perimeter/overlay`)
        .set({ ...validScorerOverlay, columns: validFileOverlay.columns }),
    );
  });

  it("rejects oversized or malformed command ids", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertFails(
      db
        .ref(`states/${LOCATION}/perimeter/overlay`)
        .set({ ...validFileOverlay, id: "" }),
    );
    await assertFails(
      db
        .ref(`states/${LOCATION}/perimeter/overlay`)
        .set({ ...validScorerOverlay, id: "x".repeat(129) }),
    );
  });

  it("rejects invalid semantic player payloads", async () => {
    const db = env.authenticatedContext(UID).database();
    for (const player of [
      { id: "", name: "Jón", number: "7" },
      { id: "../escape", name: "Jón", number: "7" },
      { id: "a".repeat(65), name: "Jón", number: "7" },
      { id: "2492", name: "", number: "7" },
      { id: "2492", name: "x".repeat(81), number: "7" },
      { id: "2492", name: "Jón", number: "" },
      { id: "2492", name: "Jón", number: "7a" },
      { id: "2492", name: "Jón", number: "12345" },
      { id: "2492", name: "Jón", number: 7 },
      { id: "2492", name: "Jón" },
    ]) {
      await assertFails(
        db
          .ref(`states/${LOCATION}/perimeter/overlay`)
          .set({ ...validScorerOverlay, player }),
      );
    }
  });

  it("rejects malformed version-1 columns", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertFails(
      db
        .ref(`states/${LOCATION}/perimeter/overlay`)
        .set({ ...validFileOverlay, columns: [{ durationMs: 10, files: {} }] }),
    );
    await assertFails(
      db
        .ref(`states/${LOCATION}/perimeter/overlay`)
        .set({
          ...validFileOverlay,
          columns: [{ durationMs: 500000, files: {} }],
        }),
    );
    await assertFails(
      db.ref(`states/${LOCATION}/perimeter/overlay`).set({
        ...validFileOverlay,
        columns: [
          {
            durationMs: 10000,
            files: {
              "2": { name: "", source: `gs://${BUCKET}/${LOCATION}/x.mp4` },
            },
          },
        ],
      }),
    );
    await assertFails(
      db.ref(`states/${LOCATION}/perimeter/overlay`).set({
        ...validFileOverlay,
        columns: [
          {
            durationMs: 10000,
            files: {
              "2": {
                name: "x.mp4",
                source: "http://not-a-gs-uri/x.mp4",
              },
            },
          },
        ],
      }),
    );
  });

  it("rejects unknown children inside overlay documents and files", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertFails(
      db
        .ref(`states/${LOCATION}/perimeter/overlay`)
        .set({ ...validScorerOverlay, extra: true }),
    );
    await assertFails(
      db.ref(`states/${LOCATION}/perimeter/overlay`).set({
        ...validFileOverlay,
        columns: [
          {
            durationMs: 10000,
            files: {
              "2": {
                name: "goal-48.mp4",
                source: `gs://${BUCKET}/${LOCATION}/perimeter/goal-48.mp4`,
                token: "secret",
              },
            },
          },
        ],
      }),
    );
  });

  it("allows an authorized operator to write valid goal-video config", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertSucceeds(
      db
        .ref(`states/${LOCATION}/perimeter/goalVideo`)
        .set(validGoalVideoConfig),
    );
  });

  it("allows an authorized operator to clear the goal-video config", async () => {
    const db = env.authenticatedContext(UID).database();
    await assertSucceeds(
      db.ref(`states/${LOCATION}/perimeter/goalVideo`).remove(),
    );
  });

  it("rejects unauthenticated or malformed goal-video config writes", async () => {
    const unauth = env.unauthenticatedContext().database();
    await assertFails(
      unauth
        .ref(`states/${LOCATION}/perimeter/goalVideo`)
        .set(validGoalVideoConfig),
    );
    const db = env.authenticatedContext(UID).database();
    await assertFails(
      db.ref(`states/${LOCATION}/perimeter/goalVideo`).set({ extra: true }),
    );
    await assertFails(
      db
        .ref(`states/${LOCATION}/perimeter/goalVideo`)
        .set({ files: { "2": { name: "goal-48.mp4" } } }),
    );
    await assertFails(
      db.ref(`states/${LOCATION}/perimeter/goalVideo`).set({
        files: {
          "2": {
            name: "goal-48.mp4",
            source: "http://not-a-gs-uri/goal-48.mp4",
          },
          "4": {
            name: "goal-40.mp4",
            source: `gs://${BUCKET}/${LOCATION}/perimeter/goal-40.mp4`,
          },
        },
      }),
    );
  });

  it("accepts the atomic audited write shape used by the controller", async () => {
    const db = env.authenticatedContext(UID).database();
    const updates: Record<string, unknown> = {
      [`states/${LOCATION}/perimeter/overlay`]: validScorerOverlay,
      [`audit/${LOCATION}/overlay-atomic`]: {
        timestamp: 1700000000000,
        uid: UID,
        sessionId: "session-abc",
        action: "perimeter.set-overlay",
        stateArea: "perimeter",
        changes: { overlay: validScorerOverlay },
      },
    };
    await assertSucceeds(db.ref().update(updates));
  });
});
