import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListResult, storageHelpers } from "../../firebase";
import { Asset } from "../../types";
import ImageList from "./ImageList";

vi.mock("../../firebase", () => ({
  storageHelpers: {
    listAll: vi.fn(),
    getDownloadURL: vi.fn(),
    deleteObject: vi.fn(),
  },
}));

describe("ImageList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storageHelpers.listAll).mockResolvedValue({
      items: ["sponsor.mp4", "sponsor.MP4", "photo.jpg"].map((name) => ({
        name,
        fullPath: `venue/images/${name}`,
      })),
      prefixes: [],
    } as unknown as ListResult);
    vi.mocked(storageHelpers.getDownloadURL).mockImplementation((path) =>
      Promise.resolve(`https://example.com/${path}`),
    );
  });

  const renderList = (onAddAssets = vi.fn()) =>
    render(
      <ImageList
        prefix="venue/images"
        allowEdit
        appendPrefix={vi.fn()}
        ts={null}
        onAddAssets={onAddAssets}
      />,
    );

  it("renders silent non-playing MP4 thumbnails and ordinary image thumbnails", async () => {
    renderList();
    const video = await screen.findByLabelText<HTMLVideoElement>("sponsor.MP4");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(false);
    expect(video.playsInline).toBe(true);
    expect(screen.getByAltText("photo.jpg")).toHaveAttribute(
      "src",
      "https://example.com/venue/images/photo.jpg",
    );
    expect(screen.queryByAltText("sponsor.MP4")).not.toBeInTheDocument();
  });

  it.each(["sponsor.mp4", "sponsor.MP4"])(
    "selects %s as a looping VIDEO asset",
    async (name) => {
      const onAddAssets = vi.fn<(assets: Asset[]) => void>();
      renderList(onAddAssets);
      fireEvent.click(await screen.findByLabelText(name));

      expect(onAddAssets.mock.calls[0]?.[0]).toMatchObject([
        {
          url: `https://example.com/venue/images/${name}`,
          type: "VIDEO",
          loop: true,
        },
      ]);
      expect(onAddAssets.mock.calls[0]?.[0][0]?.key).toEqual(
        expect.any(String),
      );
    },
  );

  it("preserves image asset selection without adding video settings", async () => {
    const onAddAssets = vi.fn<(assets: Asset[]) => void>();
    renderList(onAddAssets);
    fireEvent.click(await screen.findByAltText("photo.jpg"));
    expect(onAddAssets.mock.calls[0]?.[0]).toMatchObject([
      {
        url: "https://example.com/venue/images/photo.jpg",
        type: "IMAGE",
      },
    ]);
    expect(onAddAssets.mock.calls[0]?.[0][0]).not.toHaveProperty("loop");
  });
});
