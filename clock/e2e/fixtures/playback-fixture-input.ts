// Pure test-only admission. Importing this module performs no fixture I/O.
export type PlaybackFixtureRole = "controller" | "display" | "observer";
export type PlaybackFixtureInput = Readonly<{
  fixtureId: string;
  venue: string;
  deniedVenue: string;
  role: PlaybackFixtureRole;
}>;

export function parsePlaybackFixtureInput(url: URL): PlaybackFixtureInput {
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
    url.pathname !== "/e2e/fixtures/playback-occurrences.html" ||
    [...params.keys()].length !== 4 ||
    ["fixture", "prefix", "denied", "role"].some(
      (key) => params.getAll(key).length !== 1,
    ) ||
    !fixtureId ||
    fixtureId.trim() !== fixtureId ||
    !/^[a-f0-9]{10}-[0-9]{1,8}-[a-f0-9]{16}$/.test(fixtureId) ||
    venue !== `playback-${fixtureId}` ||
    deniedVenue !== `playback-denied-${fixtureId}` ||
    (role !== "controller" && role !== "display" && role !== "observer")
  ) {
    throw new Error("Invalid playback fixture identity.");
  }
  return Object.freeze({ fixtureId, venue, deniedVenue, role });
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid playback fixture target.");
  return value as Record<string, unknown>;
}

export function assertPlaybackFixtureTarget(value: unknown): void {
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
  ) {
    throw new Error("Playback fixture requires served local emulators.");
  }
}
