import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ClubOverride } from "../types";
import { useClubLogo } from "./useClubLogo";

// Mock the FirebaseStateContext
vi.mock("../contexts/FirebaseStateContext", () => ({
  useClubOverrides: vi.fn(),
}));

import { useClubOverrides } from "../contexts/FirebaseStateContext";

describe("useClubLogo", () => {
  it("returns override URL when override exists for team name", () => {
    const overrides: Record<string, ClubOverride> = {
      "uuid-1": {
        name: "Víkingur R",
        clubId: "2492",
        logoUrl: "https://override.png",
        isOverride: true,
      },
    };

    vi.mocked(useClubOverrides).mockReturnValue({
      clubOverrides: overrides,
      saveClubOverride: vi.fn(),
      deleteClubOverride: vi.fn(),
    } as any);

    const { result } = renderHook(() => useClubLogo("Víkingur R"));
    expect(result.current).toBe("https://override.png");
  });

  it("returns bundled logo when no override exists", () => {
    vi.mocked(useClubOverrides).mockReturnValue({
      clubOverrides: {},
      saveClubOverride: vi.fn(),
      deleteClubOverride: vi.fn(),
    } as any);

    const { result } = renderHook(() => useClubLogo("Víkingur R"));
    // Víkingur R is in the bundled clubLogos
    expect(result.current).toBeDefined();
    expect(typeof result.current).toBe("string");
  });

  it("returns bundled logo when override exists but logoUrl is empty string", () => {
    const overrides: Record<string, ClubOverride> = {
      "uuid-1": {
        name: "Víkingur R",
        clubId: "2492",
        logoUrl: "",
        isOverride: true,
      },
    };

    vi.mocked(useClubOverrides).mockReturnValue({
      clubOverrides: overrides,
      saveClubOverride: vi.fn(),
      deleteClubOverride: vi.fn(),
    } as any);

    const { result } = renderHook(() => useClubLogo("Víkingur R"));
    // Should fall back to bundled logo since logoUrl is falsy
    expect(result.current).toBeDefined();
    expect(typeof result.current).toBe("string");
  });

  it("returns undefined for unknown team with no override and no bundled logo", () => {
    vi.mocked(useClubOverrides).mockReturnValue({
      clubOverrides: {},
      saveClubOverride: vi.fn(),
      deleteClubOverride: vi.fn(),
    } as any);

    const { result } = renderHook(() =>
      useClubLogo("NonexistentTeamXYZ123")
    );
    expect(result.current).toBeUndefined();
  });

  it("returns correct override when multiple overrides exist", () => {
    const overrides: Record<string, ClubOverride> = {
      "uuid-1": {
        name: "Víkingur R",
        clubId: "2492",
        logoUrl: "https://override1.png",
        isOverride: true,
      },
      "uuid-2": {
        name: "Breiðablik",
        clubId: "2094",
        logoUrl: "https://override2.png",
        isOverride: false,
      },
      "uuid-3": {
        name: "Fram",
        clubId: "2127",
        logoUrl: "https://override3.png",
        isOverride: true,
      },
    };

    vi.mocked(useClubOverrides).mockReturnValue({
      clubOverrides: overrides,
      saveClubOverride: vi.fn(),
      deleteClubOverride: vi.fn(),
    } as any);

    const result1 = renderHook(() => useClubLogo("Víkingur R"));
    expect(result1.result.current).toBe("https://override1.png");

    const result2 = renderHook(() => useClubLogo("Breiðablik"));
    expect(result2.result.current).toBe("https://override2.png");

    const result3 = renderHook(() => useClubLogo("Fram"));
    expect(result3.result.current).toBe("https://override3.png");
  });
});
