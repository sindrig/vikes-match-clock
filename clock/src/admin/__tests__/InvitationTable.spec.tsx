import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import type { Invitation, LocationDef } from "../useAdminData";

vi.mock("../adminFunctions", () => ({
  deleteInvitation: vi.fn(),
}));

vi.mock("../InvitationModal", () => ({
  InvitationModal: ({
    open,
    mode,
  }: {
    open: boolean;
    onClose: () => void;
    mode: string;
    invitation: Invitation | null;
    locations: LocationDef[];
  }) =>
    open ? (
      <div data-testid="invitation-modal">InvitationModal mode={mode}</div>
    ) : null,
}));

import { deleteInvitation } from "../adminFunctions";
import { InvitationTable } from "../InvitationTable";

const mockedDeleteInvitation = vi.mocked(deleteInvitation);

const testLocations: LocationDef[] = [
  { key: "vikinni", label: "Víkin" },
  { key: "hasteinsvollur", label: "Hásteinsvöllur" },
];

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "inv1",
    email: "invited@test.com",
    locations: { vikinni: true },
    createdBy: "admin@test.com",
    createdAt: 1700000000000,
    ...overrides,
  };
}

describe("InvitationTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeleteInvitation.mockResolvedValue(undefined);
  });

  it("shows empty state when no invitations", () => {
    render(<InvitationTable invitations={[]} locations={testLocations} />);

    expect(screen.getByText("Engar boðskortur")).toBeInTheDocument();
  });

  it("renders the 'Bjóða notanda' button", () => {
    render(<InvitationTable invitations={[]} locations={testLocations} />);

    expect(screen.getByText("Bjóða notanda")).toBeInTheDocument();
  });

  it("renders invitation rows with email", () => {
    const invitations = [
      makeInvitation({ id: "inv1", email: "alice@test.com" }),
      makeInvitation({ id: "inv2", email: "bob@test.com" }),
    ];

    render(
      <InvitationTable invitations={invitations} locations={testLocations} />,
    );

    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
  });

  it("renders location tags for invitations", () => {
    const invitations = [
      makeInvitation({
        id: "inv1",
        locations: { vikinni: true, hasteinsvollur: true },
      }),
    ];

    render(
      <InvitationTable invitations={invitations} locations={testLocations} />,
    );

    expect(screen.getByText("Víkin")).toBeInTheDocument();
    expect(screen.getByText("Hásteinsvöllur")).toBeInTheDocument();
  });

  it("shows 'Enginn' when invitation has no active locations", () => {
    const invitations = [makeInvitation({ id: "inv1", locations: {} })];

    render(
      <InvitationTable invitations={invitations} locations={testLocations} />,
    );

    expect(screen.getByText("Enginn")).toBeInTheDocument();
  });

  it("'Bjóða notanda' button opens modal in create mode", () => {
    render(<InvitationTable invitations={[]} locations={testLocations} />);

    expect(screen.queryByTestId("invitation-modal")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Bjóða notanda"));

    expect(screen.getByTestId("invitation-modal")).toBeInTheDocument();
    expect(screen.getByText("InvitationModal mode=create")).toBeInTheDocument();
  });

  it("edit button opens modal in edit mode", () => {
    const invitations = [makeInvitation({ id: "inv1", email: "a@b.com" })];

    render(
      <InvitationTable invitations={invitations} locations={testLocations} />,
    );

    fireEvent.click(screen.getByText("Breyta"));

    expect(screen.getByTestId("invitation-modal")).toBeInTheDocument();
    expect(screen.getByText("InvitationModal mode=edit")).toBeInTheDocument();
  });

  it("delete button opens confirmation modal with email", () => {
    const invitations = [
      makeInvitation({ id: "inv1", email: "deleteme@test.com" }),
    ];

    render(
      <InvitationTable invitations={invitations} locations={testLocations} />,
    );

    fireEvent.click(screen.getByText("Eyða"));

    expect(screen.getByText("Eyða boði")).toBeInTheDocument();
    // Email appears both in the table row and in the confirmation modal <strong>
    const emailMatches = screen.getAllByText("deleteme@test.com");
    expect(emailMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("confirming delete calls deleteInvitation with correct id", async () => {
    const invitations = [
      makeInvitation({ id: "inv-abc", email: "deleteme@test.com" }),
    ];

    render(
      <InvitationTable invitations={invitations} locations={testLocations} />,
    );

    // Open delete confirmation
    fireEvent.click(screen.getByText("Eyða"));

    // Find and click the confirm delete button (red primary button in the modal footer)
    const confirmButtons = screen.getAllByText("Eyða");
    // The last "Eyða" is the confirm button in the modal footer
    const confirmButton = confirmButtons[confirmButtons.length - 1];
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockedDeleteInvitation).toHaveBeenCalledWith("inv-abc");
    });
  });

  it("cancel button in delete modal closes it", async () => {
    const invitations = [
      makeInvitation({ id: "inv1", email: "test@test.com" }),
    ];

    render(
      <InvitationTable invitations={invitations} locations={testLocations} />,
    );

    fireEvent.click(screen.getByText("Eyða"));
    expect(screen.getByText("Eyða boði")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Hætta við"));

    // rsuite Modal uses animations, so wait for it to unmount
    await waitFor(() => {
      expect(screen.queryByText("Eyða boði")).not.toBeInTheDocument();
    });
  });

  it("shows error when delete fails", async () => {
    mockedDeleteInvitation.mockRejectedValue(new Error("Network error"));
    const invitations = [
      makeInvitation({ id: "inv1", email: "fail@test.com" }),
    ];

    render(
      <InvitationTable invitations={invitations} locations={testLocations} />,
    );

    // Open delete confirmation and confirm
    fireEvent.click(screen.getByText("Eyða"));
    const confirmButtons = screen.getAllByText("Eyða");
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("renders column headers", () => {
    const invitations = [makeInvitation()];

    render(
      <InvitationTable invitations={invitations} locations={testLocations} />,
    );

    expect(screen.getByText("Netfang")).toBeInTheDocument();
    expect(screen.getByText("Skjáir")).toBeInTheDocument();
    expect(screen.getByText("Stofnað af")).toBeInTheDocument();
    expect(screen.getByText("Aðgerðir")).toBeInTheDocument();
  });
});
