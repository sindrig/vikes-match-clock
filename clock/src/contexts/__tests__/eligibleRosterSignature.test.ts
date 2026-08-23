import { describe, it, expect } from "vitest";
import { computeEligibleRosterSignature } from "../FirebaseStateContext";
import type { Player } from "../../types";

describe("computeEligibleRosterSignature", () => {
  // Eligibility alignment with requestGoalScorerPreparation.

  it("returns empty string for undefined roster", () => {
    expect(computeEligibleRosterSignature(undefined)).toBe("");
  });

  it("returns empty string for empty roster", () => {
    expect(computeEligibleRosterSignature([])).toBe("");
  });

  it("excludes players without an id", () => {
    const roster: Player[] = [{ name: "Jón", number: 7 }];
    expect(computeEligibleRosterSignature(roster)).toBe("");
  });

  it("excludes players without a number (number undefined)", () => {
    const roster: Player[] = [{ name: "Jón", id: 10 }];
    expect(computeEligibleRosterSignature(roster)).toBe("");
  });

  it("excludes players without a number (number null)", () => {
    const roster: Player[] = [{ name: "Jón", id: 10, number: undefined }];
    expect(computeEligibleRosterSignature(roster)).toBe("");
  });

  it("includes players with both valid id and number", () => {
    const roster: Player[] = [{ name: "Jón", id: 10, number: 7 }];
    expect(computeEligibleRosterSignature(roster)).toBe('["10:Jón:7"]');
  });

  it("includes multiple eligible players", () => {
    const roster: Player[] = [
      { name: "Jón", id: 10, number: 7 },
      { name: "Gunnar", id: 20, number: 9 },
    ];
    expect(computeEligibleRosterSignature(roster)).toBe(
      '["10:Jón:7","20:Gunnar:9"]',
    );
  });

  it("filters out ineligible players mixed with eligible ones", () => {
    const roster: Player[] = [
      { name: "Jón", id: 10, number: 7 },
      { name: "NoNumber", id: 30 }, // no number
      { name: "NoId", number: 5 }, // no id
      { name: "Gunnar", id: 20, number: 9 },
    ];
    expect(computeEligibleRosterSignature(roster)).toBe(
      '["10:Jón:7","20:Gunnar:9"]',
    );
  });

  it("handles string number values", () => {
    const roster: Player[] = [{ name: "Jón", id: 10, number: "7" }];
    expect(computeEligibleRosterSignature(roster)).toBe('["10:Jón:7"]');
  });

  // Stability: same content has the same signature.

  it("returns identical signature for a new array with the same content", () => {
    const rosterA: Player[] = [
      { name: "Jón", id: 10, number: 7 },
      { name: "Gunnar", id: 20, number: 9 },
    ];
    const rosterB: Player[] = [
      { name: "Jón", id: 10, number: 7 },
      { name: "Gunnar", id: 20, number: 9 },
    ];
    // Different array references, same content
    expect(rosterA).not.toBe(rosterB);
    expect(computeEligibleRosterSignature(rosterA)).toBe(
      computeEligibleRosterSignature(rosterB),
    );
  });

  it("returns identical signature when only ineligible players change", () => {
    // A player without a number is ineligible — changing their name
    // must not change the signature.
    const rosterA: Player[] = [
      { name: "Jón", id: 10, number: 7 },
      { name: "NoNumber", id: 30 },
    ];
    const rosterB: Player[] = [
      { name: "Jón", id: 10, number: 7 },
      { name: "Changed", id: 30 },
    ];
    expect(computeEligibleRosterSignature(rosterA)).toBe(
      computeEligibleRosterSignature(rosterB),
    );
  });

  // Genuine roster changes have different signatures.

  it("returns different signature when an eligible player is added", () => {
    const rosterBefore: Player[] = [{ name: "Jón", id: 10, number: 7 }];
    const rosterAfter: Player[] = [
      { name: "Jón", id: 10, number: 7 },
      { name: "Gunnar", id: 20, number: 9 },
    ];
    expect(computeEligibleRosterSignature(rosterBefore)).not.toBe(
      computeEligibleRosterSignature(rosterAfter),
    );
  });

  it("returns different signature when an eligible player's number changes", () => {
    const rosterBefore: Player[] = [{ name: "Jón", id: 10, number: 7 }];
    const rosterAfter: Player[] = [{ name: "Jón", id: 10, number: 10 }];
    expect(computeEligibleRosterSignature(rosterBefore)).not.toBe(
      computeEligibleRosterSignature(rosterAfter),
    );
  });

  it("returns different signature when a player gains a number (becomes eligible)", () => {
    const rosterBefore: Player[] = [
      { name: "Jón", id: 10 }, // no number → ineligible
    ];
    const rosterAfter: Player[] = [
      { name: "Jón", id: 10, number: 7 }, // now eligible
    ];
    expect(computeEligibleRosterSignature(rosterBefore)).toBe("");
    expect(computeEligibleRosterSignature(rosterAfter)).toBe('["10:Jón:7"]');
  });

  it("returns different signature when an eligible player is removed", () => {
    const rosterBefore: Player[] = [
      { name: "Jón", id: 10, number: 7 },
      { name: "Gunnar", id: 20, number: 9 },
    ];
    const rosterAfter: Player[] = [{ name: "Jón", id: 10, number: 7 }];
    expect(computeEligibleRosterSignature(rosterBefore)).not.toBe(
      computeEligibleRosterSignature(rosterAfter),
    );
  });
});
