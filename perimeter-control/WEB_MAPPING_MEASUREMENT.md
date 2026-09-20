# Web Perimeter Mapping Measurement

Use this process before enabling a venue's `web` perimeter renderer.

1. Measure every physical logical strip's native pixel width and height from the LED processor or existing Resolume composition. Record stable IDs and the legacy base/overlay lane keys.
2. Measure the packed Windows desktop framebuffer. Use the exact Chromium canvas width and height, not the browser viewport CSS size.
3. Capture the source-to-output placement for each strip. Record integer `x`, `y`, `width`, and `height` values and any intentional rotation, flip, scaling, clipping, or overlap.
4. Build the configuration with the mapping editor. Use Identity mapping for an unmodified strip and Horizontal split when one source is divided across output regions.
5. Enable calibration preview and compare the region labels, source coordinates, and destination boundaries on the physical output. Correct measurements before publishing.
6. Publish one complete document. The revision ID must change for every publication; do not edit a published document in place.
7. Validate the exported document with `validatePerimeterMapping` and confirm every logical source has exact pixel coverage. A web venue is not selectable until the immutable media generations have also been backfilled.
8. Keep Víkin's captured configuration set to `renderer: "resolume"`; do not use the browser renderer as a replacement during the initial rollout.

The checked-in example fixture is `clock/src/perimeter/fixtures.ts`. Replace the second-stadium example values with measured values before production publication.
