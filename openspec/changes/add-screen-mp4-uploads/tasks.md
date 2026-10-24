# Tasks

## 1. Upload and library

- [x] 1.1 Accept MP4 without compression, preserve MIME type and filename, and verify mixed file uploads with uploader component tests.
- [x] 1.2 Render fixed-size video thumbnails, select case-insensitive MP4s as looping assets, and verify image/video library component tests.
- [x] 1.3 Preserve image-only sponsor slot selection and update media documentation in `clock/AGENTS.md`; verify targeted tests and documentation match behavior.

## 2. Playback

- [x] 2.1 Add optional looping asset metadata and muted inline looping without natural-end completion; verify player and asset regression tests preserve legacy video behavior.
- [x] 2.2 Verify looping videos still advance at queue duration using lifecycle regression tests and document this ownership in `clock/AGENTS.md`.

## 3. Integration verification

- [x] 3.1 Run formatting, lint, unit tests, and production build successfully.
- [x] 3.2 Verify MP4 upload, direct looping playback, clear, and timed queue progression in-browser with isolated test data.

Verification: 1,697 unit tests passed; lint, formatting, and production build
passed; both existing image-upload Playwright scenarios passed. An isolated
emulator browser session uploaded an MP4 with compression enabled, verified
muted inline autoplay and repeated loops, cleared it, then verified the 1 s
video looped four times before advancing at the configured 4 s queue duration.

## Workflow follow-up

- Commit and push the approved change to master, then monitor CI and production deployment to completion.
