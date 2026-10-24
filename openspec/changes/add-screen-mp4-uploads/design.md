# Design

## Context

See `proposal.md` for motivation. `UploadManager` restricts file extensions to images, `ImageList` already recognizes lowercase MP4 but renders every thumbnail as an image, and `VideoPlayer` completes non-thumbnail videos on their natural end. Goal videos share that player. Queue durations are already enforced independently by the generation-conditional `MatchLifecycle` coordinator.

## Goals / Non-Goals

**Goals:** Reuse existing Storage and queue paths while keeping looping local to media-library videos and preserving read-only display behavior.

**Non-Goals:** Transcoding, new playback controls, perimeter changes, or video support in the scoreboard's separate image-only sponsor slots.

## Decisions

- Add optional `loop` metadata to assets selected as videos in the library. The player uses it for muted inline looping and omits natural-end completion. This is preferable to looping every VIDEO asset, which would change goal celebrations. Existing records without the flag keep their behavior.
- Accept MP4 in the existing uploader on the Myndir tab and compress only non-GIF images. Advertisement/player-photo tabs remain image-only. Set `video/mp4` metadata even when the browser omits MIME type. Keep filename and Storage path conventions unchanged.
- Render video thumbnails with metadata preloading and no autoplay, using the same fixed contain-fit bounds as image thumbnails. Normalize filename extensions before selecting asset types.
- Leave authoritative queue duration and all Firebase state transitions unchanged. Timed queue advancement remains owned by `MatchLifecycle`, not by video rendering.

## Risks / Trade-offs

- [MP4 is a container, not a codec guarantee] → Support browser-decodable files only; recommend H.264 and do not promise conversion.
- [Static sponsor selectors share media folders] → Enable MP4 uploads only in Myndir, not the advertisement/player-photo tabs consumed by image-only slots.
- [Video end could bypass queue timing] → Regression-test ignored completion for looping videos and preserve completion for legacy goal videos.

## Migration Plan

No data migration or rule changes are needed. Deploy the normal frontend bundle; new library selections carry the optional flag. Roll back by reverting the frontend change; uploaded files remain in Storage.
