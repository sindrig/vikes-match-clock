# Proposal

## Why

Operators cannot upload MP4 content for the main scoreboard because the media uploader only accepts images. Uploaded videos should be usable like other screen media and loop silently without changing perimeter playback.

## What Changes

- Accept MP4 uploads alongside existing image formats and bypass image compression for videos.
- Render bounded, non-playing video thumbnails and recognize `.mp4` case-insensitively.
- Mark media-library videos for muted, inline, looping playback until cleared or replaced; existing queue duration controls still advance timed playback.
- Preserve existing goal-celebration and YouTube completion behavior.
- Cover upload, selection, playback, and queue timing with regression tests and browser verification.

## Capabilities

### New Capabilities

- `screen-media`: Uploading, browsing, and presenting image and looping MP4 media on the main scoreboard.

### Modified Capabilities

None.

## Impact

Changes are limited to the React screen media uploader, library, asset types/player, tests, and `clock/AGENTS.md`. Firebase remains authoritative; existing Storage paths and permissions are reused. No backend, infrastructure, perimeter, dependency, or transcoding changes are required.
