## Purpose

Defines how administrators publish validated venue geometry that maps reusable logical perimeter strips onto one exact-size packed display canvas for browser rendering.

## ADDED Requirements

### Requirement: Published venue perimeter configuration
The system SHALL store a versioned, revision-identified perimeter display configuration with the public venue definition. The configuration SHALL declare renderer type, output canvas dimensions, logical screens with native dimensions, and source-to-destination regions.

#### Scenario: Venue publishes a web mapping
- **WHEN** an administrator publishes a valid configuration with renderer type `web`
- **THEN** public displays receive the complete configuration atomically and the venue becomes eligible for Perimeter selection

#### Scenario: Venue remains on Resolume
- **WHEN** a venue is configured with renderer type `resolume`
- **THEN** its configuration does not make a browser Perimeter option available

### Requirement: Administrative mapping editor
The admin interface SHALL provide a perimeter mapping editor that can configure the packed canvas, logical screen dimensions, source rectangles, destination rectangles, rotation, horizontal and vertical flips, intentional scaling, intentional output clipping, and overlap ordering.

#### Scenario: Administrator edits geometry
- **WHEN** an administrator changes mapping values or manipulates regions visually
- **THEN** the editor updates a local draft and does not alter the published renderer configuration until Publish is confirmed

#### Scenario: Administrator publishes geometry
- **WHEN** an administrator explicitly publishes a valid draft
- **THEN** the system writes one complete configuration with a new revision identifier

### Requirement: Mapping visualization and templates
The editor SHALL visualize each logical source strip and the packed destination canvas with corresponding region identities, and SHALL provide identity-mapping, horizontal-split, and calibration-pattern tools.

#### Scenario: Region is selected
- **WHEN** an administrator selects a region in either the source or destination visualization
- **THEN** the corresponding region and its numeric source and destination coordinates are identifiable in both views

#### Scenario: Identity mapping is requested
- **WHEN** an administrator applies the identity-mapping template to a logical screen and compatible output area
- **THEN** the draft contains a full-source, unscaled destination region for that screen

#### Scenario: Calibration preview is enabled
- **WHEN** an administrator enables calibration preview
- **THEN** the preview distinguishes logical screen IDs, source coordinates, region boundaries, and destination positions

### Requirement: Complete source coverage validation
The system MUST reject publication when any logical screen has uncovered or multiply covered source pixels unless each exceptional duplicated region is explicitly allowed.

#### Scenario: Source contains a gap
- **WHEN** the union of a logical screen's source rectangles does not cover its complete native area
- **THEN** publication is blocked with a validation error identifying the uncovered screen

#### Scenario: Source is duplicated without permission
- **WHEN** source rectangles overlap and intentional duplication is not enabled for the affected regions
- **THEN** publication is blocked with a validation error identifying the overlap

### Requirement: Rectangle and transform validation
The system MUST reject publication when coordinates or dimensions are fractional or non-positive, source rectangles exceed their logical screen, rotation is unsupported, destination regions exceed the output without explicit clipping, dimensions imply scaling without explicit scaling, or destination regions overlap without explicit overlap ordering.

#### Scenario: Captured calibrated region is explicit
- **WHEN** a destination is intentionally scaled or clipped and the corresponding permissions are enabled
- **THEN** validation accepts the region and preserves its exact numeric coordinates

#### Scenario: Accidental scaling is detected
- **WHEN** source and destination dimensions differ without explicit scaling permission
- **THEN** publication is blocked and the editor identifies the affected region

#### Scenario: Destination overlap is ambiguous
- **WHEN** destination rectangles overlap without an explicit overlap allowance and ordering
- **THEN** publication is blocked and the editor identifies the conflicting regions

### Requirement: Exact framebuffer rendering
The web perimeter renderer SHALL use the published canvas dimensions as its backing framebuffer and SHALL draw each region from the declared logical-screen source rectangle into the declared destination rectangle, preserving configured clipping, scaling, rotation, flips, and ordering.

#### Scenario: Packed mapping is rendered
- **WHEN** a valid published mapping contains multiple regions from one or more logical screens
- **THEN** each source region appears at its exact configured destination and all unmapped output pixels are black

#### Scenario: Destination extends beyond the framebuffer
- **WHEN** a region explicitly permits output clipping and extends outside the canvas
- **THEN** the renderer clips it at the framebuffer boundary without changing its configured transform

### Requirement: Atomic mapping replacement
The renderer SHALL validate a newly published mapping before using it and MUST retain its last valid mapping if the new revision is invalid or cannot be prepared.

#### Scenario: New mapping is valid
- **WHEN** a new mapping revision passes validation and its output surface is ready
- **THEN** the renderer replaces the prior mapping in one rendered transition

#### Scenario: New mapping is invalid
- **WHEN** a new mapping revision fails runtime validation
- **THEN** the renderer keeps the last valid mapping and reports the configuration error

### Requirement: Location updates preserve perimeter configuration
Administrative edits to unrelated venue properties MUST preserve the venue's published perimeter configuration unless the administrator is explicitly publishing a perimeter mapping change.

#### Scenario: Scoreboard screen is edited
- **WHEN** an administrator changes a scoreboard screen name, size, or font setting for a venue with a published perimeter mapping
- **THEN** the saved venue retains the existing perimeter mapping unchanged
