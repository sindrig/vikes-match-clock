import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { storage } from "../../firebase";
import "./ImageList.css";

const ImageList = ({ prefix }) => {
  const [images, setImages] = useState([]);

  const deleteImage = (ref) => {
    storage
      .ref(ref)
      .delete()
      .then(() => {
        setImages(images.filter((img) => img.ref !== ref));
      });
  };

  useEffect(() => {
    const listRef = storage.ref(prefix);
    listRef.listAll().then((res) => {
      Promise.all(res.items.map((itemRef) => itemRef.getDownloadURL())).then(
        (downloadUrls) => {
          setImages(
            res.items.map((item, i) => ({
              name: item.name,
              imageUrl: downloadUrls[i],
              ref: item.fullPath,
            }))
          );
        }
      );
    });
  }, [prefix]);
  return (
    <div className="control-item image-list">
      {images.map(({ imageUrl, name, ref }) => (
        <div className="asset-image withborder" key={name}>
          <div>
            <img src={imageUrl} alt={name} />
          </div>
          <div>
            <span>{name}</span>
          </div>
          <div>
            <button onClick={() => deleteImage(ref)}>Eyða</button>
          </div>
        </div>
      ))}
    </div>
  );
};
ImageList.propTypes = {
  prefix: PropTypes.string,
};
export default ImageList;
