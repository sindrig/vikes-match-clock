import React, { useEffect, useState } from "react";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { storage } from "../../firebase";
import controllerActions from "../../actions/controller";
import assetTypes from "../asset/AssetTypes";

import "./ImageList.css";

const ImageList = ({ prefix, renderAsset, displayNow, addAssets }) => {
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
            })),
          );
        },
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
              onClick={() => {
                const asset = {
                  // To be able to add the same imagem multiple times to the queue,
                  // we need to make the key unique
                  key: imageUrl + Date.now(),
                  url: imageUrl,
                  type: assetTypes.IMAGE,
                };
                if (displayNow) {
                  renderAsset({ asset });
                } else {
                  addAssets([asset]);
                }
              }}
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
  prefix: PropTypes.string.isRequired,
  renderAsset: PropTypes.func.isRequired,
  addAssets: PropTypes.func.isRequired,
  displayNow: PropTypes.bool.isRequired,
};

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      renderAsset: controllerActions.renderAsset,
      addAssets: controllerActions.addAssets,
    },
    dispatch,
  );

export default connect(() => ({}), dispatchToProps)(ImageList);
