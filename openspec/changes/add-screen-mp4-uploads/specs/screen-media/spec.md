# Spec Delta

## Purpose

Allow stadium operators to upload and present reusable main-screen media independently of the perimeter display.

## ADDED Requirements

### Requirement: MP4 upload preserves video content

The screen media library SHALL accept MP4 files alongside existing JPG, PNG, and GIF images. MP4 files MUST retain their filename and original bytes even when automatic image compression is enabled.

#### Scenario: Upload MP4 with compression enabled

- **WHEN** an authenticated operator uploads an MP4 with automatic compression enabled
- **THEN** the original video is uploaded with MP4 content type and its original filename
- **AND** existing image uploads continue to work

### Requirement: Media library recognizes and previews MP4 videos

The media library SHALL recognize MP4 filename extensions case-insensitively and display bounded, silent, non-playing video thumbnails. Selecting an MP4 SHALL create a looping video asset usable by the normal show-now and queue controls.

#### Scenario: Select uppercase MP4

- **WHEN** an operator selects a library file named `sponsor.MP4`
- **THEN** it is previewed as video rather than a broken image
- **AND** it is selected as a looping video asset

### Requirement: Uploaded screen videos loop silently

Videos selected from the media library SHALL autoplay muted and inline, looping until cleared, replaced, or advanced by the queue's configured duration. A video's natural end MUST NOT clear it or advance the queue. Existing goal-celebration and YouTube completion behavior MUST remain unchanged.

#### Scenario: Show video directly

- **WHEN** an operator shows an uploaded MP4 with Sýna
- **THEN** the main screen plays it muted and loops until an explicit clear or replacement

#### Scenario: Loop short video during timed queue item

- **WHEN** a queued MP4 ends before the queue's configured duration
- **THEN** playback loops without advancing early
- **AND** the queue advances when its configured duration expires

#### Scenario: Existing goal video ends

- **WHEN** a non-looping goal-celebration video ends
- **THEN** its existing conditional completion behavior is preserved
