import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storageHelpers } from "../../firebase";
import UploadManager from "./UploadManager";

const { compressFile } = vi.hoisted(() => ({ compressFile: vi.fn() }));

vi.mock("compress.js", () => ({
  default: class {
    compress = compressFile;
  },
}));

vi.mock("../../firebase", () => ({
  storageHelpers: { uploadBytes: vi.fn(), uploadString: vi.fn() },
}));

vi.mock("react-drag-drop-files", () => ({
  FileUploader: ({
    handleChange,
    types,
    disabled,
  }: {
    handleChange: (files: File | File[] | FileList) => void;
    types: string[];
    disabled: boolean;
  }) => (
    <input
      type="file"
      aria-label="Upload files"
      accept={types.join(",")}
      disabled={disabled}
      onChange={(event) => handleChange(event.target.files ?? [])}
    />
  ),
}));

describe("UploadManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storageHelpers.uploadBytes).mockResolvedValue(
      {} as Awaited<ReturnType<typeof storageHelpers.uploadBytes>>,
    );
  });

  it("offers MP4 only when video uploads are enabled", () => {
    const { rerender } = render(
      <UploadManager prefix="venue/images" refresh={vi.fn()} />,
    );
    expect(screen.getByLabelText("Upload files")).toHaveAttribute(
      "accept",
      "JPG,PNG,GIF",
    );

    rerender(
      <UploadManager prefix="venue/images" refresh={vi.fn()} allowVideo />,
    );
    expect(screen.getByLabelText("Upload files")).toHaveAttribute(
      "accept",
      "JPG,PNG,GIF,MP4",
    );
  });

  it.each(["video/mp4", ""])(
    "uploads original MP4 bytes with compression enabled and MIME type '%s'",
    async (type) => {
      const refresh = vi.fn();
      const file = new File(["original video"], "sponsor.MP4", { type });
      render(
        <UploadManager prefix="venue/images" refresh={refresh} allowVideo />,
      );
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.change(screen.getByLabelText("Upload files"), {
        target: { files: [file] },
      });

      await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
      expect(compressFile).not.toHaveBeenCalled();
      expect(storageHelpers.uploadBytes).toHaveBeenCalledWith(
        "/venue/images/sponsor.MP4",
        file,
        { cacheControl: "public, max-age=604800", contentType: "video/mp4" },
      );
    },
  );

  it("compresses only still images in a mixed upload", async () => {
    const refresh = vi.fn();
    const image = new File(["image"], "photo.jpg", { type: "image/jpeg" });
    const compressed = new File(["compressed"], "photo.jpg", {
      type: "image/jpeg",
    });
    const gif = new File(["animation"], "animation.gif", { type: "image/gif" });
    const video = new File(["video"], "sponsor.mp4", { type: "video/mp4" });
    compressFile.mockResolvedValue(compressed);
    render(
      <UploadManager prefix="venue/images" refresh={refresh} allowVideo />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Upload files"), {
      target: { files: [image, gif, video] },
    });

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(compressFile).toHaveBeenCalledExactlyOnceWith(image, {
      quality: 1,
      maxWidth: 240,
      maxHeight: 176,
    });
    expect(storageHelpers.uploadBytes).toHaveBeenCalledWith(
      "/venue/images/photo.jpg",
      compressed,
      expect.any(Object),
    );
    expect(storageHelpers.uploadBytes).toHaveBeenCalledWith(
      "/venue/images/animation.gif",
      gif,
      expect.any(Object),
    );
    expect(storageHelpers.uploadBytes).toHaveBeenCalledWith(
      "/venue/images/sponsor.mp4",
      video,
      expect.objectContaining({ contentType: "video/mp4" }),
    );
  });

  it("accepts a single File", async () => {
    const refresh = vi.fn();
    const file = new File(["video"], "single.mp4", { type: "video/mp4" });
    render(
      <UploadManager prefix="venue/images" refresh={refresh} allowVideo />,
    );
    fireEvent.change(screen.getByLabelText("Upload files"), {
      target: { files: file },
    });

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(storageHelpers.uploadBytes).toHaveBeenCalledWith(
      "/venue/images/single.mp4",
      file,
      expect.any(Object),
    );
  });

  it("waits for all uploads and reports partial failure without hiding successful uploads", async () => {
    const refresh = vi.fn();
    let finishUpload: (() => void) | undefined;
    vi.mocked(storageHelpers.uploadBytes)
      .mockRejectedValueOnce(new Error("Storage unavailable"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishUpload = () =>
              resolve(
                {} as Awaited<ReturnType<typeof storageHelpers.uploadBytes>>,
              );
          }),
      );
    render(
      <UploadManager prefix="venue/images" refresh={refresh} allowVideo />,
    );
    fireEvent.change(screen.getByLabelText("Upload files"), {
      target: {
        files: [new File(["a"], "a.mp4"), new File(["b"], "b.mp4")],
      },
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByLabelText("Upload files")).toBeDisabled();
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      finishUpload?.();
      await Promise.resolve();
    });

    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("Reyndu aftur");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Upload files")).not.toBeDisabled();
  });
});
