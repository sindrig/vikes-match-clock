import React, { useState } from "react";
import PropTypes from "prop-types";
import { storage } from "../../firebase";

const CreateFolder = ({ prefix, refresh }) => {
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const save = () => {
    setCreating(false);
    storage
      .ref(`${prefix}/${newFolderName}/.vikes`)
      .putString("")
      .on("state_changed", null, alert, refresh);
  };
  return (
    <div className="control-item withborder">
      {creating ? (
        <div>
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
          <button onClick={save}>Save</button>
        </div>
      ) : (
        <button onClick={() => setCreating(true)}>Create folder</button>
      )}
    </div>
  );
};
CreateFolder.propTypes = {
  prefix: PropTypes.string.isRequired,
  refresh: PropTypes.func.isRequired,
};
export default CreateFolder;
