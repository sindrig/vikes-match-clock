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

  const insertImages = (filelist: FileList | File[]): void => {
    const files = Array.isArray(filelist) ? filelist : [...filelist];
    void Promise.all(
      files.map((file, i) =>
        file.type !== "image/gif" && doCompress
          ? compress
              .compress([file], {
                size: 2,
                quality: 1,
                maxWidth: 240,
                maxHeight: 176,
              })
              .then((resizedImage) => {
                const img = resizedImage[0];
                if (!img) {
                  return file;
                }
                const base64str = img.data;
                const imgExt = img.ext;
                const resized = Compress.convertBase64ToFile(base64str, imgExt);
                Object.defineProperty(resized, "name", {
                  value: files[i]?.name,
                  writable: true,
                });
                return resized;
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
        handleChange={insertImages}
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
