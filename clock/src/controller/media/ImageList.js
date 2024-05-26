import React, { useEffect, useState } from "react";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { storage } from "../../firebase";
import controllerActions from "../../actions/controller";
import assetTypes from "../asset/AssetTypes";
import FolderFillIcon from "@rsuite/icons/FolderFill";
import TrashIcon from "@rsuite/icons/Trash";

import "./ImageList.css";

const ImageList = ({
  prefix,
  renderAsset,
  displayNow,
  addAssets,
  allowEdit,
  appendPrefix,
  ts,
}) => {
  const [images, setImages] = useState([]);
  const [folders, setFolders] = useState([]);

  const deleteImage = (ref) =>
    storage
      .ref(ref)
      .delete()
      .then(() => {
        setImages(images.filter((img) => img.ref !== ref));
      });

  const deleteFolder = (ref) => {
    deleteImage(ref).then(() => appendPrefix(".."));
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
      setFolders(res.prefixes);
    });
  }, [prefix, ts]);
  return (
    <React.Fragment>
      <div className="control-item image-list">
        {folders.map(({ name }) => (
          <div className="asset-folder withborder" key={name}>
            <div onClick={() => appendPrefix(name)}>
              <FolderFillIcon />
              <span>{name}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="control-item image-list">
        {images.map(({ imageUrl, name, ref }) =>
          name === ".vikes" ? (
            images.length === 1 &&
            allowEdit && (
              <div
                className="asset-folder withborder"
                onClick={() => deleteFolder(ref)}
                key={name}
              >
                <TrashIcon />
                <span>Eyða {prefix}</span>
              </div>
            )
          ) : (
            <div className="asset-image withborder" key={name}>
              <div
                onClick={() => {
                  const asset = {
                    // To be able to add the same image multiple times to the queue,
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
              >
                <img src={imageUrl} alt={name} />
                <span>{name}</span>
              </div>
              {allowEdit ? (
                <div>
                  <button onClick={() => deleteImage(ref)}>Eyða</button>
                </div>
              ) : null}
            </div>
          ),
        )}
      </div>
    </React.Fragment>
  );
};
ImageList.propTypes = {
  prefix: PropTypes.string.isRequired,
  renderAsset: PropTypes.func.isRequired,
  addAssets: PropTypes.func.isRequired,
  appendPrefix: PropTypes.func.isRequired,
  displayNow: PropTypes.bool.isRequired,
  allowEdit: PropTypes.bool.isRequired,
  ts: PropTypes.any,
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
