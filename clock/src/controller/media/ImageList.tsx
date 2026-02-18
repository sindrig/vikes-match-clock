import React, { useEffect, useState } from "react";
import { storageHelpers, StorageReference, ListResult } from "../../firebase";
import { useController } from "../../contexts/FirebaseStateContext";
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

interface ImageListProps {
  prefix: string;
  displayNow: boolean;
  allowEdit: boolean;
  appendPrefix: (prefix: string) => void;
  ts: number | null;
}

const ImageList: React.FC<ImageListProps> = ({
  prefix,
  displayNow,
  allowEdit,
  appendPrefix,
  ts,
}) => {
  const { renderAsset, addAssets } = useController();
  const [images, setImages] = useState<ImageData[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);

  const deleteImage = (refPath: string): Promise<void> =>
    storageHelpers.deleteObject(refPath).then(() => {
      setImages(images.filter((img) => img.ref !== refPath));
    });

  const deleteFolder = (refPath: string): Promise<void> => {
    return deleteImage(refPath).then(() => appendPrefix(".."));
  };

  useEffect(() => {
    void storageHelpers.listAll(prefix).then((res: ListResult) => {
      void Promise.all(
        res.items.map((itemRef: StorageReference) =>
          storageHelpers.getDownloadURL(itemRef.fullPath),
        ),
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
                onClick={() => void deleteFolder(ref)}
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
                  <button onClick={() => void deleteImage(ref)}>Eyða</button>
                </div>
              ) : null}
            </div>
          ),
        )}
      </div>
    </React.Fragment>
  );
};

export default ImageList;
