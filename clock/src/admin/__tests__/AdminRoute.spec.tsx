import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("react-router-dom", () => ({
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) => (
    <div data-testid="navigate" data-to={to} data-replace={String(!!replace)} />
  ),
}));

vi.mock("../../contexts/LocalStateContext", () => ({
  useAuth: vi.fn(),
  useIsAdmin: vi.fn(),
}));

vi.mock("../AdminPortal", () => ({
  AdminPortal: () => <div data-testid="admin-portal">AdminPortal</div>,
}));

import { useAuth, useIsAdmin } from "../../contexts/LocalStateContext";
import { AdminRoute } from "../AdminRoute";

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseIsAdmin = vi.mocked(useIsAdmin);

describe("AdminRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to / when auth is empty (not authenticated)", () => {
    mockedUseAuth.mockReturnValue({ isLoaded: true, isEmpty: true });
    mockedUseIsAdmin.mockReturnValue(false);

    render(<AdminRoute />);

    const nav = screen.getByTestId("navigate");
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveAttribute("data-to", "/");
  });

  it("shows loading spinner when auth is not loaded", () => {
    mockedUseAuth.mockReturnValue({ isLoaded: false, isEmpty: true });
    mockedUseIsAdmin.mockReturnValue(false);

    render(<AdminRoute />);

    expect(screen.getByText("Hleð...")).toBeInTheDocument();
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-portal")).not.toBeInTheDocument();
  });

  it("shows access denied message when authenticated but not admin", () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isEmpty: false,
      uid: "user1",
      email: "user@test.com",
    });
    mockedUseIsAdmin.mockReturnValue(false);

    render(<AdminRoute />);

    expect(screen.getByText("Aðgangur bannaður")).toBeInTheDocument();
    expect(
      screen.getByText("Þú hefur ekki stjórnandaaðgang."),
    ).toBeInTheDocument();
    expect(screen.getByText("Til baka")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-portal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });

  it("renders AdminPortal when authenticated and admin", () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isEmpty: false,
      uid: "admin1",
      email: "admin@test.com",
    });
    mockedUseIsAdmin.mockReturnValue(true);

    render(<AdminRoute />);

    expect(screen.getByTestId("admin-portal")).toBeInTheDocument();
    expect(screen.queryByText("Aðgangur bannaður")).not.toBeInTheDocument();
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });

  it("access denied page has a link back to root", () => {
    mockedUseAuth.mockReturnValue({
      isLoaded: true,
      isEmpty: false,
      uid: "user1",
    });
    mockedUseIsAdmin.mockReturnValue(false);

    render(<AdminRoute />);

    const link = screen.getByText("Til baka");
    expect(link).toHaveAttribute("href", "/");
  });
});
