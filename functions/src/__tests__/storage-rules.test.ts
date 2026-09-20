import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RUN_RULES_TESTS = process.env.RUN_RULES_TESTS === "true";
const describeRules = RUN_RULES_TESTS ? describe : describe.skip;
const rules = readFileSync(resolve(__dirname, "../../../storage.rules"), "utf8");
const bucket = "vikes-match-clock-test.appspot.com";

describeRules("Firebase Storage perimeter rules", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "vikes-match-clock-test",
      storage: { host: "127.0.0.1", port: 9199, rules },
    });
    await env.withSecurityRulesDisabled(async (context) => {
      await new Promise<void>((resolve, reject) => {
        context
          .storage(bucket)
          .ref("vikuti/perimeter/base.png")
          .put(new Uint8Array([1, 2, 3]))
          .on("state_changed", () => undefined, reject, resolve);
      });
      await new Promise<void>((resolve, reject) => {
        context
          .storage(bucket)
          .ref("vikuti/largeAds/private.png")
          .put(new Uint8Array([4, 5, 6]))
          .on("state_changed", () => undefined, reject, resolve);
      });
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("allows anonymous reads from approved base and overlay paths", async () => {
    const storage = env.unauthenticatedContext().storage(bucket);
    await assertSucceeds(
      storage.ref("vikuti/perimeter/base.png").getMetadata(),
    );
    await env.withSecurityRulesDisabled(async (context) => {
      await new Promise<void>((resolve, reject) => {
        context
          .storage(bucket)
          .ref("vikuti/perimeter-overlays/pair/48/overlay.png")
          .put(new Uint8Array([7]))
          .on("state_changed", () => undefined, reject, resolve);
      });
    });
    await assertSucceeds(
      storage
        .ref("vikuti/perimeter-overlays/pair/48/overlay.png")
        .getMetadata(),
    );
  });

  it("denies anonymous writes and unrelated reads", async () => {
    const storage = env.unauthenticatedContext().storage(bucket);
    await assertFails(
      new Promise<void>((resolve, reject) => {
        storage
          .ref("vikuti/perimeter/new.png")
          .put(new Uint8Array([8]))
          .on("state_changed", () => undefined, reject, resolve);
      }),
    );
    await assertFails(
      storage.ref("vikuti/largeAds/private.png").getMetadata(),
    );
  });

  it("keeps authenticated writes available for operators", async () => {
    const storage = env.authenticatedContext("operator-1").storage(bucket);
    await assertSucceeds(
      new Promise<void>((resolve, reject) => {
        storage
          .ref("vikuti/perimeter/operator.png")
          .put(new Uint8Array([9]))
          .on("state_changed", () => undefined, reject, resolve);
      }),
    );
  });
});
