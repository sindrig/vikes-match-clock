import React, { useState } from "react";
import { Nav } from "rsuite";
import UploadManager from "./UploadManager";
import ImageList from "./ImageList";
import PerimeterMediaPairs from "./PerimeterMediaPairs";
import { IMAGE_TYPES } from ".";
import { useLocalState } from "../../contexts/LocalStateContext";
import { useController } from "../../contexts/FirebaseStateContext";
import QueuePicker from "../asset/queue/QueuePicker";
import { useQueuePickerActions } from "../asset/queue/useQueuePickerActions";

const MediaManager: React.FC = () => {
  const { auth, listenPrefix } = useLocalState();
  const { controller } = useController();
  const { queues } = controller;
  const [tab, setTab] = useState<string>(IMAGE_TYPES.images);
  const finalTab = `${String(listenPrefix) === "safamyri" ? "fotbolti" : String(listenPrefix)}/${String(tab)}`;
  const [prefix, setPrefix] = useState<string>("");
  const [ts, setTs] = useState<number | null>(null);
  const { pending, error, selectAssets } = useQueuePickerActions();
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
  return (
    <div className="control-item withborder media-manager">
      <Nav appearance="tabs" onSelect={selectTab} activeKey={tab}>
        <Nav.Item eventKey={IMAGE_TYPES.images}>Myndir</Nav.Item>
        <Nav.Item eventKey={IMAGE_TYPES.largeAds}>Augl (stórar)</Nav.Item>
        <Nav.Item eventKey={IMAGE_TYPES.smallAds}>Augl (litlar)</Nav.Item>
        <Nav.Item eventKey={IMAGE_TYPES.players}>Leikmenn</Nav.Item>
        <Nav.Item eventKey={IMAGE_TYPES.perimeterPairs}>Jaðarefni</Nav.Item>
      </Nav>
      {tab === IMAGE_TYPES.perimeterPairs ? (
        <PerimeterMediaPairs />
      ) : (
        <>
          {!auth.isEmpty && (
            <UploadManager
              prefix={`${String(finalTab)}${String(prefix)}`}
              refresh={refresh}
              allowVideo={tab === IMAGE_TYPES.images}
            />
          )}
          <ImageList
            prefix={`${String(finalTab)}${String(prefix)}`}
            appendPrefix={appendPrefix}
            allowEdit={!auth.isEmpty}
            ts={ts}
            onAddAssets={selectAssets}
          />
          {error && <p role="alert">{error}</p>}
          {pending && <QueuePicker queues={queues} {...pending} />}
        </>
      )}
    </div>
  );
};

export default MediaManager;
