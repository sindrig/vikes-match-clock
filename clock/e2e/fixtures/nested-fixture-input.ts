// Pure test-only admission; importing this module performs no fixture I/O.
export type NestedFixtureRole = "controller" | "observer" | "anonymous";
export type NestedFixtureInput = Readonly<{
  fixtureId: string;
  venue: string;
  deniedVenue: string;
  role: NestedFixtureRole;
}>;

export function parseNestedFixtureInput(url: URL): NestedFixtureInput {
  const params = url.searchParams;
  const fixtureId = params.get("fixture");
  const venue = params.get("prefix");
  const deniedVenue = params.get("denied");
  const role = params.get("role");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== "/e2e/fixtures/nested-state.html" ||
    [...params.keys()].length !== 4 ||
    ["fixture", "prefix", "denied", "role"].some(
      (key) => params.getAll(key).length !== 1,
    ) ||
    !fixtureId ||
    fixtureId.trim() !== fixtureId ||
    !/^[a-f0-9]{10}-[0-9]{1,8}-[a-f0-9]{16}$/.test(fixtureId) ||
    venue !== `nested-${fixtureId}` ||
    deniedVenue !== `nested-denied-${fixtureId}` ||
    (role !== "controller" && role !== "observer" && role !== "anonymous")
  )
    throw new Error("Invalid nested fixture identity.");
  return Object.freeze({ fixtureId, venue, deniedVenue, role });
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid nested fixture target.");
  return value as Record<string, unknown>;
}

export function assertNestedFixtureTarget(value: unknown): void {
  const target = record(value);
  const auth = record(target.auth);
  if (
    target.compiledEmulator !== true ||
    target.projectId !== "vikes-match-clock-test" ||
    target.databaseURL !== "http://127.0.0.1:9000?ns=vikes-match-clock-test" ||
    target.storageBucket !== "vikes-match-clock-test.appspot.com" ||
    auth.host !== "127.0.0.1" ||
    auth.port !== 9099 ||
    auth.protocol !== "http"
  )
    throw new Error("Nested fixture requires served local emulators.");
}

export const nestedPairId = "11111111-1111-4111-8111-111111111111";

export function nestedMediaPaths(
  input: NestedFixtureInput,
): readonly [string, string, string, string] {
  const paths: [string, string, string, string] = [
    `${input.venue}/perimeter/base-left.gif`,
    `${input.venue}/perimeter/base-right.gif`,
    `${input.venue}/perimeter-overlays/${nestedPairId}/48/pair-left.gif`,
    `${input.venue}/perimeter-overlays/${nestedPairId}/40/pair-right.gif`,
  ];
  return Object.freeze(paths);
}
