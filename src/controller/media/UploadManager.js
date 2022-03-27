import React, { useState } from "react";
import PropTypes from "prop-types";
import { storage } from "../../firebase";
import Compress from "compress.js";
import { FileUploader } from "react-drag-drop-files";

const compress = new Compress();
const fileTypes = ["JPG", "PNG", "GIF"];

const UploadManager = ({ prefix }) => {
  const [doCompress, setDoCompress] = useState(true);
  const [imageUrls, setImageUrls] = useState([]);
  const upload = (images) => {
    images.forEach((image) => {
      storage
        .ref(`/${prefix}/${image.name}`)
        .put(image)
        .on("state_changed", console.log("upload success"), alert);
    });
  };

  const insertImages = (filelist) => {
    const files = [...filelist];
    Promise.all(
      files.map((file, i) =>
        file.type !== "image/gif" && doCompress
          ? compress
              .compress([file], {
                size: 2, // the max size in MB, defaults to 2MB
                quality: 1, // the quality of the image, max is 1,
                maxWidth: 240,
                maxHeight: 176,
              })
              .then((resizedImage) => {
                const img = resizedImage[0];
                const base64str = img.data;
                const imgExt = img.ext;
                const resized = Compress.convertBase64ToFile(base64str, imgExt);
                resized.name = files[i].name;
                return resized;
              })
          : file
      )
    ).then((images) => {
      setImageUrls(images.map((image) => URL.createObjectURL(image)));
      upload(images);
    });
  };

  return (
    <div className="control-item withborder">
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

      {imageUrls.map((imageUrl) => (
        <img src={imageUrl} key={imageUrl} alt={imageUrl} />
      ))}
    </div>
  );
};
UploadManager.propTypes = {
  prefix: PropTypes.string,
};
export default UploadManager;
