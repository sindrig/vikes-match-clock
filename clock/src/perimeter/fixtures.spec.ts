import { describe, expect, it } from "vitest";
import { validatePerimeterMapping } from "./perimeterMapping";
import {
  capturedVikinConfiguration,
  secondStadiumWebConfiguration,
} from "./fixtures";

describe("published perimeter mapping fixtures", () => {
  it.each([
    ["Víkin Resolume", capturedVikinConfiguration],
    ["second stadium web", secondStadiumWebConfiguration],
  ])("validates the %s mapping", (_name, configuration) => {
    expect(validatePerimeterMapping(configuration)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("keeps Víkin on the Resolume renderer boundary", () => {
    expect(capturedVikinConfiguration.renderer).toBe("resolume");
    expect(secondStadiumWebConfiguration.renderer).toBe("web");
  });
});
