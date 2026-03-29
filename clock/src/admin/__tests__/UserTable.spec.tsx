import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { AdminUser, LocationDef } from "../useAdminData";

vi.mock("../UserEditModal", () => ({
  UserEditModal: ({
    open,
    user,
  }: {
    open: boolean;
    onClose: () => void;
    user: AdminUser | null;
    locations: LocationDef[];
  }) =>
    open ? (
      <div data-testid="user-edit-modal">
        Editing {user?.email ?? "unknown"}
      </div>
    ) : null,
}));

import { UserTable } from "../UserTable";

const testLocations: LocationDef[] = [
  { key: "vikinni", label: "Víkin" },
  { key: "hasteinsvollur", label: "Hásteinsvöllur" },
];

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    uid: "uid1",
    email: "user@test.com",
    displayName: "Test User",
    lastSignIn: "2024-01-15T10:00:00Z",
    createdAt: "2024-01-01T00:00:00Z",
    locations: { vikinni: true },
    ...overrides,
  };
}

describe("UserTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no users", () => {
    render(<UserTable users={[]} locations={testLocations} />);

    expect(screen.getByText("Engir notendur skráðir")).toBeInTheDocument();
  });

  it("renders user rows with email", () => {
    const users = [
      makeUser({ uid: "u1", email: "alice@test.com" }),
      makeUser({ uid: "u2", email: "bob@test.com" }),
    ];

    render(<UserTable users={users} locations={testLocations} />);

    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
  });

  it("renders location tags for users", () => {
    const users = [
      makeUser({
        uid: "u1",
        email: "alice@test.com",
        locations: { vikinni: true, hasteinsvollur: true },
      }),
    ];

    render(<UserTable users={users} locations={testLocations} />);

    expect(screen.getByText("Víkin")).toBeInTheDocument();
    expect(screen.getByText("Hásteinsvöllur")).toBeInTheDocument();
  });

  it("shows 'Enginn' when user has no active locations", () => {
    const users = [makeUser({ uid: "u1", locations: {} })];

    render(<UserTable users={users} locations={testLocations} />);

    expect(screen.getByText("Enginn")).toBeInTheDocument();
  });

  it("shows dash for missing email", () => {
    const users = [makeUser({ uid: "u1", email: undefined })];

    render(<UserTable users={users} locations={testLocations} />);

    // The table renders "—" for missing email and displayName
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("edit button opens the user edit modal", () => {
    const users = [makeUser({ uid: "u1", email: "alice@test.com" })];

    render(<UserTable users={users} locations={testLocations} />);

    expect(screen.queryByTestId("user-edit-modal")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Breyta"));

    expect(screen.getByTestId("user-edit-modal")).toBeInTheDocument();
    expect(screen.getByText("Editing alice@test.com")).toBeInTheDocument();
  });

  it("renders column headers", () => {
    const users = [makeUser()];

    render(<UserTable users={users} locations={testLocations} />);

    expect(screen.getByText("Netfang")).toBeInTheDocument();
    expect(screen.getByText("Nafn")).toBeInTheDocument();
    expect(screen.getByText("Skjáir")).toBeInTheDocument();
    expect(screen.getByText("Aðgerðir")).toBeInTheDocument();
  });

  it("uses location key as fallback when location label not found", () => {
    const users = [
      makeUser({
        uid: "u1",
        locations: { unknown_loc: true },
      }),
    ];

    render(<UserTable users={users} locations={testLocations} />);

    expect(screen.getByText("unknown_loc")).toBeInTheDocument();
  });
});
