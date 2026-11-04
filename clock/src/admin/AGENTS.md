# React administration

Administration lives inside the [Clock Vite app](../../AGENTS.md) at `/admin`.
There is no separate Nuxt app, manifest, install or dev server. Use Clock's
commands, generated-client preparation and
[environment selection](../../../docs/environment.md#firebase-selection).
Default development targets shared staging; use emulators for mutating tests.

`AdminRoute` gates the UI with Firebase Auth and `admins/{uid}`. Trusted callable
authorization and RTDB/Storage rules remain the security boundary.

| Task                                                      | Source / canonical reference to update                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Users, venue grants, disabling and invitations            | `ManageUsers`, `InvitationTable`, `adminFunctions`; [Functions guide](../../../functions/AGENTS.md)           |
| Venue/screen metadata and home-team/pitch configuration   | `LocationsManager`; [venue model and leaf-save rules](../../../docs/clock/state-and-venues.md#venue-metadata) |
| Published web mapping, templates, local calibration draft | `PerimeterMappingEditor`; [mapping operations](../../../docs/clock/perimeter-operations.md)                   |

Admin callables are `listUsers` and `adminWrite`; do not bypass their current
server checks with direct Auth/Admin SDK access. Invitation processing grants
approved locations before removing matching invitations. Metadata edits are
separate from `states/{location}` match commands and their audit stream.

Read venue configuration from validated `venues`, including perimeter-only
venues, rather than flattened scoreboard `screens`. Preserve unknown venue,
screen/config/style and mapping metadata, raw screen child keys, aliases and
array indices; reads never migrate data. Publish mapping revisions from validated
drafts, with explicit geometry and unchanged compatibility keys. No mapping means
unconfigured web output, never Resolume or guessed geometry.

Relevant checks are Clock's `src/admin` Vitest suites and emulator-backed
metadata/mapping journeys. Follow [Clock testing](../../../docs/clock/testing.md)
for SDK readiness, independent sessions and source-versus-browser limits.
Capture proof under ignored `screenshots/`, never in source image directories;
see [screenshot handling](../../../docs/screenshots.md).
