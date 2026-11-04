import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { User } from "firebase/auth";
import { onValue, ref, type DataSnapshot } from "firebase/database";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import ReadNotice from "../controller/ReadNotice";
import { firebaseAuth } from "../firebaseAuth";
import { LocalStateProvider, useLocalState } from "./LocalStateContext";
import { INITIAL_DELIVERY_DEADLINE_MS } from "./subscriptionRead";

vi.mock("../firebase", () => ({ database: {} }));
vi.mock("firebase/database", () => ({ ref: vi.fn(), onValue: vi.fn() }));
vi.mock("../firebaseAuth", () => ({
  firebaseAuth: {
    onAuthStateChanged: vi.fn(),
    userToAuthState: vi.fn(),
    getCurrentUser: vi.fn(),
    logout: vi.fn(),
  },
}));

function account(uid: string): User {
  return {
    uid,
    displayName: null,
    email: `${uid}@example.test`,
    phoneNumber: null,
    photoURL: null,
    providerId: "firebase",
    emailVerified: false,
    isAnonymous: false,
    metadata: {},
    providerData: [],
    refreshToken: "emulator-only",
    tenantId: null,
    delete: () => Promise.resolve(),
    reload: () => Promise.resolve(),
    getIdToken: () => Promise.resolve("emulator-only"),
    getIdTokenResult: () => Promise.reject(new Error("unused")),
    toJSON: () => ({ uid }),
  };
}
let authChanged: (user: User | null) => void;
let sdkUser: User | null;
let api: ReturnType<typeof useLocalState>;
const subscriptions: {
  path: string;
  active: boolean;
  receive: (snapshot: DataSnapshot) => unknown;
  cancel?: (error: Error) => unknown;
}[] = [];
function Capture() {
  const value = useLocalState();
  useLayoutEffect(() => {
    api = value;
  });
  return (
    <ReadNotice status={value.availableStatus} retry={value.retryAvailable} />
  );
}
function mount() {
  render(
    <LocalStateProvider>
      <Capture />
    </LocalStateProvider>,
  );
}
function grant() {
  const entry = subscriptions
    .filter((item) => item.active && item.path === `auth/${sdkUser?.uid}`)
    .at(-1);
  if (!entry) throw new Error("No active grant subscription");
  return entry;
}
function deliver(value: unknown) {
  grant().receive({ val: () => value } as DataSnapshot);
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  subscriptions.length = 0;
  sdkUser = null;
  vi.mocked(ref).mockImplementation((_, path) => path as never);
  vi.mocked(onValue).mockImplementation((reference, receive, cancel) => {
    const entry = {
      path: String(reference),
      active: true,
      receive,
      cancel: typeof cancel === "function" ? cancel : undefined,
    };
    subscriptions.push(entry);
    return () => {
      entry.active = false;
    };
  });
  vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((callback) => {
    authChanged = (user) => {
      sdkUser = user;
      callback(user);
    };
    authChanged(null);
    return vi.fn();
  });
  vi.mocked(firebaseAuth.userToAuthState).mockImplementation((user) => ({
    isLoaded: true,
    isEmpty: !user,
    uid: user?.uid,
  }));
  vi.mocked(firebaseAuth.getCurrentUser).mockImplementation(() => sdkUser);
  vi.mocked(firebaseAuth.logout).mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("bounds missing grant delivery, offers read retry and treats null as loaded empty", () => {
  vi.useFakeTimers();
  mount();
  act(() => authChanged(account("A")));
  expect(api.available).toBeNull();
  act(() => {
    vi.advanceTimersByTime(INITIAL_DELIVERY_DEADLINE_MS);
  });
  expect(screen.getByRole("alert")).toHaveTextContent("aðgang að skjám");
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Reyna lestur aftur" }));
  });
  act(() => deliver(null));
  expect(api.available).toEqual([]);
  expect(api.availableStatus.phase).toBe("ready");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("rejects old grant data and errors even before React cleanup and through Auth ABA", () => {
  mount();
  act(() => authChanged(account("A")));
  act(() => deliver({ venueA: true, ignored: false }));
  const oldA = grant();
  act(() => {
    authChanged(account("B"));
    oldA.receive({ val: () => ({ stale: true }) } as DataSnapshot);
    oldA.cancel?.(new Error("private old failure"));
  });
  expect(api.available).toBeNull();
  act(() => deliver({ venueB: true }));
  expect(api.available).toEqual(["venueB"]);
  const oldB = grant();
  act(() => {
    authChanged(account("A"));
    authChanged(account("B"));
    oldB.receive({ val: () => ({ stale: true }) } as DataSnapshot);
    oldB.cancel?.(new Error("late"));
  });
  expect(api.availableStatus.phase).toBe("loading");
  expect(api.available).toBeNull();
  act(() => deliver({ current: true }));
  expect(api.available).toEqual(["current"]);
});

it("reattaches grant reads after a rejected logout without reviving the old attempt", async () => {
  mount();
  act(() => authChanged(account("A")));
  act(() => deliver({ first: true }));
  const old = grant();
  vi.mocked(firebaseAuth.logout).mockRejectedValue(
    new Error("sign-out failed"),
  );
  await act(async () => {
    await expect(api.logout()).rejects.toThrow("sign-out failed");
  });
  expect(api.availableStatus.phase).toBe("loading");
  act(() => {
    old.receive({ val: () => ({ stale: true }) } as DataSnapshot);
    old.cancel?.(new Error("late"));
    deliver({ fresh: true });
  });
  expect(api.available).toEqual(["fresh"]);
});
