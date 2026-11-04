import test from "node:test";

import * as entrypoint from "../index.js";
import { SCENARIOS, runScenario } from "./helpers/retained-scenarios.js";

for (const scenario of SCENARIOS) {
  test(`brightness gateway integration: ${scenario}`, async (t) => {
    // Every actual transport must be explicitly doubled by the scenario.
    t.mock.method(globalThis, "fetch", () => {
      throw new Error("Unexpected network access");
    });
    await runScenario(entrypoint, scenario);
  });
}
