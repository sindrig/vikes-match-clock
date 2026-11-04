# Web Perimeter Mapping Measurement

All venues use the `web` perimeter renderer; Resolume is unsupported. Use this
process for separately authorized mapping changes. Physical qualification for
the gateway retirement (#240) remains **HOLD**; no mapping is changed by it.

1. Measure every physical logical strip's native pixel width and height from the LED processor or an approved mapping capture. Record stable IDs and the legacy base/overlay lane keys.
2. Measure the packed Windows desktop framebuffer. Use the exact Chromium canvas width and height, not the browser viewport CSS size.
3. Capture the source-to-output placement for each strip. Record integer `x`, `y`, `width`, and `height` values and any intentional rotation, flip, scaling, clipping, or overlap.
4. Build the configuration with the mapping editor. Use Identity mapping for an unmodified strip and Horizontal split when one source is divided across output regions.
5. Enable calibration preview and compare the region labels, source coordinates, and destination boundaries on the physical output. Correct measurements before publishing.
6. Publish one complete document. The revision ID must change for every publication; do not edit a published document in place.
7. Validate the exported document with `validatePerimeterMapping` and confirm every logical source has exact pixel coverage. A valid published web mapping exposes the display target; referenced media also needs immutable Storage generations (including legacy backfill) before playback.
8. Preserve numeric compatibility keys, existing ad layouts, overlays, media
   pairs and Storage objects. Captured Resolume mappings are historical
   evidence, not a supported renderer or rollback target.

The checked-in example fixture is `clock/src/perimeter/fixtures.ts`. Replace the second-stadium example values with measured values before production publication.

The [mapping editor and runtime reference](../docs/clock/perimeter-operations.md)
owns software behavior. Save calibration captures under ignored `screenshots/`;
never commit them. Use [screenshot handling](../docs/screenshots.md) for authorized
hosting; existing source images are a separate reviewed input.
