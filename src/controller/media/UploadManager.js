import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { storage } from "../../firebase";
import Compress from "compress.js";

const compress = new Compress();
const UploadManager = ({ prefix }) => {
  const [images, setImages] = useState([]);
  const [imageUrls, setImageUrls] = useState([]);
  const upload = () => {
    images.forEach((image) => {
      storage
        .ref(`/${prefix}/${image.name}`)
        .put(image)
        .on("state_changed", setImages([]), alert);
    });
  };

  const insertImages = (e) => {
    const files = [...e.target.files];
    Promise.all(
      files.map((file) =>
        compress
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
            resized.name = resizedImage.alt;
            return resized;
          })
      )
    )
      .then((resizedImages) =>
        resizedImages.map((r, i) => {
          r.name = files[i].name;
          return r;
        })
      )
      .then(setImages);
  };

  useEffect(() => {
    if (images) {
      setImageUrls(images.map((image) => URL.createObjectURL(image)));
    }
  }, [images]);

  return (
    <div className="control-item withborder">
      <input type="file" onChange={insertImages} multiple accespt="image/*" />
      {imageUrls.map((imageUrl) => (
        <img src={imageUrl} key={imageUrl} alt={imageUrl} />
      ))}
      <button onClick={upload}>Upload</button>
    </div>
  );
};
UploadManager.propTypes = {
  prefix: PropTypes.string,
};
export default UploadManager;
