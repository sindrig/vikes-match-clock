import { describe, expect, it } from "vitest";
import { validatePerimeterMapping } from "./perimeterMapping";
import {
  capturedVikinConfiguration,
  secondStadiumWebConfiguration,
} from "./fixtures";

describe("published perimeter mapping fixtures", () => {
  it.each([
    ["Víkin web", capturedVikinConfiguration],
    ["second stadium web", secondStadiumWebConfiguration],
  ])("validates the %s mapping", (_name, configuration) => {
    expect(validatePerimeterMapping(configuration)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("uses the web renderer at both venues", () => {
    expect(capturedVikinConfiguration.renderer).toBe("web");
    expect(secondStadiumWebConfiguration.renderer).toBe("web");
  });
});
