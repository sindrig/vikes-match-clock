import React, { useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { Nav } from "rsuite";
import UploadManager from "./UploadManager";
import ImageList from "./ImageList";
import { IMAGE_TYPES } from ".";

const MediaManager = ({ auth }) => {
  const [tab, setTab] = useState(IMAGE_TYPES.images);
  const [prefix, setPrefix] = useState("");
  const [ts, setTs] = useState(null);
  const [displayNow, setDisplayNow] = useState(true);
  const selectTab = (tab) => {
    setPrefix("");
    setTab(tab);
  };
  const appendPrefix = (newPrefix) => {
    if (newPrefix === "..") {
      setPrefix(prefix.slice(0, prefix.lastIndexOf("/")));
    } else {
      setPrefix(`${prefix}/${newPrefix}`);
    }
  };
  const refresh = () => {
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
        <UploadManager prefix={`${tab}${prefix}`} refresh={refresh} />
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
        prefix={`${tab}${prefix}`}
        appendPrefix={appendPrefix}
        displayNow={displayNow}
        allowEdit={!auth.isEmpty}
        ts={ts}
      />
    </div>
  );
};

MediaManager.propTypes = {
  auth: PropTypes.shape({
    isEmpty: PropTypes.bool,
  }).isRequired,
};

const stateToProps = ({ firebase: { auth } }) => ({
  auth,
});

export default connect(stateToProps)(MediaManager);
