import React, { useCallback, useState } from "react";
import { Nav } from "rsuite";
import UploadManager from "./UploadManager";
import ImageList from "./ImageList";
import { IMAGE_TYPES } from ".";
import { useLocalState } from "../../contexts/LocalStateContext";
import { useController } from "../../contexts/FirebaseStateContext";
import { Asset } from "../../types";
import QueuePicker from "../asset/queue/QueuePicker";

const MediaManager: React.FC = () => {
  const { auth, listenPrefix } = useLocalState();
  const { controller, createQueue, addItemsToQueue, showItemNow } =
    useController();
  const { queues } = controller;
  const [tab, setTab] = useState<string>(IMAGE_TYPES.images);
  const finalTab = `${String(listenPrefix) === "safamyri" ? "fotbolti" : String(listenPrefix)}/${String(tab)}`;
  const [prefix, setPrefix] = useState<string>("");
  const [ts, setTs] = useState<number | null>(null);
  const [pendingAssets, setPendingAssets] = useState<Asset[]>([]);
  const selectTab = (tab: string): void => {
    setPrefix("");
    setTab(tab);
  };
  const appendPrefix = (newPrefix: string): void => {
    if (newPrefix === "..") {
      setPrefix(String(prefix).slice(0, String(prefix).lastIndexOf("/")));
    } else {
      setPrefix(`${String(prefix)}/${String(newPrefix)}`);
    }
  };
  const refresh = (): void => {
    // How stupid is this? sorry
    [2, 3, 5, 6].forEach((i) => setTimeout(() => setTs(Date.now()), 500 * i));
  };
  const handleAddAssets = (assets: Asset[]): void => {
    setPendingAssets(assets);
  };

  const handleShowNow = useCallback(
    (assets: Asset[]) => {
      for (const asset of assets) {
        showItemNow(asset);
      }
      setPendingAssets([]);
    },
    [showItemNow],
  );

  const handleAddToQueue = useCallback(
    (queueId: string, assets: Asset[]) => {
      addItemsToQueue(queueId, assets);
      setPendingAssets([]);
    },
    [addItemsToQueue],
  );

  const handleCreateAndAdd = useCallback(
    (queueName: string, assets: Asset[]) => {
      const newQueueId = createQueue(queueName);
      addItemsToQueue(newQueueId, assets);
      setPendingAssets([]);
    },
    [createQueue, addItemsToQueue],
  );

  return (
    <div className="control-item withborder">
      <Nav appearance="tabs" onSelect={selectTab} activeKey={tab}>
        <Nav.Item eventKey={IMAGE_TYPES.images}>Myndir</Nav.Item>
        <Nav.Item eventKey={IMAGE_TYPES.largeAds}>Augl (stórar)</Nav.Item>
        <Nav.Item eventKey={IMAGE_TYPES.smallAds}>Augl (litlar)</Nav.Item>
        <Nav.Item eventKey={IMAGE_TYPES.players}>Leikmenn</Nav.Item>
      </Nav>
      {!auth.isEmpty && (
        <UploadManager
          prefix={`${String(finalTab)}${String(prefix)}`}
          refresh={refresh}
        />
      )}
      <ImageList
        prefix={`${String(finalTab)}${String(prefix)}`}
        appendPrefix={appendPrefix}
        allowEdit={!auth.isEmpty}
        ts={ts}
        onAddAssets={handleAddAssets}
      />
      {pendingAssets.length > 0 && (
        <QueuePicker
          queues={queues}
          assets={pendingAssets}
          onShowNow={handleShowNow}
          onAddToQueue={handleAddToQueue}
          onCreateAndAdd={handleCreateAndAdd}
          onClose={() => setPendingAssets([])}
        />
      )}
    </div>
  );
};

export default MediaManager;
