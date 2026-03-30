import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { signOut } from "firebase/auth";

vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("../../firebase", () => ({
  auth: {},
  database: {},
  functions: {},
}));

vi.mock("../../contexts/LocalStateContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../useAdminData", () => ({
  useAdminData: vi.fn(),
}));

vi.mock("../ManageUsers", () => ({
  ManageUsers: ({
    users,
    locations,
  }: {
    users: unknown[];
    locations: unknown[];
    onRefresh: () => void;
  }) => (
    <div data-testid="manage-users">
      ManageUsers users={users.length} locations={locations.length}
    </div>
  ),
}));

vi.mock("../InvitationTable", () => ({
  InvitationTable: ({
    invitations,
    locations,
  }: {
    invitations: unknown[];
    locations: unknown[];
  }) => (
    <div data-testid="invitation-table">
      InvitationTable invitations={invitations.length} locations=
      {locations.length}
    </div>
  ),
}));

import { useAuth } from "../../contexts/LocalStateContext";
import { useAdminData } from "../useAdminData";
import { AdminPortal } from "../AdminPortal";

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseAdminData = vi.mocked(useAdminData);

function setupDefaults(
  overrides: Partial<ReturnType<typeof useAdminData>> = {},
) {
  mockedUseAuth.mockReturnValue({
    isLoaded: true,
    isEmpty: false,
    uid: "admin1",
    email: "admin@test.com",
  });
  mockedUseAdminData.mockReturnValue({
    users: [],
    invitations: [],
    locations: [],
    loading: false,
    error: null,
    refreshUsers: vi.fn(),
    ...overrides,
  });
}

describe("AdminPortal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner while data loads", () => {
    setupDefaults({ loading: true });

    render(<AdminPortal />);

    expect(screen.getByText("Hleð gögnum...")).toBeInTheDocument();
    expect(screen.queryByTestId("manage-users")).not.toBeInTheDocument();
    expect(screen.queryByTestId("invitation-table")).not.toBeInTheDocument();
  });

  it("shows error message when data fetch fails", () => {
    const refreshUsers = vi.fn();
    setupDefaults({
      error: "Villa við að sækja notendur",
      refreshUsers,
    });

    render(<AdminPortal />);

    expect(screen.getByText("Villa við að sækja notendur")).toBeInTheDocument();
    expect(screen.getByText("Reyna aftur")).toBeInTheDocument();
  });

  it("clicking retry button calls refreshUsers", () => {
    const refreshUsers = vi.fn();
    setupDefaults({
      error: "Villa við að sækja notendur",
      refreshUsers,
    });

    render(<AdminPortal />);

    fireEvent.click(screen.getByText("Reyna aftur"));
    expect(refreshUsers).toHaveBeenCalledTimes(1);
  });

  it("shows user table and invitation table when data is loaded", () => {
    setupDefaults({
      users: [
        {
          uid: "u1",
          email: "user@test.com",
          displayName: "Test User",
          lastSignIn: "2024-01-01",
          createdAt: "2024-01-01",
          locations: { vikinni: true },
          disabled: false,
        },
      ],
      invitations: [
        {
          id: "inv1",
          email: "invited@test.com",
          locations: { vikinni: true },
          createdBy: "admin@test.com",
          createdAt: 1700000000000,
        },
      ],
      locations: [{ key: "vikinni", label: "Víkin" }],
    });

    render(<AdminPortal />);

    expect(screen.getByTestId("manage-users")).toBeInTheDocument();
    expect(screen.getByTestId("invitation-table")).toBeInTheDocument();
    expect(screen.queryByText("Hleð gögnum...")).not.toBeInTheDocument();
  });

  it("displays the header with title and email badge", () => {
    setupDefaults();

    render(<AdminPortal />);

    expect(screen.getByText("Vikes Klukka — Stjórnborð")).toBeInTheDocument();
    expect(screen.getByText("admin@test.com")).toBeInTheDocument();
  });

  it("renders Til baka link pointing to /", () => {
    setupDefaults();

    render(<AdminPortal />);

    const backLink = screen.getByText("Til baka");
    expect(backLink.closest("a")).toHaveAttribute("href", "/");
  });

  it("logout button calls signOut", () => {
    setupDefaults();

    render(<AdminPortal />);

    fireEvent.click(screen.getByText("Útskrá"));
    expect(signOut).toHaveBeenCalled();
  });

  it("shows both error and data when error is present but loading is false", () => {
    setupDefaults({
      error: "Some error",
      users: [
        {
          uid: "u1",
          email: "u@t.com",
          displayName: undefined,
          lastSignIn: undefined,
          createdAt: "2024-01-01",
          locations: {},
          disabled: false,
        },
      ],
    });

    render(<AdminPortal />);

    expect(screen.getByText("Some error")).toBeInTheDocument();
    expect(screen.getByTestId("manage-users")).toBeInTheDocument();
  });

  it("displays fallback badge when email is not available", () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isEmpty: false,
      uid: "admin1",
    });
    mockedUseAdminData.mockReturnValue({
      users: [],
      invitations: [],
      locations: [],
      loading: false,
      error: null,
      refreshUsers: vi.fn(),
    });

    render(<AdminPortal />);

    expect(screen.getByText("Stjórnandi")).toBeInTheDocument();
  });
});
