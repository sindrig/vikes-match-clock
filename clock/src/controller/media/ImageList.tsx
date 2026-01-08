import React, { useEffect, useState } from "react";
import { bindActionCreators, Dispatch } from "redux";
import { connect, ConnectedProps } from "react-redux";
import { storage } from "../../firebase";
import controllerActions from "../../actions/controller";
import assetTypes from "../asset/AssetTypes";
import FolderFillIcon from "@rsuite/icons/FolderFill";
import TrashIcon from "@rsuite/icons/Trash";

import "./ImageList.css";

const AssetTypeSuffixMap: Record<string, string> = {
  mp4: assetTypes.VIDEO,
};

interface ImageData {
  name: string;
  imageUrl: string;
  ref: string;
}

interface FolderData {
  name: string;
}

interface StorageReference {
  name: string;
  fullPath: string;
  getDownloadURL(): Promise<string>;
}

interface StorageListResult {
  items: StorageReference[];
  prefixes: Array<{ name: string }>;
}

interface OwnProps {
  prefix: string;
  displayNow: boolean;
  allowEdit: boolean;
  appendPrefix: (prefix: string) => void;
  ts: number | null;
}

const dispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      renderAsset: controllerActions.renderAsset,
      addAssets: controllerActions.addAssets,
    },
    dispatch,
  );

const connector = connect(() => ({}), dispatchToProps);

type ImageListProps = ConnectedProps<typeof connector> & OwnProps;

const ImageList: React.FC<ImageListProps> = ({
  prefix,
  renderAsset,
  displayNow,
  addAssets,
  allowEdit,
  appendPrefix,
  ts,
}) => {
  const [images, setImages] = useState<ImageData[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);

  const deleteImage = (ref: string): Promise<void> =>
    storage
      .ref(ref)
      .delete()
      .then(() => {
        setImages(images.filter((img) => img.ref !== ref));
      });

  const deleteFolder = (ref: string): Promise<void> => {
    return deleteImage(ref).then(() => appendPrefix(".."));
  };

  useEffect(() => {
    const listRef = storage.ref(prefix);
    listRef.listAll().then((res: StorageListResult) => {
      Promise.all(
        res.items.map((itemRef: StorageReference) => itemRef.getDownloadURL()),
      ).then((downloadUrls) => {
        setImages(
          res.items
            .map((item: StorageReference, i: number) => ({
              name: item.name,
              imageUrl: downloadUrls[i],
              ref: item.fullPath,
            }))
            .filter((img): img is ImageData => img.imageUrl !== undefined),
        );
      });
      setFolders(res.prefixes.map((p) => ({ name: p.name })));
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
                  const parts = name.split(".");
                  const suffix = parts[parts.length - 1];
                  const type = suffix
                    ? AssetTypeSuffixMap[suffix] || assetTypes.IMAGE
                    : assetTypes.IMAGE;
                  const asset = {
                    // To be able to add the same image multiple times to the queue,
                    // we need to make the key unique
                    key: String(imageUrl) + String(Date.now()),
                    url: imageUrl,
                    type,
                  };
                  if (displayNow) {
                    renderAsset(asset);
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

export default connector(ImageList);
