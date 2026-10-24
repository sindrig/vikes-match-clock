import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import VideoPlayer from "./VideoPlayer";

function getVideo(container: HTMLElement): HTMLVideoElement {
  const video = container.querySelector("video");
  if (!video) throw new Error("Expected a video element");
  return video;
}

describe("VideoPlayer", () => {
  it("autoplays uploaded looping videos muted and inline without reporting completion", () => {
    const onEnded = vi.fn();
    const { container } = render(
      <VideoPlayer
        asset={{ key: "video", url: "https://example.com/ad.mp4", loop: true }}
        onEnded={onEnded}
      />,
    );
    const video = getVideo(container);
    expect(video).toHaveAttribute("src", "https://example.com/ad.mp4");
    expect(video.autoplay).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    fireEvent.ended(video);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("keeps legacy videos non-looping and reports their natural end", () => {
    const onEnded = vi.fn();
    const { container } = render(
      <VideoPlayer asset={{ key: "goal.mp4" }} onEnded={onEnded} />,
    );
    const video = getVideo(container);
    expect(video).toHaveAttribute("src", "goal.mp4");
    expect(video.autoplay).toBe(true);
    expect(video.loop).toBe(false);
    expect(video.muted).toBe(false);
    fireEvent.ended(video);
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it("does not autoplay thumbnails or allow them to report completion", () => {
    const onEnded = vi.fn();
    const { container } = render(
      <VideoPlayer asset={{ key: "ad.mp4" }} thumbnail onEnded={onEnded} />,
    );
    const video = getVideo(container);
    expect(video.autoplay).toBe(false);
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("preload", "metadata");
    fireEvent.ended(video);
    expect(onEnded).not.toHaveBeenCalled();
  });
});
