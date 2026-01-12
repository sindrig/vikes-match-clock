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
}

const UploadManager: React.FC<UploadManagerProps> = ({ prefix, refresh }) => {
  const [doCompress, setDoCompress] = useState(false);

  // react-drag-drop-files v3 with multiple prop passes FileList, not File[]
  const insertImages = (fileOrFiles: File | FileList): void => {
    const files: File[] =
      fileOrFiles instanceof FileList ? Array.from(fileOrFiles) : [fileOrFiles];

    void Promise.all(
      files.map((file) =>
        file.type !== "image/gif" && doCompress
          ? compress.compress(file, {
              quality: 1,
              maxWidth: 240,
              maxHeight: 176,
            })
          : Promise.resolve(file),
      ),
    )
      .then((images) =>
        Promise.all(
          images.map((image) =>
            storageHelpers.uploadBytes(
              `/${String(prefix)}/${String(image.name)}`,
              image,
            ),
          ),
        ),
      )
      .then(refresh);
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
        handleChange={insertImages as (arg0: File | File[]) => void}
        name="file"
        types={fileTypes}
        multiple
      />
      {prefix.startsWith("images") && (
        <CreateFolder prefix={prefix} refresh={refresh} />
      )}
      <ReloadIcon onClick={refresh} className="reload" />
    </div>
  );
};

export default UploadManager;
