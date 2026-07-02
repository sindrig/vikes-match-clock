import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TeamSelector from "./TeamSelector";

vi.mock("../contexts/FirebaseStateContext", () => ({
  useMatch: vi.fn(),
  useClubOverrides: vi.fn(),
}));

import { useMatch, useClubOverrides } from "../contexts/FirebaseStateContext";

const mockedUseMatch = vi.mocked(useMatch);
const mockedUseClubOverrides = vi.mocked(useClubOverrides);

describe("TeamSelector", () => {
  const mockUpdateMatch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseMatch.mockReturnValue({
      match: {
        homeTeam: "",
        awayTeam: "",
      },
      updateMatch: mockUpdateMatch,
    } as unknown as ReturnType<typeof useMatch>);

    mockedUseClubOverrides.mockReturnValue({
      clubOverrides: {
        customTeam: {
          name: "Kjánaprik",
          clubId: "-1",
          logoUrl: "https://example.com/kjanaprik.png",
          isOverride: false,
        },
      },
      saveClubOverride: vi.fn(),
      deleteClubOverride: vi.fn(),
    });
  });

  it("renders custom override teams in the select options", () => {
    render(<TeamSelector teamAttrName="homeTeam" />);

    expect(
      screen.getByRole("option", { name: "Kjánaprik" }),
    ).toBeInTheDocument();
  });

  it("updates the selected team when choosing a custom override team", () => {
    render(<TeamSelector teamAttrName="homeTeam" />);

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Kjánaprik" },
    });

    expect(mockUpdateMatch).toHaveBeenCalledWith({ homeTeam: "Kjánaprik" });
  });
});
