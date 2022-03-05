import React, { useEffect, useState } from "react";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { storage } from "../../firebase";
import controllerActions from "../../actions/controller";
import assetTypes from "../asset/AssetTypes";

import "./ImageList.css";

const ImageList = ({ prefix, renderAsset }) => {
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
            <img
              src={imageUrl}
              alt={name}
              onClick={() =>
                renderAsset({
                  asset: { key: imageUrl, type: assetTypes.IMAGE },
                })
              }
            />
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

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      renderAsset: controllerActions.renderAsset,
    },
    dispatch
  );

export default connect(() => {}, dispatchToProps)(ImageList);
