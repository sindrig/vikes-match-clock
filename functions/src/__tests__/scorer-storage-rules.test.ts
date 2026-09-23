import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// These tests need a running Firebase Storage emulator with the storage
// rules loaded (CI starts one; locally opt in with RUN_RULES_TESTS=true).
// They are skipped otherwise so the default functions test run stays
// hermetic.
const RUN_RULES_TESTS = process.env.RUN_RULES_TESTS === "true";

const rules = readFileSync(
  resolve(__dirname, "../../../storage.rules"),
  "utf8",
);

const describeRules = RUN_RULES_TESTS ? describe : describe.skip;

const LOCATION = "vikuti";
const PORT = 9199;

// Bytes that form a valid, trivially decodable 1x1 PNG.
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

describeRules("Firebase scorer source storage rules", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "vikes-match-clock-test",
      storage: {
        host: "127.0.0.1",
        port: PORT,
        rules,
      },
    });
    await env.clearStorage();
    // Seed approved and unrelated objects as a trusted harness.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const storage = ctx.storage();
      await storage.ref(`${LOCATION}/players/2492-fagn.png`).put(PNG_BYTES);
      await storage.ref(`${LOCATION}/crest.png`).put(PNG_BYTES);
      await storage.ref(`${LOCATION}/players/2492-plain.png`).put(PNG_BYTES);
      await storage.ref(`${LOCATION}/players/a_b-C-fagn.png`).put(PNG_BYTES);
      await storage.ref(`other/players/2492-fagn.png`).put(PNG_BYTES);
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("allows anonymous reads of the venue crest", async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertSucceeds(storage.ref(`${LOCATION}/crest.png`).getMetadata());
  });

  it("allows anonymous reads of approved player images", async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertSucceeds(
      storage.ref(`${LOCATION}/players/2492-fagn.png`).getMetadata(),
    );
    await assertSucceeds(
      storage.ref(`${LOCATION}/players/a_b-C-fagn.png`).getMetadata(),
    );
    // Identifier-shaped card photos are readable by the player band.
    await assertSucceeds(
      storage.ref(`${LOCATION}/players/2492-plain.png`).getMetadata(),
    );
  });

  it("denies anonymous reads of non-identifier player media", async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertFails(
      storage.ref(`${LOCATION}/players/portrait.jpg`).getMetadata(),
    );
    // Dots inside the name break the identifier convention.
    await assertFails(
      storage.ref(`${LOCATION}/players/2492.fagn.png`).getMetadata(),
    );
    await assertFails(
      storage.ref(`${LOCATION}/players/dir/2492-fagn.png`).getMetadata(),
    );
  });

  it("denies anonymous reads outside the approved scorer paths", async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertFails(
      storage.ref(`${LOCATION}/players/roster.json`).getMetadata(),
    );
  });

  // Consistent with the existing public media prefixes, the {location}
  // wildcard is not cross-checked against the requesting venue; the rule
  // scope is the object naming convention, not the venue.
  it("allows the same approved shape at any venue prefix", async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertSucceeds(
      storage.ref(`other/players/2492-fagn.png`).getMetadata(),
    );
  });

  it("denies anonymous mutations of the crest and celebration images", async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertFails(
      storage
        .ref(`${LOCATION}/crest.png`)
        .put(PNG_BYTES)
        .then(() => undefined),
    );
    await assertFails(
      storage
        .ref(`${LOCATION}/players/2492-fagn.png`)
        .put(PNG_BYTES)
        .then(() => undefined),
    );
    await assertFails(storage.ref(`${LOCATION}/crest.png`).delete());
    await assertFails(
      storage
        .ref(`${LOCATION}/players/9999-fagn.png`)
        .put(PNG_BYTES)
        .then(() => undefined),
    );
  });

  it("allows authenticated writes to the crest and celebration images", async () => {
    const storage = env.authenticatedContext("operator-1").storage();
    await assertSucceeds(
      storage
        .ref(`${LOCATION}/players/3333-fagn.png`)
        .put(PNG_BYTES)
        .then(() => undefined),
    );
    await assertSucceeds(
      storage
        .ref(`${LOCATION}/crest.png`)
        .put(PNG_BYTES)
        .then(() => undefined),
    );
  });
});

// The storage rules are plain text; assert the scoped exception shapes
// structurally so they are verified even without the emulator.
describe("Scorer source storage rule structure", () => {
  it("declares the crest exception with anonymous read and authenticated write", () => {
    const crest = rules.match(
      /match \/\{location\}\/crest\.png \{[\s\S]*?allow read: if true;[\s\S]*?allow write: if request\.auth != null;/,
    );
    expect(crest).not.toBeNull();
  });

  it("restricts anonymous player reads to the safe identifier naming convention", () => {
    const players = rules.match(
      /match \/\{location\}\/players\/\{fileName\} \{[\s\S]*?allow read: if fileName\.matches\("([^"]*)"\);[\s\S]*?allow write: if request\.auth != null;/,
    );
    expect(players).not.toBeNull();
    expect(players![1]).toContain("-fagn");
    expect(players![1]).toMatch(
      /^\^\[A-Za-z0-9_-]\{1,64\}\(-fagn\)\?\[\.\]png\$/,
    );
  });

  it("keeps every other object authenticated-only", () => {
    expect(rules).toMatch(
      /match \/\{allPaths=\*\*\} \{\s*allow read, write: if request\.auth != null;/,
    );
  });
});
