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
    onRefresh: () => void;
  }) =>
    open ? (
      <div data-testid="user-edit-modal">
        Editing {user?.email ?? "unknown"}
      </div>
    ) : null,
}));

import { ManageUsers } from "../ManageUsers";

const testLocations: LocationDef[] = [
  { key: "vikinni", label: "Víkin" },
  { key: "hasteinsvollur", label: "Hásteinsvöllur" },
];

const noopRefresh = vi.fn();

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    uid: "uid1",
    email: "user@test.com",
    displayName: "Test User",
    lastSignIn: "2024-01-15T10:00:00Z",
    createdAt: "2024-01-01T00:00:00Z",
    locations: { vikinni: true },
    disabled: false,
    ...overrides,
  };
}

describe("ManageUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no enabled users", () => {
    render(
      <ManageUsers
        users={[]}
        locations={testLocations}
        onRefresh={noopRefresh}
      />,
    );

    expect(screen.getByText("Engir virkir notendur")).toBeInTheDocument();
  });

  it("renders user rows with email", () => {
    const users = [
      makeUser({ uid: "u1", email: "alice@test.com" }),
      makeUser({ uid: "u2", email: "bob@test.com" }),
    ];

    render(
      <ManageUsers
        users={users}
        locations={testLocations}
        onRefresh={noopRefresh}
      />,
    );

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

    render(
      <ManageUsers
        users={users}
        locations={testLocations}
        onRefresh={noopRefresh}
      />,
    );

    expect(screen.getByText("Víkin")).toBeInTheDocument();
    expect(screen.getByText("Hásteinsvöllur")).toBeInTheDocument();
  });

  it("shows 'Enginn' when user has no active locations", () => {
    const users = [makeUser({ uid: "u1", locations: {} })];

    render(
      <ManageUsers
        users={users}
        locations={testLocations}
        onRefresh={noopRefresh}
      />,
    );

    expect(screen.getByText("Enginn")).toBeInTheDocument();
  });

  it("shows dash for missing email", () => {
    const users = [makeUser({ uid: "u1", email: undefined })];

    render(
      <ManageUsers
        users={users}
        locations={testLocations}
        onRefresh={noopRefresh}
      />,
    );

    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("edit button opens the user edit modal", () => {
    const users = [makeUser({ uid: "u1", email: "alice@test.com" })];

    render(
      <ManageUsers
        users={users}
        locations={testLocations}
        onRefresh={noopRefresh}
      />,
    );

    expect(screen.queryByTestId("user-edit-modal")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Breyta"));

    expect(screen.getByTestId("user-edit-modal")).toBeInTheDocument();
    expect(screen.getByText("Editing alice@test.com")).toBeInTheDocument();
  });

  it("renders column headers", () => {
    const users = [makeUser()];

    render(
      <ManageUsers
        users={users}
        locations={testLocations}
        onRefresh={noopRefresh}
      />,
    );

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

    render(
      <ManageUsers
        users={users}
        locations={testLocations}
        onRefresh={noopRefresh}
      />,
    );

    expect(screen.getByText("unknown_loc")).toBeInTheDocument();
  });

  it("shows disabled users when switching to Óvirkir tab", () => {
    const users = [
      makeUser({ uid: "u1", email: "active@test.com", disabled: false }),
      makeUser({ uid: "u2", email: "blocked@test.com", disabled: true }),
    ];

    render(
      <ManageUsers
        users={users}
        locations={testLocations}
        onRefresh={noopRefresh}
      />,
    );

    // On Virkir tab, only active user visible
    expect(screen.getByText("active@test.com")).toBeInTheDocument();
    expect(screen.queryByText("blocked@test.com")).not.toBeInTheDocument();

    // Switch to Óvirkir tab
    fireEvent.click(screen.getByText("Óvirkir"));

    expect(screen.getByText("blocked@test.com")).toBeInTheDocument();
    expect(screen.queryByText("active@test.com")).not.toBeInTheDocument();
  });

  it("shows empty disabled state message on Óvirkir tab", () => {
    const users = [
      makeUser({ uid: "u1", email: "active@test.com", disabled: false }),
    ];

    render(
      <ManageUsers
        users={users}
        locations={testLocations}
        onRefresh={noopRefresh}
      />,
    );

    fireEvent.click(screen.getByText("Óvirkir"));

    expect(screen.getByText("Engir óvirkir notendur")).toBeInTheDocument();
  });

  it("sorts users by email in Icelandic locale", () => {
    const users = [
      makeUser({ uid: "u1", email: "zelda@test.com", disabled: false }),
      makeUser({ uid: "u2", email: "anna@test.com", disabled: false }),
      makeUser({ uid: "u3", email: "magnus@test.com", disabled: false }),
    ];

    render(
      <ManageUsers
        users={users}
        locations={testLocations}
        onRefresh={noopRefresh}
      />,
    );

    const cells = screen.getAllByRole("gridcell");
    const emailCells = cells.filter(
      (cell) =>
        cell.textContent === "anna@test.com" ||
        cell.textContent === "magnus@test.com" ||
        cell.textContent === "zelda@test.com",
    );

    expect(emailCells[0].textContent).toBe("anna@test.com");
    expect(emailCells[1].textContent).toBe("magnus@test.com");
    expect(emailCells[2].textContent).toBe("zelda@test.com");
  });
});
