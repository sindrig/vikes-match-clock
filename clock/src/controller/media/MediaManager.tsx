import React, { useState } from "react";
import { connect, ConnectedProps } from "react-redux";
import { Nav } from "rsuite";
import UploadManager from "./UploadManager";
import ImageList from "./ImageList";
import { IMAGE_TYPES } from ".";
import { RootState } from "../../types";

const stateToProps = ({ firebase: { auth }, remote: { listenPrefix } }: RootState) => ({
  auth,
  listenPrefix,
});

const connector = connect(stateToProps);

type MediaManagerProps = ConnectedProps<typeof connector>;

const MediaManager: React.FC<MediaManagerProps> = ({ auth, listenPrefix }) => {
  const [tab, setTab] = useState(IMAGE_TYPES.images);
  const finalTab = `${listenPrefix === "safamyri" ? "fotbolti" : listenPrefix}/${tab}`;
  const [prefix, setPrefix] = useState("");
  const [ts, setTs] = useState<number | null>(null);
  const [displayNow, setDisplayNow] = useState(true);
  const selectTab = (tab: string): void => {
    setPrefix("");
    setTab(tab);
  };
  const appendPrefix = (newPrefix: string): void => {
    if (newPrefix === "..") {
      setPrefix(prefix.slice(0, prefix.lastIndexOf("/")));
    } else {
      setPrefix(`${prefix}/${newPrefix}`);
    }
  };
  const refresh = (): void => {
    // How stupid is this? sorry
    [2, 3, 5, 6].forEach((i) => setTimeout(() => setTs(Date.now()), 500 * i));
  };
  return (
    <div className="control-item withborder">
      <Nav appearance="tabs" onSelect={selectTab} activeKey={tab}>
        <Nav.Item eventKey={IMAGE_TYPES.images}>Myndir</Nav.Item>
        <Nav.Item eventKey={IMAGE_TYPES.largeAds}>Augl (stórar)</Nav.Item>
        <Nav.Item eventKey={IMAGE_TYPES.smallAds}>Augl (litlar)</Nav.Item>
        <Nav.Item eventKey={IMAGE_TYPES.players}>Leikmenn</Nav.Item>
      </Nav>
      {!auth.isEmpty && (
        <UploadManager prefix={`${finalTab}${prefix}`} refresh={refresh} />
      )}
      <div>
        <label>
          Birta strax
          <input
            type="radio"
            checked={displayNow}
            onChange={() => setDisplayNow(true)}
          />
        </label>
        <br />
        <label>
          Setja í biðröð
          <input
            type="radio"
            checked={!displayNow}
            onChange={() => setDisplayNow(false)}
          />
        </label>
      </div>
      <ImageList
        prefix={`${finalTab}${prefix}`}
        appendPrefix={appendPrefix}
        displayNow={displayNow}
        allowEdit={!auth.isEmpty}
        ts={ts}
      />
    </div>
  );
};

export default connector(MediaManager);
