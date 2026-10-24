import React, { useState } from "react";
import { storageHelpers } from "../../firebase";
import Compress from "compress.js";
import { FileUploader } from "react-drag-drop-files";
import CreateFolder from "./CreateFolder";
import ReloadIcon from "@rsuite/icons/Reload";

import "./UploadManager.css";

const compress = new Compress();
const fileTypes = ["JPG", "PNG", "GIF"];

interface UploadManagerProps {
  prefix: string;
  refresh: () => void;
  allowVideo?: boolean;
}

const UploadManager: React.FC<UploadManagerProps> = ({
  prefix,
  refresh,
  allowVideo = false,
}) => {
  const [doCompress, setDoCompress] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);

  // The uploader's types declare File[], but multiple uploads deliver FileList.
  const insertMedia = (fileOrFiles: File | File[] | FileList): void => {
    const files: File[] =
      fileOrFiles instanceof File ? [fileOrFiles] : Array.from(fileOrFiles);

    setUploading(true);
    setUploadError(false);

    void Promise.allSettled(
      files.map(async (file) => {
        const isVideo = file.name.toLowerCase().endsWith(".mp4");
        const shouldCompress =
          doCompress &&
          !isVideo &&
          file.type.startsWith("image/") &&
          file.type !== "image/gif";
        const media = shouldCompress
          ? await compress.compress(file, {
              quality: 1,
              maxWidth: 240,
              maxHeight: 176,
            })
          : file;

        await storageHelpers.uploadBytes(
          `/${String(prefix)}/${String(media.name)}`,
          media,
          {
            cacheControl: "public, max-age=604800",
            ...(isVideo ? { contentType: "video/mp4" } : {}),
          },
        );
      }),
    )
      .then((results) => {
        setUploadError(results.some((result) => result.status === "rejected"));
        refresh();
      })
      .finally(() => setUploading(false));
  };

  return (
    <div className="control-item withborder upload-manager">
      <label>
        <input
          type="checkbox"
          checked={doCompress}
          onChange={(e) => setDoCompress(e.target.checked)}
        />{" "}
        Compress automatically
      </label>
      <FileUploader
        handleChange={insertMedia}
        name="file"
        types={allowVideo ? [...fileTypes, "MP4"] : fileTypes}
        multiple
        disabled={uploading}
      />
      {uploading && <p role="status">Hleð upp skrám…</p>}
      {uploadError && (
        <p role="alert">Ekki tókst að hlaða upp öllum skrám. Reyndu aftur.</p>
      )}
      {prefix.startsWith("images") && (
        <CreateFolder prefix={prefix} refresh={refresh} />
      )}
      <ReloadIcon onClick={refresh} className="reload" />
    </div>
  );
};

export default UploadManager;
